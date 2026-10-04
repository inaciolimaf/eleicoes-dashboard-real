"""Coletor: descobre os arquivos pelo catálogo do TSE, faz polling com prioridade e enfileira para o worker."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import orjson
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.collector.fetcher import Fetcher
from app.core.config import Settings
from app.models import Boletim, Eleicao, LocalVotacao, Secao
from app.realtime import topicos
from app.services import alertas, demanda, ingestao
from app.services.recortes import RecorteInvalido, parse
from app.tse import jws
from app.tse.catalogo import Catalogo, parse_catalogo
from app.tse.chaves import chave_do_ambiente
from app.tse.parsers import parse_acompanhamento, parse_auxiliar, parse_municipios, parse_secoes
from app.tse.urls import MontadorUrls
from app.worker import fila

log = logging.getLogger("coletor")

UFS = ["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa", "pb", "pe", "pi", "pr", "rj",
       "rn", "ro", "rr", "rs", "sc", "se", "sp", "to"]
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
    def __init__(self, settings: Settings, sessionmaker: async_sessionmaker[AsyncSession], redis: Redis,
                 fetcher: Fetcher | None = None):
        self.s = settings
        self.sm = sessionmaker
        self.redis = redis
        self.fetcher = fetcher or Fetcher(settings.tse_max_rps, settings.tse_concorrencia)
        self.chave = chave_do_ambiente(settings.tse_ambiente) if settings.tse_verificar_jws else None
        self.catalogo: Catalogo | None = None
        self.urls: MontadorUrls | None = None
        self.eleicoes: list[Eleicao] = []
        self.municipios: dict[str, dict] = {}  # mid -> {"uf", "cd", "zonas": [...]}
        self.secoes_mun: dict[str, list[tuple[int, int]]] = {}
        self.ufs_secoes_carregadas: set[str] = set()
        self.estado_mun: dict[tuple[int, str], tuple] = {}
        self.estado_uf: dict[tuple[int, str], tuple] = {}
        self.secoes_feitas: dict[str, float] = {}
        self.tentativa_sec: dict[str, float] = {}
        self.fila_mun: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.fila_sec: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.pendentes_mun: set[tuple[int, str]] = set()
        self.pendentes_sec: set[str] = set()
        self.vigiados: set[str] = set()
        self.ultima_coleta_mun: dict[tuple[int, str], float] = {}
        self.pausado = False
        self.jws_desligado = False
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

    async def obter(self, url_json: str, arquivar: bool = True, alta: bool = True) -> tuple[int, bytes | None, bool]:
        """Busca o .jws (verificando a assinatura) e cai para o .json se o .jws não existir."""
        if self.s.tse_usar_jws and not self.jws_desligado and url_json.endswith(".json"):
            url = url_json[:-5] + ".jws"
            r = await self.fetcher.get(url, alta=alta)
            if r.status == 200 and r.corpo is not None:
                if arquivar:
                    self._arquivar(url, r.etag, r.corpo)
                if self.chave is None:
                    return 200, jws.decodificar_sem_verificar(r.corpo.decode())[1], False
                try:
                    return 200, jws.verificar(r.corpo.decode(), self.chave), True
                except jws.ErroJWS as exc:
                    # Chave/kid diferente da esperada: em vez de descartar o resultado (e o site parar de
                    # atualizar), passa a usar o .json, sem a marca de verificado.
                    self.fetcher.metricas.falhas_jws += 1
                    self.fetcher.etags.pop(url, None)
                    self.jws_desligado = True
                    log.error("JWS inválido em %s: %s — coletando pelo .json sem verificar assinatura", url, exc)
            elif r.status != 404:
                return r.status, None, False
        r = await self.fetcher.get(url_json, alta=alta)
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
        async with self.sm() as session:
            self.eleicoes = await ingestao.ingerir_catalogo(session, cat, self.s.tse_ambiente)
        if novo:
            self.fetcher.limpar_404()
            await self.carregar_municipios()
            await self.carregar_locais()
        log.info("catálogo: ciclo=%s pleito=%s eleições=%s", pleito.ciclo, pleito.cd, [e.cd_eleicao for e in self.eleicoes])
        return True

    def eleicao_do_cargo(self, turno: int, cd: int) -> Eleicao | None:
        for e in self.eleicoes:
            if e.turno == turno and any(c.cd_cargo == cd for c in e.cargos):
                return e
        return None

    async def carregar_municipios(self) -> None:
        assert self.urls is not None
        e = self.eleicao_do_cargo(1, 1) or (self.eleicoes[0] if self.eleicoes else None)
        if e is None:
            return
        status, corpo, _ = await self.obter(self.urls.municipios(e.cd_eleicao))
        if corpo is None:
            return
        lista = parse_municipios(orjson.loads(corpo))
        coords = {m["ibge"]: (m["lat"], m["lon"], m["nome"]) for m in orjson.loads(ARQ_MUNICIPIOS.read_bytes())}
        async with self.sm() as session:
            await ingestao.ingerir_municipios(session, lista, coords)
        self.municipios = {f"{m.uf}{m.cd:05d}": {"uf": m.uf, "cd": m.cd, "zonas": m.zonas} for m in lista}
        log.info("municípios carregados: %d", len(self.municipios))

    async def carregar_locais(self) -> None:
        async with self.sm() as session:
            n = (await session.execute(select(func.count()).select_from(LocalVotacao))).scalar_one()
        if n > 0 or not self.s.locais_votacao_url:
            return
        r = await self.fetcher.get(self.s.locais_votacao_url, usar_etag=False)
        if r.status != 200 or not r.corpo:
            log.warning("não foi possível baixar locais de votação (%s)", r.status)
            return
        async with self.sm() as session:
            total = await ingestao.importar_locais(session, ingestao.ler_csv_locais(r.corpo))
        log.info("locais de votação importados: %d", total)

    async def carregar_secoes_uf(self, uf: str) -> None:
        if uf in self.ufs_secoes_carregadas or self.urls is None:
            return
        self.ufs_secoes_carregadas.add(uf)
        status, corpo, _ = await self.obter(self.urls.secoes(uf), arquivar=False, alta=False)
        if corpo is None:
            self.ufs_secoes_carregadas.discard(uf)
            return
        lista = parse_secoes(orjson.loads(corpo))
        async with self.sm() as session:
            await ingestao.ingerir_secoes(session, lista)
        for s in lista:
            self.secoes_mun.setdefault(f"{s.uf}{s.municipio:05d}", []).append((s.zona, s.secao))

    # ------------------------------------------------------------------ resultados
    async def buscar_resultado(self, turno: int, e: Eleicao, cd: int, uf: str, mun: int | None = None,
                               zona: int | None = None) -> None:
        assert self.urls is not None
        url = self.urls.resultado(e.cd_eleicao, cd, uf, mun, zona)
        # Brasil/UF e municípios abertos no dashboard passam na frente (no limite de requisições e na fila)
        alta = mun is None or f"{uf}{mun:05d}" in self.vigiados
        status, corpo, jws_ok = await self.obter(url, alta=alta)
        if status != 200 or corpo is None:
            return
        if uf == "br":
            nivel, rid, pai = "br", "br", ""
        elif mun is None:
            nivel, rid, pai = "uf", uf, "br"
        elif zona is None:
            nivel, rid, pai = "municipio", f"{uf}{mun:05d}", uf
        else:
            nivel, rid, pai = "zona", f"{uf}{mun:05d}-z{zona:04d}", f"{uf}{mun:05d}"
        await fila.enfileirar(self.redis, "resultado", corpo, alta=alta, chave=url, turno=turno, eleicao_id=e.id, cd_cargo=cd, nivel=nivel,
                              recorte_id=rid, pai_id=pai, uf=uf if uf != "br" else "br", arquivo=url, jws_ok=jws_ok,
                              capturado_em=agora_iso())

    def turnos(self) -> list[int]:
        return sorted({e.turno for e in self.eleicoes})

    async def turno_publicado(self, turno: int) -> bool:
        """Evita uma enxurrada de 404 (que pode bloquear o IP): testa um arquivo sentinela antes."""
        assert self.urls is not None
        e = self.eleicao_do_cargo(turno, 1) or next((x for x in self.eleicoes if x.turno == turno), None)
        if e is None:
            return False
        cd = 1 if any(c.cd_cargo == 1 for c in e.cargos) else e.cargos[0].cd_cargo
        url = self.urls.resultado(e.cd_eleicao, cd, "br" if cd == 1 else "sp")
        status, _, _ = await self.obter(url, arquivar=False)
        return status in (200, 304)

    async def ciclo_principal(self) -> None:
        tarefas = []
        for turno in self.turnos():
            if turno > 1 and not await self.turno_publicado(turno):
                continue
            for e in [x for x in self.eleicoes if x.turno == turno]:
                cds = [c.cd_cargo for c in e.cargos]
                if 1 in cds:
                    tarefas.append(self.buscar_resultado(turno, e, 1, "br"))
                    for uf in UFS + ["zz"]:
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
            e = self.eleicao_do_cargo(turno, 1) or next((x for x in self.eleicoes if x.turno == turno), None)
            if e is None:
                continue
            await asyncio.gather(*(self._acompanhamento(turno, e, uf) for uf in ["br"] + UFS))

    async def _acompanhamento(self, turno: int, e: Eleicao, uf: str) -> None:
        assert self.urls is not None
        status, corpo, _ = await self.obter(self.urls.acompanhamento(e.cd_eleicao, uf))
        if corpo is None:
            return
        await fila.enfileirar(self.redis, "acompanhamento", corpo, alta=True, chave=f"acomp:{turno}:{uf}", turno=turno,
                              uf=uf, capturado_em=agora_iso())
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
        for e in [x for x in self.eleicoes if x.turno == turno]:
            cds = cargos_da_uf([c.cd_cargo for c in e.cargos], uf)
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
                if self._secao_feita(sid) or sid in self.pendentes_sec:
                    continue
                self.pendentes_sec.add(sid)
                self.fila_sec.put_nowait((prio, self._ordem(), turno, uf, cd_mun, zona, secao))

    async def processar_secao(self, turno: int, uf: str, cd_mun: int, zona: int, secao: int,
                              alta: bool = False) -> None:
        assert self.urls is not None
        sid = f"{uf}{cd_mun:05d}-z{zona:04d}-s{secao:04d}"
        self.tentativa_sec[sid] = time.monotonic()
        diag: dict = {"quando": agora_iso(), "turno": turno, "alta": alta}
        try:
            await self._processar_secao(turno, uf, cd_mun, zona, secao, sid, alta, diag)
        except Exception as exc:
            diag["erro"] = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            log.info("seção %s: %s", sid, diag)
            with contextlib.suppress(Exception):
                await self.redis.set(f"diag:secao:{sid}", orjson.dumps(diag), ex=3600)

    async def _processar_secao(self, turno: int, uf: str, cd_mun: int, zona: int, secao: int, sid: str, alta: bool,
                               diag: dict) -> None:
        assert self.urls is not None
        url = self.urls.auxiliar_secao(uf, cd_mun, zona, secao)
        # Sem ETag: com ele, se o BU falhasse uma vez, o auxiliar passava a voltar 304 e a seção nunca era baixada
        r = await self.fetcher.get(url, usar_etag=False, alta=alta)
        diag.update(url_aux=url, status_aux=r.status)
        if r.status != 200 or not r.corpo:
            diag["etapa"] = "auxiliar indisponível"
            return
        aux = parse_auxiliar(orjson.loads(r.corpo))
        diag["aux"] = {"st": aux.status, "urnas": [{"hash": u.hash[:16], "st": u.status, "arquivos": u.arquivos}
                                                    for u in aux.urnas]}
        urna = aux.urna_totalizada()
        if urna is None:
            diag["etapa"] = "nenhuma urna totalizada com .bu no auxiliar"
            return
        nome = urna.nome_bu()
        assert nome is not None
        url_bu = self.urls.arquivo_urna(uf, cd_mun, zona, secao, urna.hash, nome)
        rb = await self.fetcher.get(url_bu, usar_etag=False, alta=alta)
        diag.update(url_bu=url_bu, status_bu=rb.status)
        if rb.status != 200 or not rb.corpo:
            diag["etapa"] = "BU indisponível"
            return
        self._arquivar(url_bu, urna.hash[:16], rb.corpo)
        # Marca só por um tempo: se o worker falhar, a seção volta a ser tentada (o banco é a fonte da verdade)
        self.secoes_feitas[sid] = time.monotonic()
        await fila.enfileirar(self.redis, "boletim", rb.corpo, alta=alta, turno=turno, uf=uf, hash=urna.hash,
                              status=urna.status, secao_id=sid,
                              totalizado_em=urna.recebido_em.isoformat() if urna.recebido_em else None, url=url_bu)
        diag["etapa"] = "BU enviado ao worker"

    def _secao_feita(self, sid: str) -> bool:
        t = self.secoes_feitas.get(sid)
        return t is not None and (self.s.modo_secoes == "todas" or time.monotonic() - t < 120)

    async def ciclo_sob_demanda(self) -> None:
        """Enfileira só os boletins dos locais/seções abertos no dashboard ou com alerta de "local apurado".

        Seção com boletim já gravado no banco não é baixada de novo. Seção ainda não totalizada é tentada de novo
        enquanto alguém estiver olhando, respeitando um intervalo mínimo.
        """
        if not self.s.coletar_secoes or self.s.modo_secoes != "sob_demanda":
            return
        turnos = set(self.turnos())
        pedidos = await demanda.pedidos(self.redis)
        async with self.sm() as session:
            for a in await alertas.ativos(session):
                p = a.params or {}
                if a.tipo == "local_apurado" and p.get("local_id"):
                    pedidos.add((int(p.get("turno", 1)), "local", str(p["local_id"])))
            secoes: dict[int, set[str]] = defaultdict(set)
            locais: dict[str, set[int]] = defaultdict(set)
            for turno, nivel, rid in pedidos:
                if turno not in turnos:
                    continue
                if nivel == "secao":
                    secoes[turno].add(rid)
                elif nivel == "local":
                    locais[rid].add(turno)
            if locais:
                for lid, sid in await session.execute(select(Secao.local_id, Secao.id).where(Secao.local_id.in_(locais))):
                    for turno in locais[lid]:
                        secoes[turno].add(sid)
            feitas = {
                (turno, sid)
                for turno, ids in secoes.items() if ids
                for sid in (await session.execute(select(Boletim.secao_id).where(
                    Boletim.turno == turno, Boletim.secao_id.in_(ids)))).scalars()
            }
        intervalo = self.s.intervalo_min_municipio / 3
        agora = time.monotonic()
        for turno, ids in secoes.items():
            for sid in ids:
                if (turno, sid) in feitas or self._secao_feita(sid) or sid in self.pendentes_sec:
                    continue
                if agora - self.tentativa_sec.get(sid, -1e9) < intervalo:
                    continue
                try:
                    r = parse(sid)
                except RecorteInvalido:
                    continue
                if r.nivel != "secao" or r.uf is None or r.municipio is None or r.zona is None or r.secao is None:
                    continue
                self.pendentes_sec.add(sid)
                self.fila_sec.put_nowait((0, self._ordem(), turno, r.uf, r.municipio, r.zona, r.secao))

    # ------------------------------------------------------------------ laços
    async def _laco(self, nome: str, intervalo: float, fn) -> None:
        while True:
            inicio = time.monotonic()
            if not self.pausado and self.urls is not None:
                try:
                    await fn()
                except Exception:
                    log.exception("falha no laço %s", nome)
            await asyncio.sleep(max(0.5, intervalo - (time.monotonic() - inicio)))

    async def _fila_cheia(self) -> bool:
        """Freio: se o worker não está dando conta, para de baixar municípios até a fila baixar.

        Sem isso a fila do Redis cresce sem limite (e pode estourar a memória). Nada se perde: o arquivo não é
        baixado, então o ETag não muda e ele é buscado de novo quando a fila esvaziar.
        """
        try:
            return await fila.tamanho_baixa(self.redis) > self.s.fila_max
        except Exception:
            return False

    async def _consumir_municipios(self) -> None:
        while True:
            _, _, turno, mid = await self.fila_mun.get()
            self.pendentes_mun.discard((turno, mid))
            while self.pausado or (mid not in self.vigiados and await self._fila_cheia()):
                await asyncio.sleep(2)
            try:
                await self.processar_municipio(turno, mid)
            except Exception:
                log.exception("falha no município %s", mid)

    async def _consumir_secoes(self) -> None:
        while True:
            prio, _, turno, uf, cd_mun, zona, secao = await self.fila_sec.get()
            sid = f"{uf}{cd_mun:05d}-z{zona:04d}-s{secao:04d}"
            self.pendentes_sec.discard(sid)
            while self.pausado:
                await asyncio.sleep(1)
            try:
                # prio 0 = seção/local aberto no dashboard: passa na frente no TSE e na fila do worker
                await self.processar_secao(turno, uf, cd_mun, zona, secao, alta=prio == 0)
            except Exception:
                log.exception("falha na seção %s", sid)

    async def _atualizar_vigiados(self) -> None:
        while True:
            try:
                vig: set[str] = set()
                for t in await topicos.ativos(self.redis):
                    for parte in t.split(":"):
                        if len(parte) >= 7 and parte[:2].isalpha() and parte[2:7].isdigit():
                            vig.add(parte[:7])
                self.vigiados = vig
                self.pausado = bool(await self.redis.get("coletor:pausado"))
            except Exception:
                log.exception("falha ao ler tópicos ativos")
            await asyncio.sleep(5)

    async def _metricas(self) -> None:
        while True:
            m = self.fetcher.metricas
            dados = {
                "req_por_seg": m.req_por_seg(), "status": {str(k): v for k, v in m.por_status.items()},
                "erros_rede": m.erros_rede, "falhas_jws": m.falhas_jws, "fila_municipios": self.fila_mun.qsize(),
                "fila_secoes": self.fila_sec.qsize(), "secoes_coletadas": len(self.secoes_feitas),
                "municipios": len(self.municipios), "modo_secoes": self.s.modo_secoes, "vigiados": len(self.vigiados), "pausado": self.pausado,
                "ambiente": self.s.tse_ambiente, "base": self.s.tse_base_url, "max_rps": self.s.tse_max_rps,
                "atualizado_em": agora_iso(), "lider": self.id,
            }
            with contextlib.suppress(Exception):
                await self.redis.set("coletor:metricas", orjson.dumps(dados), ex=60)
                await self.redis.set("coletor:ultima_coleta", agora_iso(), ex=3600)
            await asyncio.sleep(3)

    async def _aguardar_lideranca(self) -> None:
        while not await self.redis.set("coletor:lider", self.id, nx=True, ex=30):
            if (await self.redis.get("coletor:lider") or b"").decode() == self.id:
                break
            log.info("outro coletor é líder; aguardando")
            await asyncio.sleep(10)

    async def _renovar_lideranca(self) -> None:
        while True:
            await asyncio.sleep(10)
            await self.redis.set("coletor:lider", self.id, ex=30)

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
            self._renovar_lideranca(), self._metricas(), self._atualizar_vigiados(),
            self._laco("catalogo", self.s.intervalo_catalogo, self.atualizar_catalogo),
            self._laco("principal", self.s.intervalo_principal, self.ciclo_principal),
            self._laco("acompanhamento", self.s.intervalo_acompanhamento, self.ciclo_acompanhamento),
            self._laco("sob_demanda", 3, self.ciclo_sob_demanda),
            *(self._consumir_municipios() for _ in range(n_mun)),
            *(self._consumir_secoes() for _ in range(n_sec)),
        ]
        await asyncio.gather(*tarefas)
