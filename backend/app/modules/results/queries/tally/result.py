"""`/results`: the result of one office in one geo area, with its candidates and alliances."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.elections import Candidate, ElectionOffice, colors
from app.modules.elections import status as candidate_status
from app.modules.geography import GeoArea
from app.modules.results.queries.common import (
    candidate_meta,
    geo_area_info,
    iso,
    office_info,
    office_json,
    photo_url,
    vice_list,
)
from app.modules.results.queries.tally.lines import Line, get_line

TOTAL_FIELDS = (
    "electorate",
    "tallied_electorate",
    "sections_total",
    "sections_tallied",
    "pct_sections",
    "turnout",
    "pct_turnout",
    "abstention",
    "pct_abstention",
    "total_votes",
    "valid_votes",
    "pct_valid",
    "blank_votes",
    "pct_blank",
    "null_votes",
    "pct_null",
)


def _majoritarian_seats(office: ElectionOffice | None) -> int:
    if office is None:
        raise ValueError("result line without its election office")
    return office.seats or 1


def _result_candidate(pos: int, c: dict[str, Any], meta: Candidate | None, status: str) -> dict[str, Any]:
    """One candidate of the result; `meta` is the candidate row, when it is known."""
    if meta:
        color = colors.color_of(meta)
    elif c.get("num"):
        color = colors.party_color(c["num"])
    else:
        color = "#888888"
    return {
        "tse_candidate_id": c["sq"],
        "ballot_number": meta.ballot_number if meta else c.get("num"),
        "name": meta.name if meta else c["sq"],
        "ballot_name": meta.ballot_name if meta else str(c.get("num", c["sq"])),
        "party_abbreviation": meta.party_abbreviation if meta else "",
        "party_number": meta.party_number if meta else None,
        "alliance": meta.alliance if meta else "",
        "color": color,
        "photo_url": photo_url(c["sq"]),
        "votes": int(c["v"]),
        "valid_pct": float(c.get("p") or 0),
        "position": pos,
        "status": status,
        "overall_status": meta.overall_status if meta else candidate_status.COUNTING,
        "elected": bool(meta.elected) if meta else False,
        "vote_destination": c.get("d") or "Válido",
        "vice_and_substitutes": vice_list(meta.vice_and_substitutes if meta else []),
    }


def _result_candidates(
    cands: list[dict[str, Any]], meta: dict[str, Candidate], statuses: dict[str, str]
) -> list[dict[str, Any]]:
    return [
        _result_candidate(
            pos,
            c,
            meta.get(c["sq"]),
            statuses.get(c["sq"], candidate_status.COUNTING),
        )
        for pos, c in enumerate(cands, start=1)
    ]


def _result_alliances(line: Line, system: str) -> list[dict[str, Any]]:
    if system != "proporcional":
        return []
    return [
        {
            "name": a["nome"],
            "parties": a.get("partidos", []),
            "votes": a.get("v", 0),
            "seats": a.get("vag"),
            "color": colors.alliance_color(a["nome"]),
        }
        for a in line.get("alliances") or []
    ]


def _coverage(line: Line) -> dict[str, Any] | None:
    if line.get("source") != "soma_bu":
        return None
    return {
        "total_sections": line["sections_total"],
        "collected_sections": line["sections_tallied"],
    }


def _leader(line: Line) -> dict[str, Any] | None:
    leader_id = line.get("leader_candidate_id")
    if not leader_id:
        return None
    return {
        "tse_candidate_id": leader_id,
        "margin_pp": line.get("margin_pp", 0),
        "margin_votes": int(line.get("leader_votes", 0)) - int(line.get("second_votes", 0)),
    }


def _totals(line: Line) -> dict[str, Any]:
    return {name: line.get(name, 0) for name in TOTAL_FIELDS}


def _provenance(line: Line) -> dict[str, Any]:
    return {
        "source": line.get("source", "tse"),
        "coverage": _coverage(line),
        "generation_id": str(line.get("generation_id") or ""),
        "tallied_at": iso(line.get("tallied_at")),
        "captured_at": iso(line.get("captured_at")),
        "jws_verified": bool(line.get("jws_verified")),
    }


async def montar_resultado(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None = None
) -> dict[str, Any]:
    info = await office_info(session, turno, cd)
    office = info[1] if info else None
    base: dict[str, Any] = {"geo_area": await geo_area_info(session, r), "office": office_json(office, cd)}
    line = await get_line(session, turno, cd, r, t)
    if line is None:
        return {"no_data": True, **base}
    system = office.voting_system if office else "majoritario"
    seats = _majoritarian_seats(office) if system == "majoritario" else 0
    coverage_flag = (cd == 1 and r.level == "country") or (cd != 1 and r.level == "state")
    cands = line.get("candidates") or []
    meta = await candidate_meta(session, [c["sq"] for c in cands])
    statuses = candidate_status.calcular(
        cands,
        seats,
        bool(line.get("final_tally")),
        bool(line.get("mathematically_decided")),
        coverage_flag,
    )
    return {
        "no_data": False,
        **base,
        **_provenance(line),
        "totals": _totals(line),
        "mathematically_decided": bool(line.get("mathematically_decided")),
        "final_tally": bool(line.get("final_tally")),
        "leader": _leader(line),
        "candidates": _result_candidates(cands, meta, statuses),
        "alliances": _result_alliances(line, system),
    }
