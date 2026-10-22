"""`/results/series`: the evolution of one result over time, at most `max_pontos` points."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import colors
from app.modules.geography import GeoArea
from app.modules.results.models import ResultSnapshot
from app.modules.results.queries.common import candidate_meta, iso
from app.modules.results.queries.events import EventsQuery, list_events

TOP_CANDIDATES = 12


def _thin_out(rows: list[Any], max_points: int) -> list[Any]:
    """Keeps evenly spaced rows, always including the last one."""
    if len(rows) <= max_points:
        return rows
    step = len(rows) / max_points
    idx = sorted({int(i * step) for i in range(max_points)} | {len(rows) - 1})
    return [rows[i] for i in idx]


async def _snapshot_rows(
    session: AsyncSession,
    round_number: int,
    office_code: int,
    r: GeoArea,
    since: datetime | None,
    until: datetime | None,
) -> list[Any]:
    filters = [
        ResultSnapshot.round == round_number,
        ResultSnapshot.office_code == office_code,
        ResultSnapshot.level == r.level,
        ResultSnapshot.geo_area_id == r.id,
    ]
    if since:
        filters.append(ResultSnapshot.tallied_at >= since)
    if until:
        filters.append(ResultSnapshot.tallied_at <= until)
    stmt = (
        select(
            ResultSnapshot.tallied_at,
            ResultSnapshot.pct_sections,
            ResultSnapshot.valid_votes,
            ResultSnapshot.candidates,
        )
        .where(*filters)
        .order_by(ResultSnapshot.tallied_at, ResultSnapshot.generation_id)
    )
    return list((await session.execute(stmt)).all())


def _points(rows: list[Any], top: list[str]) -> list[dict[str, Any]]:
    points = []
    for t, p, valid, cands in rows:
        by_sq = {c["sq"]: c for c in cands}
        points.append(
            {
                "time": iso(t),
                "pct_sections": p,
                "valid_votes": valid,
                "candidates": {
                    sq: {"votes": by_sq[sq]["v"], "pct": by_sq[sq]["p"]} for sq in top if sq in by_sq
                },
            }
        )
    return points


def _series_candidates(top: list[str], meta: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "tse_candidate_id": sq,
            "ballot_name": meta[sq].ballot_name if sq in meta else sq,
            "color": colors.color_of(meta.get(sq)),
            "ballot_number": meta[sq].ballot_number if sq in meta else None,
            "party_abbreviation": meta[sq].party_abbreviation if sq in meta else "",
        }
        for sq in top
    ]


async def series(
    session: AsyncSession,
    round_number: int,
    office_code: int,
    r: GeoArea,
    de: datetime | None,
    ate: datetime | None,
    max_pontos: int = 300,
) -> dict[str, Any]:
    rows = _thin_out(await _snapshot_rows(session, round_number, office_code, r, de, ate), max_pontos)
    last_cands = rows[-1][3] if rows else []
    top = [c["sq"] for c in last_cands[:TOP_CANDIDATES]]
    meta = await candidate_meta(session, top)
    events = await list_events(
        session,
        EventsQuery(round=round_number, limit=200, office_code=office_code, level=r.level, geo_area_id=r.id),
    )
    return {
        "candidates": _series_candidates(top, meta),
        "points": _points(rows, top),
        "events": events,
    }
