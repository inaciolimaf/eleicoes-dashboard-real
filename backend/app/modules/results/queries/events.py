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
class ConsultaEventos:
    """Filter of the events query. The field names are part of the callers' keyword arguments."""

    turno: int = 1
    desde: datetime | None = None
    limite: int = 100
    tipos: list[str] | None = None
    cargo: int | None = None
    nivel: str | None = None
    recorte_id: str | None = None
    ate: datetime | None = None


def evento_json(e: Event) -> dict[str, Any]:
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


async def listar_eventos(session: AsyncSession, filtro: ConsultaEventos) -> list[dict[str, Any]]:
    q = select(Event).where(Event.round == filtro.turno)
    if filtro.desde:
        q = q.where(Event.occurred_at > filtro.desde)
    if filtro.ate:
        q = q.where(Event.occurred_at <= filtro.ate)
    if filtro.tipos:
        q = q.where(Event.type.in_(filtro.tipos))
    if filtro.cargo:
        q = q.where(or_(Event.office_code == filtro.cargo, Event.office_code.is_(None)))
    if filtro.nivel and filtro.recorte_id:
        q = q.where(
            or_(
                and_(Event.level == filtro.nivel, Event.geo_area_id == filtro.recorte_id),
                Event.type == "start",
            )
        )
    rows = (
        (await session.execute(q.order_by(Event.occurred_at.desc(), Event.id.desc()).limit(filtro.limite)))
        .scalars()
        .all()
    )
    return [evento_json(e) for e in rows]


async def linha_do_tempo(session: AsyncSession, turno: int) -> dict[str, Any]:
    ini, fim = (
        await session.execute(
            select(func.min(ResultSnapshot.tallied_at), func.max(ResultSnapshot.tallied_at)).where(
                ResultSnapshot.round == turno, ResultSnapshot.level.in_(["country", "state"])
            )
        )
    ).one()
    eventos = await listar_eventos(session, ConsultaEventos(turno=turno, limite=300))
    eventos = [e for e in eventos if e["level"] in ("country", "state", None)]
    return {"start": iso(ini), "end": iso(fim), "now": iso(fim), "events": eventos}
