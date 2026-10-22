"""Election list, the national tally status and the progress of the count by state."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import Election
from app.modules.geography import Municipality, State
from app.modules.results.models import CurrentProgress, CurrentResult, ProgressSnapshot
from app.modules.results.queries.common import iso

ProgressRow = CurrentProgress | ProgressSnapshot


async def list_elections(session: AsyncSession) -> list[dict[str, Any]]:
    elections = (
        (await session.execute(select(Election).order_by(Election.round, Election.id))).scalars().all()
    )
    return [
        {
            "id": e.id,
            "round": e.round,
            "cycle": e.cycle,
            "jurisdiction": e.jurisdiction,
            "name": e.name,
            "election_code": e.election_code,
            "offices": [
                {
                    "office_code": c.office_code,
                    "name": c.name,
                    "voting_system": c.voting_system,
                    "coverage": c.coverage,
                    "seats": c.seats,
                }
                for c in e.offices
            ],
        }
        for e in elections
    ]


async def last_tally(session: AsyncSession) -> datetime | None:
    return (
        await session.execute(
            select(func.max(CurrentResult.tallied_at)).where(CurrentResult.level == "country")
        )
    ).scalar_one()


async def pct_country(session: AsyncSession, turno: int = 1) -> float:
    r = (
        await session.execute(
            select(CurrentProgress.pct_sections).where(
                CurrentProgress.round == turno, CurrentProgress.level == "country"
            )
        )
    ).scalar_one_or_none()
    return float(r or 0.0)


async def _progress_rows(session: AsyncSession, turno: int, t: datetime | None) -> list[ProgressRow]:
    """Country and state progress: the current rows, or the latest snapshot up to `t`."""
    levels = ["country", "state"]
    if t is None:
        stmt = select(CurrentProgress).where(
            CurrentProgress.round == turno, CurrentProgress.level.in_(levels)
        )
        return list((await session.execute(stmt)).scalars().all())
    stmt_snap = (
        select(ProgressSnapshot)
        .where(
            ProgressSnapshot.round == turno,
            ProgressSnapshot.level.in_(levels),
            ProgressSnapshot.tallied_at <= t,
        )
        .order_by(ProgressSnapshot.geo_area_id, ProgressSnapshot.tallied_at.desc())
        .distinct(ProgressSnapshot.geo_area_id)
    )
    return list((await session.execute(stmt_snap)).scalars().all())


def _progress_item(x: ProgressRow, names: dict[str, str], municipalities: dict[str, int]) -> dict[str, Any]:
    return {
        "state_code": x.geo_area_id,
        "name": names.get(x.geo_area_id, x.geo_area_id.upper()),
        "pct_sections": x.pct_sections,
        "sections_total": x.sections_total,
        "sections_tallied": x.sections_tallied,
        "municipalities_total": municipalities.get(x.geo_area_id, 0),
        "municipalities_completed": x.municipalities_completed,
        "municipalities_partial": x.municipalities_partial,
        "municipalities_not_received": x.municipalities_not_received,
        "pct_turnout": x.pct_turnout,
        "tallied_at": iso(x.tallied_at),
    }


def _progress_country(br: ProgressRow | None) -> dict[str, Any]:
    return {
        "pct_sections": br.pct_sections if br else 0.0,
        "sections_total": br.sections_total if br else 0,
        "sections_tallied": br.sections_tallied if br else 0,
        "tallied_at": iso(br.tallied_at) if br else None,
    }


async def progress(session: AsyncSession, turno: int, t: datetime | None) -> dict[str, Any]:
    rows = await _progress_rows(session, turno, t)
    names = {u.code: u.name for u in (await session.execute(select(State))).scalars()}
    municipalities = dict(
        (
            await session.execute(
                select(Municipality.state_code, func.count()).group_by(Municipality.state_code)
            )
        ).all()
    )
    br = next((x for x in rows if x.level == "country"), None)
    items = [
        _progress_item(x, names, municipalities)
        for x in sorted(rows, key=lambda x: x.geo_area_id)
        if x.level == "state"
    ]
    return {"country": _progress_country(br), "items": items}
