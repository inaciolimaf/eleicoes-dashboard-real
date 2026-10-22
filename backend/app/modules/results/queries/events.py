"""Events feed: the listing used by the API, the time line and the series."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events import Event
from app.modules.results.models import ResultSnapshot
from app.modules.results.queries.common import iso


@dataclass(frozen=True)
class EventsQuery:
    """Filter of the events query. The field names are part of the callers' keyword arguments."""

    round: int = 1
    since: datetime | None = None
    limit: int = 100
    types: list[str] | None = None
    office_code: int | None = None
    level: str | None = None
    geo_area_id: str | None = None
    until: datetime | None = None


def event_json(e: Event) -> dict[str, Any]:
    return {
        "id": e.id,
        "type": e.type,
        "occurred_at": iso(e.occurred_at),
        "office_code": e.office_code,
        "level": e.level,
        "geo_area_id": e.geo_area_id,
        "title": e.title,
        "description": e.description,
        "payload": e.payload,
    }


async def list_events(session: AsyncSession, filtro: EventsQuery) -> list[dict[str, Any]]:
    q = select(Event).where(Event.round == filtro.round)
    if filtro.since:
        q = q.where(Event.occurred_at > filtro.since)
    if filtro.until:
        q = q.where(Event.occurred_at <= filtro.until)
    if filtro.types:
        q = q.where(Event.type.in_(filtro.types))
    if filtro.office_code:
        q = q.where(or_(Event.office_code == filtro.office_code, Event.office_code.is_(None)))
    if filtro.level and filtro.geo_area_id:
        q = q.where(
            or_(
                and_(Event.level == filtro.level, Event.geo_area_id == filtro.geo_area_id),
                Event.type == "start",
            )
        )
    rows = (
        (await session.execute(q.order_by(Event.occurred_at.desc(), Event.id.desc()).limit(filtro.limit)))
        .scalars()
        .all()
    )
    return [event_json(e) for e in rows]


async def timeline(session: AsyncSession, round_number: int) -> dict[str, Any]:
    ini, fim = (
        await session.execute(
            select(func.min(ResultSnapshot.tallied_at), func.max(ResultSnapshot.tallied_at)).where(
                ResultSnapshot.round == round_number, ResultSnapshot.level.in_(["country", "state"])
            )
        )
    ).one()
    eventos = await list_events(session, EventsQuery(round=round_number, limit=300))
    eventos = [e for e in eventos if e["level"] in ("country", "state", None)]
    return {"start": iso(ini), "end": iso(fim), "now": iso(fim), "events": eventos}
