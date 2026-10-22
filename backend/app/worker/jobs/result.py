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
from app.infra.tse.parsers import parse_result
from app.modules.alerts import evaluation as alerts
from app.modules.elections import Candidate
from app.modules.events import Event, detection
from app.modules.geography import GeoArea, parse
from app.modules.results import ingestion as ingestion
from app.modules.results import queries as results_queries
from app.worker.jobs.publishing import Outbox
from app.worker.jobs.shared import LEVEL_COUNTRY_STATE, parse_datetime

if TYPE_CHECKING:
    from app.infra.tse.parsers import ResultTSE
    from app.worker.jobs import Processor


async def process(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    data = orjson.loads(body)
    c = _context(context)
    res = parse_result(data, c.office_code)
    out = Outbox()
    async with unit_of_work(proc.sessionmaker) as session:
        await _ingest(session, proc, c, res, out)
    await out.publish(proc.redis)


def _context(context: dict[str, Any]) -> ingestion.ResultContext:
    return ingestion.ResultContext(
        round=int(context["round"]),
        election_id=int(context["election_id"]),
        office_code=int(context["office_code"]),
        level=context["level"],
        geo_area_id=context["geo_area_id"],
        parent_id=context["parent_id"],
        state_code=context["state_code"],
        source_file=context.get("file"),
        jws_verified=bool(context.get("jws_verified")),
        captured_at=parse_datetime(context.get("captured_at")),
    )


def _candidate_ids(res: ResultTSE) -> list[str]:
    return [x.tse_candidate_id for x in res.candidates]


async def _ingest(
    session: AsyncSession, proc: Processor, c: ingestion.ResultContext, res: ResultTSE, out: Outbox
) -> None:
    voting_system, seats = await proc.office_settings(session, c.election_id, c.office_code)
    statuses_before = await _statuses_before(session, c, res)
    outcome = await ingestion.ingest_result(session, c, res, voting_system, seats)
    if outcome is None:
        return
    events = await _detect_events(session, out, c, res, voting_system, statuses_before, outcome)
    _, current = outcome
    await _publish_result(session, proc, c, current, out)
    await _alerts_result(session, out, current, events)


async def _statuses_before(
    session: AsyncSession, c: ingestion.ResultContext, res: ResultTSE
) -> dict[str, str]:
    """Overall status of the candidates before this line is stored, when the line covers the office."""
    if not c.has_nationwide_scope:
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
    c: ingestion.ResultContext,
    res: ResultTSE,
    voting_system: str,
    statuses_before: dict[str, str],
    outcome: tuple[dict[str, Any] | None, dict[str, Any]],
) -> list[dict[str, Any]]:
    if c.level not in LEVEL_COUNTRY_STATE:
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
        {candidate_id: new_status for candidate_id, _, new_status in rows} if c.has_nationwide_scope else None
    )
    area_name = await results_queries.geo_area_name(session, parse(c.geo_area_id))
    events = detection.detect(
        previous, current, names, area_name, voting_system, statuses_before, statuses_after
    )
    for ev in events:
        obj = (await session.execute(insert(Event).values(**ev).returning(Event))).scalar_one()
        ev["json"] = results_queries.event_json(obj)
        out.add(topics.events(c.round), "event", ev["json"])
    return events


async def _publish_result(
    session: AsyncSession, proc: Processor, c: ingestion.ResultContext, line: dict[str, Any], out: Outbox
) -> None:
    r = parse(c.geo_area_id)
    results_topic = topics.results(c.round, c.office_code, c.level, c.geo_area_id)
    if await topics.is_active(proc.redis, results_topic):
        payload = await results_queries.build_result(session, c.round, c.office_code, r)
        out.add(results_topic, "results", payload)
    children = await _active_children_topics(proc, c, r)
    if children:
        item = await results_queries.child_item(session, c.round, c.office_code, line)
        for t in children:
            out.add(t, "children", item)


async def _active_children_topics(proc: Processor, c: ingestion.ResultContext, r: GeoArea) -> list[str]:
    candidates: list[str] = []
    if r.parent is not None:
        candidates.append(topics.children(c.round, c.office_code, r.parent.level, r.parent.id))
    if c.level == "municipality":
        candidates.append(topics.children(c.round, c.office_code, "country", "br", "municipality"))
    return [t for t in candidates if await topics.is_active(proc.redis, t)]


async def _alerts_result(
    session: AsyncSession, out: Outbox, line: dict[str, Any], events: list[dict[str, Any]]
) -> None:
    for alert in await alerts.active_alerts(session):
        text = alerts.evaluate_result(alert, line, events)
        if text:
            await alerts.mark_triggered(session, alert)
            out.add_alert(alert, text)
