"""`/geo-areas/children`: the table of the children of a geo area, and the item of one child."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import Candidate, colors
from app.modules.geography import CHILD_LEVEL, GeoArea, Municipality, State
from app.modules.results.queries.children.dimensions import (
    Dimension,
    Lines,
    municipality_dimension,
    polling_place_dimension,
    section_dimension,
    state_dimension,
    zone_dimension,
)
from app.modules.results.queries.children.items import build_item
from app.modules.results.queries.common import candidate_meta
from app.modules.results.queries.tally.lines import Line


async def _regions(session: AsyncSession) -> dict[str, str | None]:
    return {u.code: u.region for u in (await session.execute(select(State))).scalars()}


async def _dimension(
    session: AsyncSession,
    round_number: int,
    office_code: int,
    level: str,
    r: GeoArea,
    at: datetime | None,
    with_candidates: bool,
) -> tuple[Lines, Dimension]:
    regions = await _regions(session)
    if level == "state":
        return await state_dimension(session, round_number, office_code, at, with_candidates)
    if level == "municipality":
        return await municipality_dimension(
            session, round_number, office_code, r, at, with_candidates, regions
        )
    if level == "zone":
        return await zone_dimension(session, round_number, office_code, r, at, with_candidates, regions)
    if level == "polling_place":
        return await polling_place_dimension(session, round_number, office_code, r, at, regions)
    if level == "section":
        return await section_dimension(session, round_number, office_code, r, at, regions)
    return {}, []


def _involved_candidates(lines: Lines, candidates: list[str] | None) -> list[str]:
    sq_ids: list[str | None] = []
    for line in lines.values():
        sq_ids += [line.get("leader_candidate_id"), line.get("second_candidate_id")]
    sq_ids += candidates or []
    return [sq for sq in sq_ids if sq]


def _candidate_rows(
    wins: dict[str, int], candidates: list[str] | None, meta: dict[str, Candidate]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for sq in set(list(wins) + (candidates or [])):
        m = meta.get(sq)
        rows.append(
            {
                "tse_candidate_id": sq,
                "ballot_name": m.ballot_name if m else sq,
                "color": colors.color_of(m),
                "ballot_number": m.ballot_number if m else None,
                "party_abbreviation": m.party_abbreviation if m else "",
                "wins": wins.get(sq, 0),
            }
        )
    rows.sort(key=lambda c: -c["wins"])
    return rows


async def children(
    session: AsyncSession,
    round_number: int,
    office_code: int,
    r: GeoArea,
    t: datetime | None,
    child_level: str | None = None,
    candidates: list[str] | None = None,
) -> dict[str, Any]:
    level = child_level or CHILD_LEVEL.get(r.level)
    if level is None:
        return {"child_level": None, "candidates": [], "items": []}
    lines, dimension = await _dimension(session, round_number, office_code, level, r, t, bool(candidates))
    meta = await candidate_meta(session, _involved_candidates(lines, candidates))
    wins: dict[str, int] = {}
    items: list[dict[str, Any]] = []
    for d in dimension:
        item = build_item(level, d, lines.get(d["id"]), meta, candidates)
        leader = item["leader"]
        if leader:
            sq = leader["tse_candidate_id"]
            wins[sq] = wins.get(sq, 0) + 1
        items.append(item)
    return {
        "child_level": level,
        "candidates": _candidate_rows(wins, candidates, meta),
        "items": items,
    }


def _municipality_descriptor(m: Municipality, state: State | None) -> dict[str, Any]:
    return {
        "name": m.name,
        "ibge_code": m.ibge_code,
        "is_capital": m.is_capital,
        "lat": m.lat,
        "lon": m.lon,
        "region": state.region if state else None,
        "electorate": m.electorate,
    }


async def _descriptor(session: AsyncSession, level: str, rid: str, line: Line) -> dict[str, Any]:
    """Name, region and coordinates of the area of a line (what the dimension query would give)."""
    d: dict[str, Any] = {"id": rid, "name": rid, "state_code": line.get("state_code")}
    if level == "state":
        u = await session.get(State, rid)
        d.update({"name": u.name if u else rid.upper(), "region": u.region if u else None})
    elif level == "municipality":
        m = await session.get(Municipality, rid)
        if m:
            d.update(_municipality_descriptor(m, await session.get(State, m.state_code)))
    elif level == "zone":
        d["name"] = f"Zona {int(rid[-4:])}"
    return d


async def child_item(
    session: AsyncSession, round_number: int, office_code: int, line: Line
) -> dict[str, Any]:
    """Item of `/geo-areas/children` for a single area (used by the real-time updates)."""
    level = line["level"]
    d = await _descriptor(session, level, line["geo_area_id"], line)
    involved = [x for x in (line.get("leader_candidate_id"), line.get("second_candidate_id")) if x]
    meta = await candidate_meta(session, involved)
    return build_item(level, d, line, meta)
