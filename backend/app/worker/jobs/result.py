"""Result job (EA20): ingests the tally of one geo area and office, detects events, then publishes.

Realtime messages are collected in the unit of work and published after its commit.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import orjson
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import unit_of_work
from app.infra.realtime import topics
from app.infra.tse.parsers import parse_resultado
from app.modules.alerts import evaluation as alertas
from app.modules.elections import Candidate
from app.modules.events import Event, detection
from app.modules.geography import GeoArea, parse
from app.modules.results import ingestion as ingestao
from app.modules.results import queries as resultados
from app.worker.jobs.publishing import Outbox
from app.worker.jobs.shared import LEVEL_COUNTRY_STATE, parse_datetime

if TYPE_CHECKING:
    from app.infra.tse.parsers import ResultadoTSE
    from app.worker.jobs import Processor


async def process(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    data = orjson.loads(body)
    c = _context(context)
    res = parse_resultado(data, c.cd_cargo)
    out = Outbox()
    async with unit_of_work(proc.sessionmaker) as session:
        await _ingest(session, proc, c, res, out)
    await out.publish(proc.redis)


def _context(context: dict[str, Any]) -> ingestao.Contexto:
    return ingestao.Contexto(
        turno=int(context["round"]),
        eleicao_id=int(context["election_id"]),
        cd_cargo=int(context["office_code"]),
        nivel=context["level"],
        recorte_id=context["geo_area_id"],
        pai_id=context["parent_id"],
        uf=context["state_code"],
        arquivo=context.get("file"),
        jws_verificado=bool(context.get("jws_verified")),
        capturado_em=parse_datetime(context.get("captured_at")),
    )


def _candidate_ids(res: ResultadoTSE) -> list[str]:
    return [x.sqcand for x in res.candidatos]


async def _ingest(
    session: AsyncSession, proc: Processor, c: ingestao.Contexto, res: ResultadoTSE, out: Outbox
) -> None:
    voting_system, seats = await proc.office_settings(session, c.eleicao_id, c.cd_cargo)
    statuses_before = await _statuses_before(session, c, res)
    outcome = await ingestao.ingerir_resultado(session, c, res, voting_system, seats)
    if outcome is None:
        return
    events = await _detect_events(session, out, c, res, voting_system, statuses_before, outcome)
    _, current = outcome
    await _publish_result(session, proc, c, current, out)
    await _alerts_result(session, out, current, events)


async def _statuses_before(session: AsyncSession, c: ingestao.Contexto, res: ResultadoTSE) -> dict[str, str]:
    """Overall status of the candidates before this line is stored, when the line covers the office."""
    if not c.abrangencia_do_cargo:
        return {}
    rows = await session.execute(
        select(Candidate.tse_candidate_id, Candidate.overall_status).where(
            Candidate.tse_candidate_id.in_(_candidate_ids(res))
        )
    )
    return dict(rows.all())


async def _detect_events(
    session: AsyncSession,
    out: Outbox,
    c: ingestao.Contexto,
    res: ResultadoTSE,
    voting_system: str,
    statuses_before: dict[str, str],
    outcome: tuple[dict[str, Any] | None, dict[str, Any]],
) -> list[dict[str, Any]]:
    if c.nivel not in LEVEL_COUNTRY_STATE:
        return []
    previous, current = outcome
    rows = (
        await session.execute(
            select(Candidate.tse_candidate_id, Candidate.ballot_name, Candidate.overall_status).where(
                Candidate.tse_candidate_id.in_(_candidate_ids(res))
            )
        )
    ).all()
    names = {candidate_id: ballot_name for candidate_id, ballot_name, _ in rows}
    statuses_after = (
        {candidate_id: new_status for candidate_id, _, new_status in rows} if c.abrangencia_do_cargo else None
    )
    area_name = await resultados.nome_recorte(session, parse(c.recorte_id))
    events = detection.detect(
        previous, current, names, area_name, voting_system, statuses_before, statuses_after
    )
    for ev in events:
        obj = (await session.execute(insert(Event).values(**ev).returning(Event))).scalar_one()
        ev["json"] = resultados.evento_json(obj)
        out.add(topics.events(c.turno), "event", ev["json"])
    return events


async def _publish_result(
    session: AsyncSession, proc: Processor, c: ingestao.Contexto, line: dict[str, Any], out: Outbox
) -> None:
    r = parse(c.recorte_id)
    results_topic = topics.results(c.turno, c.cd_cargo, c.nivel, c.recorte_id)
    if await topics.is_active(proc.redis, results_topic):
        payload = await resultados.montar_resultado(session, c.turno, c.cd_cargo, r)
        out.add(results_topic, "results", payload)
    children = await _active_children_topics(proc, c, r)
    if children:
        item = await resultados.item_filho(session, c.turno, c.cd_cargo, line)
        for t in children:
            out.add(t, "children", item)


async def _active_children_topics(proc: Processor, c: ingestao.Contexto, r: GeoArea) -> list[str]:
    candidates: list[str] = []
    if r.parent is not None:
        candidates.append(topics.children(c.turno, c.cd_cargo, r.parent.level, r.parent.id))
    if c.nivel == "municipality":
        candidates.append(topics.children(c.turno, c.cd_cargo, "country", "br", "municipality"))
    return [t for t in candidates if await topics.is_active(proc.redis, t)]


async def _alerts_result(
    session: AsyncSession, out: Outbox, line: dict[str, Any], events: list[dict[str, Any]]
) -> None:
    for alert in await alertas.active_alerts(session):
        text = alertas.evaluate_result(alert, line, events)
        if text:
            await alertas.mark_triggered(session, alert)
            out.add_alert(alert, text)
