"""`/polling-places/{id}`: one polling place with its result, and its sections with their status."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.geography import ElectoralZone, Municipality, PollingPlace, PollingSection
from app.modules.results.queries.common import (
    NOT_RECEIVED,
    TALLIED,
    candidate_meta,
    iso,
    polling_place_status,
    short_candidate,
)


async def polling_place_item(
    session: AsyncSession, round_number: int, office_code: int, lid: str
) -> dict[str, Any] | None:
    loc = await session.get(PollingPlace, lid)
    if loc is None:
        return None
    r = (
        await session.execute(
            select(PollingPlaceResult).where(
                PollingPlaceResult.round == round_number,
                PollingPlaceResult.office_code == office_code,
                PollingPlaceResult.polling_place_id == lid,
            )
        )
    ).scalar_one_or_none()
    leader = r.leader_candidate_id if r else None
    meta = await candidate_meta(session, [leader] if leader else [])
    tallied = r.sections_tallied if r else 0
    total_sections = max(loc.section_count or 0, r.sections_total if r else 0)
    return {
        "id": loc.id,
        "name": loc.name,
        "neighborhood": loc.neighborhood,
        "lat": loc.lat,
        "lon": loc.lon,
        "approximate": loc.is_approximate,
        "status": polling_place_status(tallied, total_sections),
        "sections_total": total_sections,
        "sections_tallied": tallied,
        "leader": short_candidate(meta.get(leader), leader, 0, r.leader_pct) if r and leader else None,
        "margin_pp": r.margin_pp if r else 0.0,
        "valid_votes": r.valid_votes if r else 0,
    }


def _section_rows(
    sections: list[PollingSection], ballots: dict[str, BallotBoxReport]
) -> list[dict[str, Any]]:
    return [
        {
            "id": s.id,
            "number": s.number,
            "eligible_voters": s.eligible_voters,
            "status": TALLIED if s.id in ballots else NOT_RECEIVED,
            "tallied_at": iso(ballots[s.id].tallied_at) if s.id in ballots else None,
            "turnout": ballots[s.id].turnout if s.id in ballots else None,
        }
        for s in sections
    ]


async def polling_place_detail(session: AsyncSession, round_number: int, lid: str) -> dict[str, Any] | None:
    loc = await session.get(PollingPlace, lid)
    if loc is None:
        return None
    mun = await session.get(Municipality, loc.municipality_id)
    zone = await session.get(ElectoralZone, loc.electoral_zone_id)
    sections = (
        (
            await session.execute(
                select(PollingSection)
                .where(PollingSection.polling_place_id == lid)
                .order_by(PollingSection.number)
            )
        )
        .scalars()
        .all()
    )
    ballots = {
        b.polling_section_id: b
        for b in (
            await session.execute(
                select(BallotBoxReport).where(
                    BallotBoxReport.round == round_number, BallotBoxReport.polling_place_id == lid
                )
            )
        ).scalars()
    }
    return {
        **_place_fields(loc, mun, zone),
        "sections": _section_rows(list(sections), ballots),
    }


def _place_fields(loc: PollingPlace, mun: Municipality | None, zone: ElectoralZone | None) -> dict[str, Any]:
    return {
        "id": loc.id,
        "name": loc.name,
        "address": loc.address,
        "neighborhood": loc.neighborhood,
        "zip_code": loc.zip_code,
        "lat": loc.lat,
        "lon": loc.lon,
        "approximate": loc.is_approximate,
        "eligible_voters": loc.eligible_voters,
        "municipality": {
            "id": loc.municipality_id,
            "name": mun.name if mun else loc.municipality_id,
        },
        "zone": {"id": loc.electoral_zone_id, "number": zone.number if zone else None},
    }
