"""Candidate list and candidate detail, with the candidate's own result in its office."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import Candidate, colors
from app.modules.geography import GeoArea
from app.modules.results.queries.common import (
    office_info,
    office_json,
    photo_url,
    running_mate_list,
)
from app.modules.results.queries.tally.result import build_result


def candidate_json(c: Candidate) -> dict[str, Any]:
    return {
        "tse_candidate_id": c.tse_candidate_id,
        "ballot_number": c.ballot_number,
        "name": c.name,
        "ballot_name": c.ballot_name,
        "party_abbreviation": c.party_abbreviation,
        "alliance": c.alliance,
        "color": colors.color_of(c),
        "photo_url": photo_url(c.tse_candidate_id),
        "state_code": None if c.state_code == "br" else c.state_code,
        "office_code": c.office_code,
        "overall_status": c.overall_status,
        "elected": c.elected,
        "vice_and_substitutes": running_mate_list(c.vice_and_substitutes),
    }


async def list_candidates(
    session: AsyncSession, round_number: int, office_code: int | None, state_code: str | None
) -> list[dict[str, Any]]:
    q = select(Candidate).where(Candidate.round == round_number)
    if office_code:
        q = q.where(Candidate.office_code == office_code)
    if state_code:
        q = q.where(Candidate.state_code == state_code)
    stmt = q.order_by(Candidate.office_code, Candidate.state_code, Candidate.ballot_number)
    items = [candidate_json(c) for c in (await session.execute(stmt)).scalars()]
    names: dict[int, str] = {}
    for office in {item["office_code"] for item in items}:
        info = await office_info(session, round_number, office)
        names[office] = info[1].name if info else ""
    for item in items:
        item["office_name"] = names[item["office_code"]]
    return items


def _candidate_result(me: dict[str, Any] | None) -> dict[str, Any] | None:
    if not me:
        return None
    return {
        "votes": me["votes"],
        "valid_pct": me["valid_pct"],
        "position": me["position"],
        "status": me["status"],
    }


async def candidate_detail(
    session: AsyncSession, sq: str, round_number: int, t: datetime | None
) -> dict[str, Any] | None:
    c = await session.get(Candidate, sq)
    if c is None:
        return None
    info = await office_info(session, c.round, c.office_code)
    if c.state_code == "br":
        area = GeoArea("country", "br")
    else:
        area = GeoArea("state", c.state_code, state_code=c.state_code)
    result = await build_result(session, c.round, c.office_code, area, t)
    mine = next((x for x in result.get("candidates", []) if x["tse_candidate_id"] == sq), None)
    return {
        **candidate_json(c),
        "office_name": info[1].name if info else "",
        "office": office_json(info[1] if info else None, c.office_code),
        "result": _candidate_result(mine),
    }
