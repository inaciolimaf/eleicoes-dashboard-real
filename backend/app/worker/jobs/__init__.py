"""Processamento dos arquivos coletados: grava no banco, detecta eventos e publica em tempo real.

Cada mensagem é uma unidade de trabalho (`unit_of_work`): ou tudo é gravado, ou nada.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

import orjson
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import unit_of_work
from app.infra import queue
from app.infra.realtime import topics
from app.infra.tse import bu as bu_mod
from app.infra.tse.bu import BoletimUrna
from app.infra.tse.parsers import parse_acompanhamento, parse_resultado
from app.modules.alerts import evaluation as alertas
from app.modules.elections import Candidate, ElectionOffice
from app.modules.events import Event
from app.modules.events import detection as eventos
from app.modules.geography import parse
from app.modules.results import ingestion as ingestao
from app.modules.results import queries as resultados

log = logging.getLogger(__name__)

LEVEL_COUNTRY_STATE = ("country", "state")


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v) if v else None


class Processor:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], redis: Redis) -> None:
        self.sm = sessionmaker
        self.redis = redis
        self._cargos: dict[tuple[int, int], tuple[str, int | None]] = {}
        self._numeros: dict[tuple[int, str], tuple[float, dict]] = {}

    async def process(self, type_: str, body: bytes, context: dict) -> None:
        if type_ == queue.TYPE_RESULT:
            await self.result(body, context)
        elif type_ == queue.TYPE_TRACKING:
            await self.tracking(body, context)
        elif type_ == queue.TYPE_BALLOT:
            await self.ballot(body, context)
        else:
            log.warning("tipo de mensagem desconhecido: %s", type_)

    async def _cargo(
        self, session: AsyncSession, election_id: int, office_code: int
    ) -> tuple[str, int | None]:
        chave = (election_id, office_code)
        if chave not in self._cargos:
            c = await session.get(ElectionOffice, {"election_id": election_id, "office_code": office_code})
            self._cargos[chave] = (c.voting_system, c.seats) if c else ("majoritario", 1)
        return self._cargos[chave]

    # ------------------------------------------------------------------ result (EA20)
    async def result(self, body: bytes, context: dict) -> None:
        dados = orjson.loads(body)
        c = ingestao.Contexto(
            turno=int(context["round"]),
            eleicao_id=int(context["election_id"]),
            cd_cargo=int(context["office_code"]),
            nivel=context["level"],
            recorte_id=context["geo_area_id"],
            pai_id=context["parent_id"],
            uf=context["state_code"],
            arquivo=context.get("file"),
            jws_verificado=bool(context.get("jws_verified")),
            capturado_em=_dt(context.get("captured_at")),
        )
        res = parse_resultado(dados, c.cd_cargo)
        async with unit_of_work(self.sm) as session:
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
            if c.nivel in LEVEL_COUNTRY_STATE:
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
                for ev in evs:
                    await topics.publish(self.redis, topics.events(c.turno), "event", ev["json"])
            await self._publicar_resultado(session, c, novo)
            await self._alertas_resultado(session, novo, evs)

    async def _publicar_resultado(self, session: AsyncSession, c: ingestao.Contexto, linha: dict) -> None:
        r = parse(c.recorte_id)
        t_res = topics.results(c.turno, c.cd_cargo, c.nivel, c.recorte_id)
        if await topics.is_active(self.redis, t_res):
            payload = await resultados.montar_resultado(session, c.turno, c.cd_cargo, r)
            await topics.publish(self.redis, t_res, "results", payload)
        pais = []
        pai = r.parent
        if pai is not None:
            pais.append(topics.children(c.turno, c.cd_cargo, pai.level, pai.id))
        if c.nivel == "municipality":
            pais.append(topics.children(c.turno, c.cd_cargo, "country", "br", "municipality"))
        ativos = [t for t in pais if await topics.is_active(self.redis, t)]
        if ativos:
            item = await resultados.item_filho(session, c.turno, c.cd_cargo, linha)
            for t in ativos:
                await topics.publish(self.redis, t, "children", item)

    async def _alertas_resultado(self, session: AsyncSession, linha: dict, evs: list[dict]) -> None:
        for a in await alertas.ativos(session):
            r = alertas.avaliar_resultado(a, linha, evs)
            if r:
                await alertas.marcar_disparado(session, a)
                await topics.publish(
                    self.redis,
                    topics.user(str(a.user_id)),
                    "alert",
                    {"title": r[0], "description": r[1], "alert_id": str(a.id)},
                )

    # ------------------------------------------------------------------ tracking (EA14/EA15)
    async def tracking(self, body: bytes, context: dict) -> None:
        acomp = parse_acompanhamento(orjson.loads(body))
        turno = int(context["round"])
        async with unit_of_work(self.sm) as session:
            mudou = await ingestao.ingerir_progresso(
                session, turno, acomp, context["state_code"], _dt(context.get("captured_at"))
            )
            if any(m["level"] in LEVEL_COUNTRY_STATE for m in mudou):
                payload = await resultados.progresso(session, turno, None)
                await topics.publish(self.redis, topics.progress(turno), "progress", payload)

    # ------------------------------------------------------------------ ballot report
    async def _mapa_numeros(self, session: AsyncSession, turno: int, uf: str) -> dict:
        chave = (turno, uf)
        hit = self._numeros.get(chave)
        if hit is None or time.monotonic() - hit[0] > 60 or not hit[1]:
            self._numeros[chave] = (time.monotonic(), await ingestao.mapa_numeros(session, turno, uf))
        return self._numeros[chave][1]

    async def ballot(self, body: bytes, context: dict) -> None:
        turno = int(context["round"])
        uf = context["state_code"]
        bu = bu_mod.decodificar(body)
        async with unit_of_work(self.sm) as session:
            numeros = await self._mapa_numeros(session, turno, uf)
            alterados = await ingestao.ingerir_boletim(
                session,
                turno,
                uf,
                bu,
                ingestao.BoletimContexto(
                    hash=str(context["hash"]),
                    status=str(context.get("status", "Totalizado")),
                    totalizado_em=_dt(context.get("tallied_at")),
                    url=context.get("url"),
                    numeros=numeros,
                ),
            )
            await self._publicar_boletim(session, turno, uf, bu, alterados)

    async def _publicar_boletim(
        self, session: AsyncSession, turno: int, uf: str, bu: BoletimUrna, alterados: list[tuple[int, str]]
    ) -> None:
        mid = f"{uf}{bu.municipio:05d}"
        sid = f"{mid}-z{bu.zona:04d}-s{bu.secao:04d}"
        zid = f"{mid}-z{bu.zona:04d}"
        for cd, lid in alterados:
            t_loc = topics.polling_places(turno, cd, mid)
            if await topics.is_active(self.redis, t_loc):
                item = await resultados.item_local(session, turno, cd, lid)
                if item:
                    await topics.publish(self.redis, t_loc, "polling_place", item)
            for nivel, rid in (("polling_place", lid), ("section", sid), ("zone", zid)):
                t_res = topics.results(turno, cd, nivel, rid)
                if await topics.is_active(self.redis, t_res):
                    payload = await resultados.montar_resultado(session, turno, cd, parse(rid))
                    await topics.publish(self.redis, t_res, "results", payload)
            t_fil = topics.children(turno, cd, "zone", zid)
            if await topics.is_active(self.redis, t_fil):
                dados = await resultados.filhos(session, turno, cd, parse(zid), None)
                for it in dados["items"]:
                    if it["id"] == lid:
                        await topics.publish(self.redis, t_fil, "children", it)
        if alterados:
            item = await resultados.item_local(session, turno, alterados[0][0], alterados[0][1])
            for a in await alertas.ativos(session):
                r = alertas.avaliar_local(a, alterados[0][1], item["status"] if item else "")
                if r:
                    await alertas.marcar_disparado(session, a)
                    await topics.publish(
                        self.redis,
                        topics.user(str(a.user_id)),
                        "alert",
                        {"title": r[0], "description": r[1], "alert_id": str(a.id)},
                    )
