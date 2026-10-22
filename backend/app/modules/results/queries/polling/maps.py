"""`/maps/polling-places`: the polling places of a filter, with the result of each one."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.elections import Candidate
from app.modules.geography import PollingPlace
from app.modules.results.queries.common import (
    ballot_numbers_to_sq,
    candidate_meta,
    polling_place_status,
    short_candidate,
)
from app.modules.results.queries.tally.lines import Line, sum_ballot_boxes

#: Polling place ids are sent in batches, to keep each `IN (...)` list bounded.
BATCH = 5000


@dataclass(frozen=True)
class MapQuery:
    """Geo area asked for on the polling places map. The field names are the callers' keyword arguments."""

    state_code: str | None = None
    municipality: str | None = None
    bbox: tuple[float, float, float, float] | None = None


def _map_filters(criteria: MapQuery) -> list[Any]:
    filters: list[Any] = []
    if criteria.state_code:
        filters.append(PollingPlace.state_code == criteria.state_code)
    if criteria.municipality:
        filters.append(PollingPlace.municipality_id == criteria.municipality)
    if criteria.bbox:
        west, south, east, north = criteria.bbox
        filters += [
            PollingPlace.lon >= west,
            PollingPlace.lat >= south,
            PollingPlace.lon <= east,
            PollingPlace.lat <= north,
        ]
    return filters


async def _official_results(
    session: AsyncSession, turno: int, cd: int, ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Results of the places as the TSE tallied them (the current table)."""
    res: dict[str, dict[str, Any]] = {}
    for start in range(0, len(ids), BATCH):
        stmt = select(PollingPlaceResult).where(
            PollingPlaceResult.round == turno,
            PollingPlaceResult.office_code == cd,
            PollingPlaceResult.polling_place_id.in_(ids[start : start + BATCH]),
        )
        for x in (await session.execute(stmt)).scalars():
            res[x.polling_place_id] = {
                "sections_tallied": x.sections_tallied,
                "sections_total": x.sections_total,
                "leader": x.leader_candidate_id,
                "pct": x.leader_pct,
                "margin": x.margin_pp,
                "valid": x.valid_votes,
            }
    return res


def _ballot_box_result(line: Line) -> dict[str, Any]:
    return {
        "sections_tallied": line["sections_tallied"],
        "sections_total": 0,
        "leader": line["leader_candidate_id"],
        "pct": line["leader_pct"],
        "margin": line["margin_pp"],
        "valid": line["valid_votes"],
    }


async def _ballot_box_results(
    session: AsyncSession, turno: int, cd: int, ids: list[str], at: datetime
) -> dict[str, dict[str, Any]]:
    """Results of the places as of `at`, summed from the ballot boxes collected up to then."""
    res: dict[str, dict[str, Any]] = {}
    sq_maps: dict[str, dict[int, str]] = {}
    for start in range(0, len(ids), BATCH):
        stmt = select(
            BallotBoxReport.polling_place_id,
            BallotBoxReport.state_code,
            BallotBoxReport.votes[str(cd)],
        ).where(
            BallotBoxReport.round == turno,
            BallotBoxReport.polling_place_id.in_(ids[start : start + BATCH]),
            BallotBoxReport.tallied_at <= at,
        )
        votes_by_place: dict[str, list[Any]] = {}
        states: dict[str, str] = {}
        for place_id, state_code, votes in (await session.execute(stmt)).all():
            votes_by_place.setdefault(place_id, []).append(votes)
            states[place_id] = state_code
        for place_id, votes in votes_by_place.items():
            state_code = states[place_id]
            if state_code not in sq_maps:
                sq_maps[state_code] = await ballot_numbers_to_sq(session, turno, cd, state_code)
            res[place_id] = _ballot_box_result(sum_ballot_boxes(votes, 0, 0, sq_maps[state_code]))
    return res


async def _polling_place_results(
    session: AsyncSession, turno: int, cd: int, ids: list[str], at: datetime | None
) -> dict[str, dict[str, Any]]:
    if at is None:
        return await _official_results(session, turno, cd, ids)
    return await _ballot_box_results(session, turno, cd, ids, at)


def _map_item(x: Any, result: dict[str, Any] | None, meta: dict[str, Candidate]) -> dict[str, Any]:
    r = result or {}
    total_sections = max(x.section_count or 0, r.get("sections_total") or 0, r.get("sections_tallied") or 0)
    tallied = r.get("sections_tallied", 0)
    leader = r.get("leader")
    return {
        "id": x.id,
        "name": x.name,
        "neighborhood": x.neighborhood,
        "lat": x.lat,
        "lon": x.lon,
        "approximate": x.is_approximate,
        "status": polling_place_status(tallied, total_sections),
        "sections_total": total_sections,
        "sections_tallied": tallied,
        "leader": short_candidate(meta.get(leader), leader, 0, r.get("pct", 0)) if leader else None,
        "margin_pp": r.get("margin", 0.0),
        "valid_votes": r.get("valid", 0),
    }


async def polling_place_map(
    session: AsyncSession,
    turno: int,
    cd: int,
    filtro: MapQuery,
    t: datetime | None,
    limite: int = 20000,
) -> dict[str, Any]:
    filters = _map_filters(filtro)
    total = (
        await session.execute(select(func.count()).select_from(PollingPlace).where(*filters))
    ).scalar_one()
    places = (
        await session.execute(
            select(
                PollingPlace.id,
                PollingPlace.name,
                PollingPlace.neighborhood,
                PollingPlace.lat,
                PollingPlace.lon,
                PollingPlace.is_approximate,
                PollingPlace.section_count,
                PollingPlace.state_code,
            )
            .where(*filters)
            .limit(limite)
        )
    ).all()
    results = await _polling_place_results(session, turno, cd, [x.id for x in places], t)
    leaders = [v["leader"] for v in results.values() if v.get("leader")]
    meta = await candidate_meta(session, leaders)
    items = [_map_item(x, results.get(x.id), meta) for x in places]
    return {"total": total, "truncated": total > len(places), "items": items}
