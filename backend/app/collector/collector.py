"""Coletor: descobre os arquivos pelo catálogo do TSE, faz polling com prioridade e
enfileira para o worker."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path

import orjson
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.collector.fetcher import Fetcher
from app.core.config import Settings
from app.core.db import unit_of_work
from app.infra import queue
from app.infra.realtime import topics
from app.infra.tse import jws
from app.infra.tse.catalog import Catalogo, parse_catalogo
from app.infra.tse.keys import chave_do_ambiente
from app.infra.tse.parsers import parse_acompanhamento, parse_auxiliar, parse_municipios, parse_secoes
from app.infra.tse.urls import MontadorUrls
from app.modules.alerts import evaluation as alertas
from app.modules.ballot_reports import BallotBoxReport
from app.modules.ballot_reports import demand as demanda
from app.modules.elections import Election
from app.modules.geography import GeoAreaInvalid, PollingPlace, PollingSection, parse
from app.modules.results import ingestion as ingestao

log = logging.getLogger("coletor")

UFS = [
    "ac",
    "al",
    "am",
    "ap",
    "ba",
    "ce",
    "df",
    "es",
    "go",
    "ma",
    "mg",
    "ms",
    "mt",
    "pa",
    "pb",
    "pe",
    "pi",
    "pr",
    "rj",
    "rn",
    "ro",
    "rr",
    "rs",
    "sc",
    "se",
    "sp",
    "to",
]
ARQ_MUNICIPIOS = Path(__file__).resolve().parent.parent / "data" / "municipios.json"


def agora_iso() -> str:
    return datetime.now(UTC).isoformat()


def cargos_da_uf(cargos: list[int], uf: str) -> list[int]:
    out = []
    for cd in cargos:
        if cd == 8 and uf != "df":
            continue
        if cd == 7 and uf == "df":
            continue
        out.append(cd)
    return out


class Coletor:
    def __init__(
        self,
        settings: Settings,
        sessionmaker: async_sessionmaker[AsyncSession],
        redis: Redis,
        fetcher: Fetcher | None = None,
    ) -> None:
        self.s = settings
        self.sm = sessionmaker
        self.redis = redis
        self.fetcher = fetcher or Fetcher(settings.tse_max_rps, settings.tse_concorrencia)
        self.chave = chave_do_ambiente(settings.tse_ambiente) if settings.tse_verificar_jws else None
        self.catalogo: Catalogo | None = None
        self.urls: MontadorUrls | None = None
        self.eleicoes: list[Election] = []
        self.municipios: dict[str, dict] = {}  # mid -> {"uf", "cd", "zonas": [...]}
        self.secoes_mun: dict[str, list[tuple[int, int]]] = {}
        self.ufs_secoes_carregadas: set[str] = set()
        self.estado_mun: dict[tuple[int, str], tuple] = {}
        self.estado_uf: dict[tuple[int, str], tuple] = {}
        self.secoes_feitas: set[str] = set()
        self.tentativa_sec: dict[str, float] = {}
        self.fila_mun: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.fila_sec: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.pendentes_mun: set[tuple[int, str]] = set()
        self.pendentes_sec: set[str] = set()
        self.vigiados: set[str] = set()
        self.ultima_coleta_mun: dict[tuple[int, str], float] = {}
        self.pausado = False
        self.id = uuid.uuid4().hex[:8]
        self._contador = 0

    # ------------------------------------------------------------------ utilitários
    def _ordem(self) -> int:
        self._contador += 1
        return self._contador

    def _arquivar(self, url: str, idg: str | None, corpo: bytes) -> None:
        try:
            rel = url.split("://", 1)[-1].split("/", 1)[-1]
            destino = Path(self.s.dir_brutos) / self.s.tse_ambiente / rel
            destino = destino.with_name(f"{destino.name}.{idg or int(time.time())}")
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(corpo)
        except OSError:
            pass

    async def obter(self, url_json: str, arquivar: bool = True) -> tuple[int, bytes | None, bool]:
        """Busca o .jws (verificando a assinatura) e cai para o .json se o .jws não existir."""
        if self.s.tse_usar_jws and url_json.endswith(".json"):
            url = url_json[:-5] + ".jws"
            r = await self.fetcher.get(url)
            if r.status == 200 and r.corpo is not None:
                if arquivar:
                    self._arquivar(url, r.etag, r.corpo)
                if self.chave is None:
                    return 200, jws.decodificar_sem_verificar(r.corpo.decode())[1], False
                try:
                    return 200, jws.verificar(r.corpo.decode(), self.chave), True
                except jws.ErroJWS as exc:
                    self.fetcher.metricas.falhas_jws += 1
                    self.fetcher.etags.pop(url, None)
                    log.error("JWS inválido em %s: %s", url, exc)
                    return 498, None, False
            if r.status != 404:
                return r.status, None, False
        r = await self.fetcher.get(url_json)
        if r.status == 200 and r.corpo is not None and arquivar:
            self._arquivar(url_json, r.etag, r.corpo)
        return r.status, r.corpo, False

    # ------------------------------------------------------------------ catálogo e configurações
    async def atualizar_catalogo(self) -> bool:
        url = f"{self.s.tse_base_url.rstrip('/')}/comum/config/ele-c.json"
        status, corpo, _ = await self.obter(url)
        if status == 304 or corpo is None:
            return False
        cat = parse_catalogo(orjson.loads(corpo))
        pleito = cat.pleito_atual()
        if pleito is None:
            return False
        novo = self.catalogo is None or self.catalogo.idg != cat.idg
        self.catalogo = cat
        self.urls = MontadorUrls(self.s.tse_base_url, cat.templates, pleito.ciclo, pleito.cd)
        async with unit_of_work(self.sm) as session:
            self.eleicoes = await ingestao.ingerir_catalogo(session, cat, self.s.tse_ambiente)
        if novo:
            self.fetcher.limpar_404()
            await self.carregar_municipios()
            await self.carregar_locais()
        log.info(
            "catálogo: ciclo=%s pleito=%s eleições=%s",
            pleito.ciclo,
            pleito.cd,
            [e.election_code for e in self.eleicoes],
        )
        return True

    def eleicao_do_cargo(self, turno: int, cd: int) -> Election | None:
        for e in self.eleicoes:
            if e.round == turno and any(c.office_code == cd for c in e.offices):
                return e
        return None

    async def carregar_municipios(self) -> None:
        assert self.urls is not None
        e = self.eleicao_do_cargo(1, 1) or (self.eleicoes[0] if self.eleicoes else None)
        if e is None:
            return
        _status, corpo, _ = await self.obter(self.urls.municipios(e.election_code))
        if corpo is None:
            return
        lista = parse_municipios(orjson.loads(corpo))
        coords = {
            m["ibge"]: (m["lat"], m["lon"], m["nome"]) for m in orjson.loads(ARQ_MUNICIPIOS.read_bytes())
        }
        async with unit_of_work(self.sm) as session:
            await ingestao.ingerir_municipios(session, lista, coords)
        self.municipios = {f"{m.uf}{m.cd:05d}": {"uf": m.uf, "cd": m.cd, "zonas": m.zonas} for m in lista}
        log.info("municípios carregados: %d", len(self.municipios))

    async def carregar_locais(self) -> None:
        async with self.sm() as session:
            n = (await session.execute(select(func.count()).select_from(PollingPlace))).scalar_one()
        if n > 0 or not self.s.locais_votacao_url:
            return
        r = await self.fetcher.get(self.s.locais_votacao_url, usar_etag=False)
        if r.status != 200 or not r.corpo:
            log.warning("não foi possível baixar locais de votação (%s)", r.status)
            return
        async with unit_of_work(self.sm) as session:
            total = await ingestao.importar_locais(session, ingestao.ler_csv_locais(r.corpo))
        log.info("locais de votação importados: %d", total)

    async def carregar_secoes_uf(self, uf: str) -> None:
        if uf in self.ufs_secoes_carregadas or self.urls is None:
            return
        self.ufs_secoes_carregadas.add(uf)
        _status, corpo, _ = await self.obter(self.urls.secoes(uf), arquivar=False)
        if corpo is None:
            self.ufs_secoes_carregadas.discard(uf)
            return
        lista = parse_secoes(orjson.loads(corpo))
        async with unit_of_work(self.sm) as session:
            await ingestao.ingerir_secoes(session, lista)
        for s in lista:
            self.secoes_mun.setdefault(f"{s.uf}{s.municipio:05d}", []).append((s.zona, s.secao))

    # ------------------------------------------------------------------ resultados
    async def buscar_resultado(
        self, turno: int, e: Election, cd: int, uf: str, mun: int | None = None, zona: int | None = None
    ) -> None:
        assert self.urls is not None
        url = self.urls.resultado(e.election_code, cd, uf, mun, zona)
        status, corpo, jws_ok = await self.obter(url)
        if status != 200 or corpo is None:
            return
        if uf == "br":
            nivel, rid, pai = "country", "br", ""
        elif mun is None:
            nivel, rid, pai = "state", uf, "br"
        elif zona is None:
            nivel, rid, pai = "municipality", f"{uf}{mun:05d}", uf
        else:
            nivel, rid, pai = "zone", f"{uf}{mun:05d}-z{zona:04d}", f"{uf}{mun:05d}"
        await queue.enqueue(
            self.redis,
            queue.TYPE_RESULT,
            corpo,
            round=turno,
            election_id=e.id,
            office_code=cd,
            level=nivel,
            geo_area_id=rid,
            parent_id=pai,
            state_code=uf,
            file=url,
            jws_verified=jws_ok,
            captured_at=agora_iso(),
        )

    def turnos(self) -> list[int]:
        return sorted({e.round for e in self.eleicoes})

    async def turno_publicado(self, turno: int) -> bool:
        """Evita uma enxurrada de 404 (que pode bloquear o IP): testa um arquivo sentinela antes."""
        assert self.urls is not None
        e = self.eleicao_do_cargo(turno, 1) or next((x for x in self.eleicoes if x.round == turno), None)
        if e is None:
            return False
        cd = 1 if any(c.office_code == 1 for c in e.offices) else e.offices[0].office_code
        url = self.urls.resultado(e.election_code, cd, "br" if cd == 1 else "sp")
        status, _, _ = await self.obter(url, arquivar=False)
        return status in (200, 304)

    async def ciclo_principal(self) -> None:
        tarefas = []
        for turno in self.turnos():
            if turno > 1 and not await self.turno_publicado(turno):
                continue
            for e in [x for x in self.eleicoes if x.round == turno]:
                cds = [c.office_code for c in e.offices]
                if 1 in cds:
                    tarefas.append(self.buscar_resultado(turno, e, 1, "br"))
                    for uf in [*UFS, "zz"]:
                        tarefas.append(self.buscar_resultado(turno, e, 1, uf))
                for uf in UFS:
                    for cd in cargos_da_uf([c for c in cds if c != 1], uf):
                        tarefas.append(self.buscar_resultado(turno, e, cd, uf))
        await asyncio.gather(*tarefas)

    async def ciclo_acompanhamento(self) -> None:
        assert self.urls is not None
        for turno in self.turnos():
            if turno > 1 and not await self.turno_publicado(turno):
                continue
            e = self.eleicao_do_cargo(turno, 1) or next((x for x in self.eleicoes if x.round == turno), None)
            if e is None:
                continue
            await asyncio.gather(*(self._acompanhamento(turno, e, uf) for uf in ["br", *UFS]))

    async def _acompanhamento(self, turno: int, e: Election, uf: str) -> None:
        assert self.urls is not None
        _status, corpo, _ = await self.obter(self.urls.acompanhamento(e.election_code, uf))
        if corpo is None:
            return
        await queue.enqueue(
            self.redis, queue.TYPE_TRACKING, corpo, round=turno, state_code=uf, captured_at=agora_iso()
        )
        if uf == "br":
            return
        acomp = parse_acompanhamento(orjson.loads(corpo))
        tem_mu = False
        for item in acomp.itens:
            if item.tipo == "uf":
                chave = (turno, uf)
                assinatura = (item.secoes_totalizadas, item.totalizado_em)
                if self.estado_uf.get(chave) != assinatura and item.secoes_totalizadas > 0:
                    self.estado_uf[chave] = assinatura
            elif item.tipo in ("mu", "mun", "municipio"):
                tem_mu = True
                mid = item.codigo if item.codigo[:2].isalpha() else f"{uf}{int(item.codigo):05d}"
                assinatura = (item.secoes_totalizadas, item.totalizado_em)
                if item.secoes_totalizadas > 0 and self.estado_mun.get((turno, mid)) != assinatura:
                    self.estado_mun[(turno, mid)] = assinatura
                    self.agendar_municipio(turno, mid)
        if not tem_mu:
            # TSE sem detalhamento por município no EA15: varre a UF quando ela muda
            for mid, m in self.municipios.items():
                if m["uf"] == uf:
                    self.agendar_municipio(turno, mid)

    def agendar_municipio(self, turno: int, mid: str) -> None:
        """Enfileira o município; respeita um intervalo mínimo entre coletas do mesmo município."""
        if (turno, mid) in self.pendentes_mun:
            return
        self.pendentes_mun.add((turno, mid))
        prio = 0 if mid in self.vigiados else 1
        intervalo = self.s.intervalo_min_municipio / (3 if prio == 0 else 1)
        espera = intervalo - (time.monotonic() - self.ultima_coleta_mun.get((turno, mid), -1e9))
        item = (prio, self._ordem(), turno, mid)
        if espera > 0:
            asyncio.get_running_loop().call_later(espera, self.fila_mun.put_nowait, item)
        else:
            self.fila_mun.put_nowait(item)

    async def processar_municipio(self, turno: int, mid: str) -> None:
        self.ultima_coleta_mun[(turno, mid)] = time.monotonic()
        m = self.municipios.get(mid)
        if m is None:
            return
        uf, cd_mun = m["uf"], m["cd"]
        tarefas = []
        for e in [x for x in self.eleicoes if x.round == turno]:
            cds = cargos_da_uf([c.office_code for c in e.offices], uf)
            for cd in cds:
                tarefas.append(self.buscar_resultado(turno, e, cd, uf, cd_mun))
                if self.s.coletar_zonas and len(m["zonas"]) > 1:
                    for z in m["zonas"]:
                        tarefas.append(self.buscar_resultado(turno, e, cd, uf, cd_mun, z))
        await asyncio.gather(*tarefas)
        if self.s.coletar_secoes and self.s.modo_secoes == "todas":
            await self.carregar_secoes_uf(uf)
            prio = 0 if mid in self.vigiados else 2
            for zona, secao in self.secoes_mun.get(mid, []):
                sid = f"{mid}-z{zona:04d}-s{secao:04d}"
                if sid in self.secoes_feitas or sid in self.pendentes_sec:
                    continue
                self.pendentes_sec.add(sid)
                self.fila_sec.put_nowait((prio, self._ordem(), turno, uf, cd_mun, zona, secao))

    async def processar_secao(self, turno: int, uf: str, cd_mun: int, zona: int, secao: int) -> None:
        assert self.urls is not None
        sid = f"{uf}{cd_mun:05d}-z{zona:04d}-s{secao:04d}"
        self.tentativa_sec[sid] = time.monotonic()
        url = self.urls.auxiliar_secao(uf, cd_mun, zona, secao)
        r = await self.fetcher.get(url)
        if r.status != 200 or not r.corpo:
            return
        aux = parse_auxiliar(orjson.loads(r.corpo))
        urna = aux.urna_totalizada()
        if urna is None:
            return
        nome = urna.nome_bu()
        assert nome is not None
        url_bu = self.urls.arquivo_urna(uf, cd_mun, zona, secao, urna.hash, nome)
        rb = await self.fetcher.get(url_bu, usar_etag=False)
        if rb.status != 200 or not rb.corpo:
            return
        self._arquivar(url_bu, urna.hash[:16], rb.corpo)
        self.secoes_feitas.add(sid)
        await queue.enqueue(
            self.redis,
            queue.TYPE_BALLOT,
            rb.corpo,
            round=turno,
            state_code=uf,
            hash=urna.hash,
            status=urna.status,
            tallied_at=urna.recebido_em.isoformat() if urna.recebido_em else None,
            url=url_bu,
        )

    async def ciclo_sob_demanda(self) -> None:
        """Enfileira só os boletins dos locais/seções abertos no dashboard ou com alerta de "local apurado".

        Seção com boletim já gravado no banco não é baixada de novo. Seção ainda não totalizada é
        tentada de novo enquanto alguém estiver olhando, respeitando um intervalo mínimo.
        """
        if not self.s.coletar_secoes or self.s.modo_secoes != "sob_demanda":
            return
        turnos = set(self.turnos())
        pedidos = await demanda.pending(self.redis)
        async with self.sm() as session:
            for a in await alertas.ativos(session):
                p = a.params or {}
                if a.type == "polling_place_tallied" and p.get("polling_place_id"):
                    pedidos.add((int(p.get("round", 1)), "polling_place", str(p["polling_place_id"])))
            secoes: dict[int, set[str]] = defaultdict(set)
            locais: dict[str, set[int]] = defaultdict(set)
            for turno, nivel, rid in pedidos:
                if turno not in turnos:
                    continue
                if nivel == "section":
                    secoes[turno].add(rid)
                elif nivel == "polling_place":
                    locais[rid].add(turno)
            if locais:
                for lid, sid in await session.execute(
                    select(PollingSection.polling_place_id, PollingSection.id).where(
                        PollingSection.polling_place_id.in_(locais)
                    )
                ):
                    for turno in locais[lid]:
                        secoes[turno].add(sid)
            feitas = {
                (turno, sid)
                for turno, ids in secoes.items()
                if ids
                for sid in (
                    await session.execute(
                        select(BallotBoxReport.polling_section_id).where(
                            BallotBoxReport.round == turno, BallotBoxReport.polling_section_id.in_(ids)
                        )
                    )
                ).scalars()
            }
        intervalo = self.s.intervalo_min_municipio / 3
        agora = time.monotonic()
        for turno, ids in secoes.items():
            for sid in ids:
                if (turno, sid) in feitas or sid in self.secoes_feitas or sid in self.pendentes_sec:
                    continue
                if agora - self.tentativa_sec.get(sid, -1e9) < intervalo:
                    continue
                try:
                    r = parse(sid)
                except GeoAreaInvalid:
                    continue
                if (
                    r.level != "section"
                    or r.uf is None
                    or r.municipality is None
                    or r.zone is None
                    or r.section is None
                ):
                    continue
                self.pendentes_sec.add(sid)
                self.fila_sec.put_nowait((0, self._ordem(), turno, r.uf, r.municipality, r.zone, r.section))

    # ------------------------------------------------------------------ laços
    async def _laco(self, nome: str, intervalo: float, fn: Callable[[], Awaitable[None]]) -> None:
        while True:
            inicio = time.monotonic()
            if not self.pausado and self.urls is not None:
                try:
                    await fn()
                except Exception:
                    log.exception("falha no laço %s", nome)
            await asyncio.sleep(max(0.5, intervalo - (time.monotonic() - inicio)))

    async def _consumir_municipios(self) -> None:
        while True:
            _, _, turno, mid = await self.fila_mun.get()
            self.pendentes_mun.discard((turno, mid))
            while self.pausado:
                await asyncio.sleep(1)
            try:
                await self.processar_municipio(turno, mid)
            except Exception:
                log.exception("falha no município %s", mid)

    async def _consumir_secoes(self) -> None:
        while True:
            _, _, turno, uf, cd_mun, zona, secao = await self.fila_sec.get()
            sid = f"{uf}{cd_mun:05d}-z{zona:04d}-s{secao:04d}"
            self.pendentes_sec.discard(sid)
            while self.pausado:
                await asyncio.sleep(1)
            try:
                await self.processar_secao(turno, uf, cd_mun, zona, secao)
            except Exception:
                log.exception("falha na seção %s", sid)

    async def _atualizar_vigiados(self) -> None:
        while True:
            try:
                vig: set[str] = set()
                for t in await topics.active(self.redis):
                    for parte in t.split(":"):
                        if len(parte) >= 7 and parte[:2].isalpha() and parte[2:7].isdigit():
                            vig.add(parte[:7])
                self.vigiados = vig
                self.pausado = bool(await self.redis.get("collector:paused"))
            except Exception:
                log.exception("falha ao ler tópicos ativos")
            await asyncio.sleep(5)

    async def _metricas(self) -> None:
        while True:
            m = self.fetcher.metricas
            dados = {
                "requests_per_second": m.req_por_seg(),
                "status": {str(k): v for k, v in m.por_status.items()},
                "network_errors": m.erros_rede,
                "jws_failures": m.falhas_jws,
                "municipality_queue": self.fila_mun.qsize(),
                "section_queue": self.fila_sec.qsize(),
                "sections_collected": len(self.secoes_feitas),
                "municipalities": len(self.municipios),
                "section_mode": self.s.modo_secoes,
                "watched": len(self.vigiados),
                "paused": self.pausado,
                "environment": self.s.tse_ambiente,
                "base_url": self.s.tse_base_url,
                "max_rps": self.s.tse_max_rps,
                "updated_at": agora_iso(),
                "leader": self.id,
            }
            with contextlib.suppress(Exception):
                await self.redis.set("collector:metrics", orjson.dumps(dados), ex=60)
                await self.redis.set("collector:last_collection", agora_iso(), ex=3600)
            await asyncio.sleep(3)

    async def _aguardar_lideranca(self) -> None:
        while not await self.redis.set("collector:leader", self.id, nx=True, ex=30):
            if (await self.redis.get("collector:leader") or b"").decode() == self.id:
                break
            log.info("outro coletor é líder; aguardando")
            await asyncio.sleep(10)

    async def _renovar_lideranca(self) -> None:
        while True:
            await asyncio.sleep(10)
            await self.redis.set("collector:leader", self.id, ex=30)

    async def executar(self) -> None:
        await self._aguardar_lideranca()
        while self.urls is None:
            try:
                await self.atualizar_catalogo()
            except Exception:
                log.exception("falha ao carregar catálogo")
            if self.urls is None:
                await asyncio.sleep(5)
        n_mun = int(os.getenv("COLETOR_WORKERS_MUNICIPIO", "8"))
        n_sec = int(os.getenv("COLETOR_WORKERS_SECAO", "16"))
        tarefas = [
            self._renovar_lideranca(),
            self._metricas(),
            self._atualizar_vigiados(),
            self._laco("catalogo", self.s.intervalo_catalogo, self.atualizar_catalogo),
            self._laco("principal", self.s.intervalo_principal, self.ciclo_principal),
            self._laco("acompanhamento", self.s.intervalo_acompanhamento, self.ciclo_acompanhamento),
            self._laco("sob_demanda", 3, self.ciclo_sob_demanda),
            *(self._consumir_municipios() for _ in range(n_mun)),
            *(self._consumir_secoes() for _ in range(n_sec)),
        ]
        await asyncio.gather(*tarefas)
