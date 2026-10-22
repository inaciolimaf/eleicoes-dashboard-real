"""The rows of each child level: its lines (results by id) and its dimension (names, regions).

A child that has no result line still appears in the dimension; the lines only carry what was
published, so the dimension is the list the API shows and the lines are looked up by its id.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.geography import (
    ElectoralZone,
    GeoArea,
    Municipality,
    PollingPlace,
    PollingSection,
    State,
    parse,
)
from app.modules.results.models import CurrentResult, ResultSnapshot
from app.modules.results.queries.tally.lines import Line, ballot_box_line, row_as_dict

Lines = dict[str, Line]
Dimension = list[dict[str, Any]]


async def _level_lines(
    session: AsyncSession,
    turno: int,
    cd: int,
    level: str,
    parent_id: str | None,
    at: datetime | None,
    with_candidates: bool,
) -> Lines:
    """Latest line of each area of `level` (under `parent_id`), from the current table or the snapshots."""
    table = CurrentResult if at is None else ResultSnapshot
    cols = [
        c
        for c in table.__table__.columns
        if c.key not in ("alliances", "id") and (with_candidates or c.key != "candidates")
    ]
    filters: list[Any] = [table.round == turno, table.office_code == cd, table.level == level]
    if parent_id:
        filters.append(table.parent_id == parent_id)
    if at is None:
        stmt = select(*cols).where(*filters)
    else:
        filters.append(table.tallied_at <= at)
        stmt = (
            select(*cols)
            .where(*filters)
            .order_by(table.geo_area_id, table.tallied_at.desc(), table.generation_id.desc())
            .distinct(table.geo_area_id)
        )
    rows = (await session.execute(stmt)).all()
    return {row.geo_area_id: row_as_dict(row) for row in rows}


async def state_dimension(
    session: AsyncSession, turno: int, cd: int, at: datetime | None, with_candidates: bool
) -> tuple[Lines, Dimension]:
    states = (await session.execute(select(State).order_by(State.code))).scalars().all()
    lines = await _level_lines(session, turno, cd, "state", None, at, with_candidates)
    dimension = [
        {"id": u.code, "name": u.name, "state_code": u.code, "region": u.region}
        for u in states
        if u.code != "zz" or u.code in lines
    ]
    return lines, dimension


async def municipality_dimension(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    at: datetime | None,
    with_candidates: bool,
    regions: dict[str, str | None],
) -> tuple[Lines, Dimension]:
    query = select(Municipality)
    if r.level == "state":
        query = query.where(Municipality.state_code == r.uf)
    municipalities = (await session.execute(query.order_by(Municipality.name))).scalars().all()
    parent = r.uf if r.level == "state" else None
    lines = await _level_lines(session, turno, cd, "municipality", parent, at, with_candidates)
    dimension = [
        {
            "id": m.id,
            "name": m.name,
            "state_code": m.state_code,
            "ibge_code": m.ibge_code,
            "is_capital": m.is_capital,
            "lat": m.lat,
            "lon": m.lon,
            "region": regions.get(m.state_code),
            "electorate": m.electorate,
        }
        for m in municipalities
    ]
    return lines, dimension


async def zone_dimension(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    at: datetime | None,
    with_candidates: bool,
    regions: dict[str, str | None],
) -> tuple[Lines, Dimension]:
    zones = (
        (
            await session.execute(
                select(ElectoralZone)
                .where(ElectoralZone.municipality_id == r.id)
                .order_by(ElectoralZone.number)
            )
        )
        .scalars()
        .all()
    )
    lines = await _level_lines(session, turno, cd, "zone", r.id, at, with_candidates)
    for z in zones:
        if z.id not in lines:
            line = await ballot_box_line(session, turno, cd, parse(z.id), at)
            if line and line["sections_tallied"]:
                lines[z.id] = line
    dimension = [
        {
            "id": z.id,
            "name": f"Zona {z.number}",
            "state_code": z.state_code,
            "region": regions.get(z.state_code),
        }
        for z in zones
    ]
    return lines, dimension


async def polling_place_dimension(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    at: datetime | None,
    regions: dict[str, str | None],
) -> tuple[Lines, Dimension]:
    places = (
        (
            await session.execute(
                select(PollingPlace)
                .where(PollingPlace.electoral_zone_id == r.id)
                .order_by(PollingPlace.number)
            )
        )
        .scalars()
        .all()
    )
    lines: Lines = {}
    for loc in places:
        line = await ballot_box_line(session, turno, cd, parse(loc.id), at)
        if line and line["sections_tallied"]:
            lines[loc.id] = line
    dimension = [
        {
            "id": loc.id,
            "name": loc.name,
            "state_code": loc.state_code,
            "lat": loc.lat,
            "lon": loc.lon,
            "region": regions.get(loc.state_code),
            "electorate": loc.eligible_voters,
        }
        for loc in places
    ]
    return lines, dimension


async def section_dimension(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    at: datetime | None,
    regions: dict[str, str | None],
) -> tuple[Lines, Dimension]:
    sections = (
        (
            await session.execute(
                select(PollingSection)
                .where(PollingSection.polling_place_id == r.id)
                .order_by(PollingSection.number)
            )
        )
        .scalars()
        .all()
    )
    lines: Lines = {}
    for s in sections:
        line = await ballot_box_line(session, turno, cd, parse(s.id), at)
        if line:
            lines[s.id] = line
    dimension = [
        {
            "id": s.id,
            "name": f"Seção {s.number}",
            "state_code": s.state_code,
            "region": regions.get(s.state_code),
            "electorate": s.eligible_voters,
        }
        for s in sections
    ]
    return lines, dimension
