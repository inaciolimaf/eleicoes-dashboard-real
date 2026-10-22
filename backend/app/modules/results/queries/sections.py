"""`/polling-sections/{id}`: one section with its ballot box report, office by office."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ballot_reports import BallotBoxReport
from app.modules.elections import Candidate, colors
from app.modules.geography import Municipality, PollingPlace, PollingSection, parse
from app.modules.results.queries.common import NOT_RECEIVED, OFFICE_NAMES, TALLIED, iso


def _nominal_votes(votes: dict[str, Any], by_number: dict[int, Candidate]) -> list[dict[str, Any]]:
    rows = []
    for num, qty in sorted((votes.get("nom") or {}).items(), key=lambda kv: -kv[1]):
        c = by_number.get(int(num))
        rows.append(
            {
                "kind": "nominal",
                "number": int(num),
                "tse_candidate_id": c.tse_candidate_id if c else None,
                "ballot_name": c.ballot_name if c else f"Nº {num}",
                "party_abbreviation": c.party_abbreviation if c else "",
                "color": colors.color_of(c) if c else colors.party_color(int(num)),
                "votes": qty,
            }
        )
    return rows


def _legend_votes(votes: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "kind": "legenda",
            "number": int(num),
            "tse_candidate_id": None,
            "ballot_name": f"Legenda {num}",
            "party_abbreviation": "",
            "color": colors.party_color(int(num)),
            "votes": qty,
        }
        for num, qty in sorted((votes.get("leg") or {}).items(), key=lambda kv: -kv[1])
    ]


def _section_votes(votes: dict[str, Any], by_number: dict[int, Candidate]) -> list[dict[str, Any]]:
    """Nominal votes first (largest first), then the legend votes."""
    return _nominal_votes(votes, by_number) + _legend_votes(votes)


async def _section_offices(
    session: AsyncSession, turno: int, ballot: BallotBoxReport, uf: str | None
) -> list[dict[str, Any]]:
    offices = []
    for cd, votes in sorted((ballot.votes or {}).items(), key=lambda kv: int(kv[0])):
        office_code = int(cd)
        stmt = select(Candidate).where(
            Candidate.round == turno,
            Candidate.office_code == office_code,
            Candidate.state_code == ("br" if office_code == 1 else uf),
        )
        by_number = {c.ballot_number: c for c in (await session.execute(stmt)).scalars()}
        rows = _section_votes(votes, by_number)
        offices.append(
            {
                "office_code": office_code,
                "name": OFFICE_NAMES.get(office_code, str(office_code)),
                "turnout": votes.get("comp", 0),
                "valid_votes": sum(x["votes"] for x in rows),
                "blank_votes": votes.get("b", 0),
                "null_votes": votes.get("n", 0),
                "votes": rows,
            }
        )
    return offices


def _ballot_fields(ballot: BallotBoxReport | None, sec: PollingSection | None) -> dict[str, Any]:
    return {
        "status": TALLIED if ballot else NOT_RECEIVED,
        "tallied_at": iso(ballot.tallied_at) if ballot else None,
        "issued_at": iso(ballot.issued_at) if ballot else None,
        "hash": ballot.hash if ballot else None,
        "signature_valid": ballot.signature_valid if ballot else None,
        "bu_url": ballot.url if ballot else None,
        "eligible_voters": (sec.eligible_voters if sec else None)
        or (ballot.eligible_voters if ballot else None),
        "turnout": ballot.turnout if ballot else None,
    }


async def detalhe_secao(session: AsyncSession, turno: int, sid: str) -> dict[str, Any] | None:
    r = parse(sid, "section")
    sec = await session.get(PollingSection, sid)
    ballot = (
        await session.execute(
            select(BallotBoxReport).where(
                BallotBoxReport.round == turno, BallotBoxReport.polling_section_id == sid
            )
        )
    ).scalar_one_or_none()
    if sec is None and ballot is None:
        return None
    mun = await session.get(Municipality, r.municipality_id)
    polling_place_id = (sec.polling_place_id if sec else None) or (
        ballot.polling_place_id if ballot else None
    )
    loc = await session.get(PollingPlace, polling_place_id) if polling_place_id else None
    offices = await _section_offices(session, turno, ballot, r.uf) if ballot else []
    return {
        "id": sid,
        "number": r.section,
        "state_code": r.uf,
        "municipality": {"id": r.municipality_id, "name": mun.name if mun else r.municipality_id},
        "zone": {"id": r.zone_id, "number": r.zone},
        "polling_place": {"id": polling_place_id, "name": loc.name if loc else None},
        **_ballot_fields(ballot, sec),
        "offices": offices,
    }
