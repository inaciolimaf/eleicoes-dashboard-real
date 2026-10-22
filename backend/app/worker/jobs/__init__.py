"""Processamento dos arquivos coletados: grava no banco, detecta eventos e publica em tempo real."""

from __future__ import annotations

import logging
import time
from datetime import datetime

import orjson
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.infra.realtime import topics as topicos
from app.infra.tse import bu as bu_mod
from app.infra.tse.parsers import parse_acompanhamento, parse_resultado
from app.modules.alerts import evaluation as alertas
from app.modules.elections import Candidate, ElectionOffice
from app.modules.events import Event
from app.modules.events import detection as eventos
from app.modules.geography import parse
from app.modules.results import ingestion as ingestao
from app.modules.results import queries as resultados

log = logging.getLogger(__name__)


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v) if v else None


class Processador:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], redis: Redis) -> None:
        self.sm = sessionmaker
        self.redis = redis
        self._cargos: dict[tuple[int, int], tuple[str, int | None]] = {}
        self._numeros: dict[tuple[int, str], tuple[float, dict]] = {}

    async def processar(self, tipo: str, corpo: bytes, ctx: dict) -> None:
        if tipo == "resultado":
            await self.resultado(corpo, ctx)
        elif tipo == "acompanhamento":
            await self.acompanhamento(corpo, ctx)
        elif tipo == "boletim":
            await self.boletim(corpo, ctx)
        else:
            log.warning("tipo de mensagem desconhecido: %s", tipo)

    async def _cargo(self, session: AsyncSession, eleicao_id: int, cd: int) -> tuple[str, int | None]:
        chave = (eleicao_id, cd)
        if chave not in self._cargos:
            c = await session.get(ElectionOffice, {"election_id": eleicao_id, "office_code": cd})
            self._cargos[chave] = (c.voting_system, c.seats) if c else ("majoritario", 1)
        return self._cargos[chave]

    # ------------------------------------------------------------------ resultado (EA20)
    async def resultado(self, corpo: bytes, ctx: dict) -> None:
        dados = orjson.loads(corpo)
        c = ingestao.Contexto(
            turno=int(ctx["turno"]),
            eleicao_id=int(ctx["eleicao_id"]),
            cd_cargo=int(ctx["cd_cargo"]),
            nivel=ctx["nivel"],
            recorte_id=ctx["recorte_id"],
            pai_id=ctx["pai_id"],
            uf=ctx["uf"],
            arquivo=ctx.get("arquivo"),
            jws_verificado=bool(ctx.get("jws_ok")),
            capturado_em=_dt(ctx.get("capturado_em")),
        )
        res = parse_resultado(dados, c.cd_cargo)
        async with self.sm() as session:
            sistema, vagas = await self._cargo(session, c.eleicao_id, c.cd_cargo)
            sqs = [x.sqcand for x in res.candidatos]
            antes: dict[str, str] = {}
            if c.abrangencia_do_cargo:
                rows = await session.execute(
                    select(Candidate.tse_candidate_id, Candidate.overall_status).where(
                        Candidate.tse_candidate_id.in_(sqs)
                    )
                )
                antes = dict(rows.all())
            out = await ingestao.ingerir_resultado(session, c, res, sistema, vagas)
            if out is None:
                return
            anterior, novo = out
            evs: list[dict] = []
            if c.nivel in ("br", "uf"):
                rows = await session.execute(
                    select(Candidate.tse_candidate_id, Candidate.ballot_name, Candidate.overall_status).where(
                        Candidate.tse_candidate_id.in_(sqs)
                    )
                )
                info = rows.all()
                nomes = {sq: n for sq, n, _ in info}
                depois = {sq: st for sq, _, st in info} if c.abrangencia_do_cargo else None
                nome_recorte = await resultados.nome_recorte(session, parse(c.recorte_id))
                evs = eventos.detectar(anterior, novo, nomes, nome_recorte, sistema, antes, depois)
                for ev in evs:
                    obj = (await session.execute(insert(Event).values(**ev).returning(Event))).scalar_one()
                    ev["json"] = resultados.evento_json(obj)
                await session.commit()
                for ev in evs:
                    await topicos.publicar(self.redis, topicos.eventos(c.turno), "evento", ev["json"])
            await self._publicar_resultado(session, c, novo)
            await self._alertas_resultado(session, novo, evs)

    async def _publicar_resultado(self, session: AsyncSession, c: ingestao.Contexto, linha: dict) -> None:
        r = parse(c.recorte_id)
        t_res = topicos.res(c.turno, c.cd_cargo, c.nivel, c.recorte_id)
        if await topicos.esta_ativo(self.redis, t_res):
            payload = await resultados.montar_resultado(session, c.turno, c.cd_cargo, r)
            await topicos.publicar(self.redis, t_res, "res", payload)
        pais = []
        pai = r.pai
        if pai is not None:
            pais.append(topicos.filhos(c.turno, c.cd_cargo, pai.nivel, pai.id))
        if c.nivel == "municipio":
            pais.append(topicos.filhos(c.turno, c.cd_cargo, "br", "br", "municipio"))
        ativos = [t for t in pais if await topicos.esta_ativo(self.redis, t)]
        if ativos:
            item = await resultados.item_filho(session, c.turno, c.cd_cargo, linha)
            for t in ativos:
                await topicos.publicar(self.redis, t, "filho", item)

    async def _alertas_resultado(self, session: AsyncSession, linha: dict, evs: list[dict]) -> None:
        for a in await alertas.ativos(session):
            r = alertas.avaliar_resultado(a, linha, evs)
            if r:
                await alertas.marcar_disparado(session, a)
                await topicos.publicar(
                    self.redis,
                    topicos.usuario(str(a.user_id)),
                    "alerta",
                    {"titulo": r[0], "descricao": r[1], "alerta_id": str(a.id)},
                )

    # ------------------------------------------------------------------ acompanhamento (EA14/EA15)
    async def acompanhamento(self, corpo: bytes, ctx: dict) -> None:
        acomp = parse_acompanhamento(orjson.loads(corpo))
        turno = int(ctx["turno"])
        async with self.sm() as session:
            mudou = await ingestao.ingerir_progresso(
                session, turno, acomp, ctx["uf"], _dt(ctx.get("capturado_em"))
            )
            if any(m["level"] in ("br", "uf") for m in mudou):
                payload = await resultados.progresso(session, turno, None)
                await topicos.publicar(self.redis, topicos.progresso(turno), "progresso", payload)

    # ------------------------------------------------------------------ boletim de urna
    async def _mapa_numeros(self, session: AsyncSession, turno: int, uf: str) -> dict:
        chave = (turno, uf)
        hit = self._numeros.get(chave)
        if hit is None or time.monotonic() - hit[0] > 60 or not hit[1]:
            self._numeros[chave] = (time.monotonic(), await ingestao.mapa_numeros(session, turno, uf))
        return self._numeros[chave][1]

    async def boletim(self, corpo: bytes, ctx: dict) -> None:
        turno = int(ctx["turno"])
        uf = ctx["uf"]
        bu = bu_mod.decodificar(corpo)
        async with self.sm() as session:
            numeros = await self._mapa_numeros(session, turno, uf)
            alterados = await ingestao.ingerir_boletim(
                session,
                turno,
                uf,
                bu,
                ingestao.BoletimContexto(
                    hash=str(ctx["hash"]),
                    status=str(ctx.get("status", "Totalizado")),
                    totalizado_em=_dt(ctx.get("totalizado_em")),
                    url=ctx.get("url"),
                    numeros=numeros,
                ),
            )
            mid = f"{uf}{bu.municipio:05d}"
            sid = f"{mid}-z{bu.zona:04d}-s{bu.secao:04d}"
            zid = f"{mid}-z{bu.zona:04d}"
            for cd, lid in alterados:
                t_loc = topicos.locais(turno, cd, mid)
                if await topicos.esta_ativo(self.redis, t_loc):
                    item = await resultados.item_local(session, turno, cd, lid)
                    if item:
                        await topicos.publicar(self.redis, t_loc, "local", item)
                for nivel, rid in (("local", lid), ("secao", sid), ("zona", zid)):
                    t_res = topicos.res(turno, cd, nivel, rid)
                    if await topicos.esta_ativo(self.redis, t_res):
                        payload = await resultados.montar_resultado(session, turno, cd, parse(rid))
                        await topicos.publicar(self.redis, t_res, "res", payload)
                t_fil = topicos.filhos(turno, cd, "zona", zid)
                if await topicos.esta_ativo(self.redis, t_fil):
                    dados = await resultados.filhos(session, turno, cd, parse(zid), None)
                    for it in dados["itens"]:
                        if it["id"] == lid:
                            await topicos.publicar(self.redis, t_fil, "filho", it)
            if alterados:
                item = await resultados.item_local(session, turno, alterados[0][0], alterados[0][1])
                for a in await alertas.ativos(session):
                    r = alertas.avaliar_local(a, alterados[0][1], item["status"] if item else "")
                    if r:
                        await alertas.marcar_disparado(session, a)
                        await topicos.publicar(
                            self.redis,
                            topicos.usuario(str(a.user_id)),
                            "alerta",
                            {"titulo": r[0], "descricao": r[1], "alerta_id": str(a.id)},
                        )
