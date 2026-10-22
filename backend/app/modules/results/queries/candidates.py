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
    vice_list,
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
        "vice_and_substitutes": vice_list(c.vice_and_substitutes),
    }


async def list_candidates(
    session: AsyncSession, turno: int, cd: int | None, uf: str | None
) -> list[dict[str, Any]]:
    q = select(Candidate).where(Candidate.round == turno)
    if cd:
        q = q.where(Candidate.office_code == cd)
    if uf:
        q = q.where(Candidate.state_code == uf)
    stmt = q.order_by(Candidate.office_code, Candidate.state_code, Candidate.ballot_number)
    return [candidate_json(c) for c in (await session.execute(stmt)).scalars()]


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
    session: AsyncSession, sq: str, turno: int, t: datetime | None
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
        "office": office_json(info[1] if info else None, c.office_code),
        "result": _candidate_result(mine),
    }
