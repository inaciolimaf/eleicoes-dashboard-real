"""Helpers shared by the query modules: formatting, office and candidate lookups, geo area names.

The status values (`not_received`, `partial`, `tallied`) and the office names are part of the API
or of the product text, so they keep their values.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import Candidate, Election, ElectionOffice, colors
from app.modules.geography import GeoArea, Municipality, PollingPlace, PollingSection, State, parse

NOT_RECEIVED = "not_received"
PARTIAL = "partial"
TALLIED = "tallied"

OFFICE_NAMES = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Deputado Federal",
    7: "Deputado Estadual",
    8: "Deputado Distrital",
}


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def pct(part: float, total: float) -> float:
    return round(part * 100.0 / total, 4) if total else 0.0


def status_by_pct(pct_sections: float | None, tallied_sections: int | None = None) -> str:
    if not pct_sections and not tallied_sections:
        return NOT_RECEIVED
    return TALLIED if (pct_sections or 0) >= 99.9999 else PARTIAL


def polling_place_status(tallied_sections: int, total_sections: int) -> str:
    if not tallied_sections:
        return NOT_RECEIVED
    return TALLIED if tallied_sections >= total_sections else PARTIAL


def photo_url(tse_candidate_id: str) -> str:
    return f"/api/v1/candidates/{tse_candidate_id}/photo"


def vice_list(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [{"name": v.get("nome"), "kind": v.get("tipo")} for v in (items or [])]


async def candidate_meta(session: AsyncSession, sq_ids: list[str]) -> dict[str, Candidate]:
    unique = [sq for sq in set(sq_ids) if sq]
    if not unique:
        return {}
    res = await session.execute(select(Candidate).where(Candidate.tse_candidate_id.in_(unique)))
    return {c.tse_candidate_id: c for c in res.scalars()}


def short_candidate(
    candidate: Candidate | None, sq: str | None, votes: int = 0, pct_value: float = 0.0
) -> dict[str, Any] | None:
    if sq is None:
        return None
    return {
        "tse_candidate_id": sq,
        "ballot_name": candidate.ballot_name if candidate else sq,
        "color": colors.color_of(candidate),
        "ballot_number": candidate.ballot_number if candidate else None,
        "party_abbreviation": candidate.party_abbreviation if candidate else "",
        "votes": votes,
        "pct": round(pct_value, 4),
    }


async def ballot_numbers_to_sq(
    session: AsyncSession, round_number: int, office_code: int, uf: str
) -> dict[int, str]:
    """Maps the ballot number of each candidate to its TSE id, as the ballot boxes name them."""
    res = await session.execute(
        select(Candidate.ballot_number, Candidate.tse_candidate_id).where(
            Candidate.round == round_number,
            Candidate.office_code == office_code,
            Candidate.state_code == ("br" if office_code == 1 else uf),
        )
    )
    return {int(number): sq for number, sq in res.all()}


async def office_info(
    session: AsyncSession, round_number: int, office_code: int
) -> tuple[Election, ElectionOffice] | None:
    res = await session.execute(
        select(Election, ElectionOffice)
        .join(ElectionOffice, ElectionOffice.election_id == Election.id)
        .where(Election.round == round_number, ElectionOffice.office_code == office_code)
        .order_by(Election.id.desc())
        .limit(1)
    )
    row = res.first()
    return (row[0], row[1]) if row else None


def office_json(office: ElectionOffice | None, office_code: int) -> dict[str, Any]:
    if office is None:
        return {
            "office_code": office_code,
            "name": f"Cargo {office_code}",
            "voting_system": "majoritario",
            "seats": 1,
        }
    return {
        "office_code": office.office_code,
        "name": office.name,
        "voting_system": office.voting_system,
        "seats": office.seats,
    }


async def nome_recorte(session: AsyncSession, r: GeoArea) -> str:
    if r.level == "country":
        return "Brasil"
    if r.level == "state":
        uf = await session.get(State, r.uf)
        return uf.name if uf else (r.uf or "").upper()
    if r.level == "municipality":
        m = await session.get(Municipality, r.id)
        return m.name if m else r.id
    if r.level == "zone":
        return f"Zona {r.zone}"
    if r.level == "polling_place":
        loc = await session.get(PollingPlace, r.id)
        return loc.name if loc else f"Local {r.polling_place}"
    return f"Seção {r.section}"


async def geo_area_info(session: AsyncSession, r: GeoArea) -> dict[str, Any]:
    """The geo area with its breadcrumb, from the country down to the area itself."""
    chain: list[GeoArea] = []
    current: GeoArea | None = r
    while current is not None:
        chain.append(current)
        current = current.parent
    chain.reverse()
    if r.level == "section":
        sec = await session.get(PollingSection, r.id)
        if sec and sec.polling_place_id:
            chain.insert(len(chain) - 1, parse(sec.polling_place_id))
    crumbs: list[dict[str, Any]] = [
        {"level": x.level, "id": x.id, "name": await nome_recorte(session, x)} for x in chain
    ]
    return {
        "level": r.level,
        "id": r.id,
        "name": crumbs[-1]["name"],
        "state_code": r.uf,
        "breadcrumb": crumbs,
    }
