"""Result line of one geo area: the row the TSE published, or the sum of the ballot boxes collected.

A line is a plain dict with the keys of a result row (`candidates`, `alliances`, the totals...).
Both sources produce the same keys, so the callers do not care where a line came from.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.modules.ballot_reports import BallotBoxReport
from app.modules.geography import GeoArea, PollingPlace, PollingSection
from app.modules.results.models import CurrentResult, ResultSnapshot
from app.modules.results.queries.common import ballot_numbers_to_sq, pct

Line = dict[str, Any]


def row_as_dict(row: Row[Any]) -> dict[str, Any]:
    return dict(row._mapping)


async def _tse_row(
    session: AsyncSession,
    round_number: int,
    office_code: int,
    level: str,
    geo_area_id: str,
    at: datetime | None,
) -> CurrentResult | ResultSnapshot | None:
    if at is None:
        stmt_current = select(CurrentResult).where(
            CurrentResult.round == round_number,
            CurrentResult.office_code == office_code,
            CurrentResult.level == level,
            CurrentResult.geo_area_id == geo_area_id,
        )
        return (await session.execute(stmt_current)).scalar_one_or_none()
    stmt_snapshot = (
        select(ResultSnapshot)
        .where(
            ResultSnapshot.round == round_number,
            ResultSnapshot.office_code == office_code,
            ResultSnapshot.level == level,
            ResultSnapshot.geo_area_id == geo_area_id,
            ResultSnapshot.tallied_at <= at,
        )
        .order_by(ResultSnapshot.tallied_at.desc(), ResultSnapshot.generation_id.desc())
        .limit(1)
    )
    return (await session.execute(stmt_snapshot)).scalar_one_or_none()


async def tse_line(
    session: AsyncSession, turno: int, cd: int, nivel: str, rid: str, t: datetime | None
) -> Line | None:
    """Line the TSE published for the area: the current one, or the snapshot at `t`."""
    obj = await _tse_row(session, turno, cd, nivel, rid, t)
    if obj is None:
        return None
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}


def _sum_counts(target: dict[str, int], counts: dict[str, Any] | None) -> None:
    for key, qty in (counts or {}).items():
        target[key] = target.get(key, 0) + int(qty)


def _sum_votes(votes_per_box: list[dict[str, Any]]) -> tuple[dict[str, int], dict[str, int], int, int, int]:
    """Adds the ballot boxes: nominal votes, legend votes, turnout, blank and null."""
    nominal: dict[str, int] = {}
    legend: dict[str, int] = {}
    turnout = blank = null = 0
    for votes in votes_per_box:
        if not votes:
            continue
        turnout += int(votes.get("comp", 0))
        blank += int(votes.get("b", 0))
        null += int(votes.get("n", 0))
        _sum_counts(nominal, votes.get("nom"))
        _sum_counts(legend, votes.get("leg"))
    return nominal, legend, turnout, blank, null


def _ranked_candidates(nominal: dict[str, int], valid: int, sq_map: dict[int, str]) -> list[dict[str, Any]]:
    cands = [
        {
            "sq": sq_map.get(int(k), f"n{k}"),
            "v": q,
            "p": pct(q, valid),
            "e": False,
            "st": "",
            "d": "Válido",
            "num": int(k),
        }
        for k, q in nominal.items()
    ]
    return sorted(cands, key=lambda c: -c["v"])


def _leaders(cands: list[dict[str, Any]]) -> Line:
    leader = cands[0] if cands and cands[0]["v"] > 0 else None
    second = cands[1] if len(cands) > 1 else None
    return {
        "leader_candidate_id": leader["sq"] if leader else None,
        "leader_votes": leader["v"] if leader else 0,
        "leader_pct": leader["p"] if leader else 0.0,
        "second_candidate_id": second["sq"] if second else None,
        "second_votes": second["v"] if second else 0,
        "second_pct": second["p"] if second else 0.0,
        "margin_pp": round((leader["p"] if leader else 0) - (second["p"] if second else 0), 4),
    }


def _counts(turnout: int, blank: int, null: int, valid: int, tallied: int, sections_total: int) -> Line:
    total = valid + blank + null
    total_sections = max(sections_total, tallied)
    return {
        "sections_total": total_sections,
        "sections_tallied": tallied,
        "pct_sections": pct(tallied, total_sections),
        "turnout": turnout,
        "pct_turnout": 0.0,
        "abstention": 0,
        "pct_abstention": 0.0,
        "total_votes": total,
        "valid_votes": valid,
        "pct_valid": pct(valid, total),
        "blank_votes": blank,
        "pct_blank": pct(blank, total),
        "null_votes": null,
        "pct_null": pct(null, total),
        "mathematically_decided": False,
        "final_tally": tallied >= sections_total > 0,
    }


def sum_ballot_boxes(
    votes_per_box: list[dict[str, Any]], electorate: int, sections_total: int, sq_map: dict[int, str]
) -> Line:
    nominal, legend, turnout, blank, null = _sum_votes(votes_per_box)
    valid = sum(nominal.values()) + sum(legend.values())
    cands = _ranked_candidates(nominal, valid, sq_map)
    tallied = len([v for v in votes_per_box if v])
    return {
        "source": "soma_bu",
        "electorate": electorate,
        "tallied_electorate": 0,
        **_counts(turnout, blank, null, valid, tallied, sections_total),
        "candidates": cands,
        "alliances": [],
        **_leaders(cands),
        "generation_id": 0,
        "tallied_at": None,
        "captured_at": None,
        "jws_verified": False,
        "leader_party": None,
    }


async def _scope(
    session: AsyncSession, round_number: int, r: GeoArea
) -> tuple[list[ColumnElement[bool]], int, int]:
    """Filter of the ballot boxes of the area, its sections total and its electorate."""
    if r.level == "section":
        sec = await session.get(PollingSection, r.id)
        electorate = sec.eligible_voters if sec and sec.eligible_voters else 0
        return [BallotBoxReport.polling_section_id == r.id], 1, electorate
    if r.level == "polling_place":
        loc = await session.get(PollingPlace, r.id)
        sections = loc.section_count if loc else 0
        electorate = loc.eligible_voters if loc else 0
        return [BallotBoxReport.polling_place_id == r.id], sections, electorate
    zone_sections = PollingSection.electoral_zone_id == r.id
    sections_total = (
        await session.execute(select(func.count()).select_from(PollingSection).where(zone_sections))
    ).scalar_one()
    electorate_total = (
        await session.execute(
            select(func.coalesce(func.sum(PollingSection.eligible_voters), 0)).where(zone_sections)
        )
    ).scalar_one()
    return [BallotBoxReport.electoral_zone_id == r.id], int(sections_total), int(electorate_total or 0)


def _finish_line(line: Line, rows: Sequence[Any]) -> Line:
    """Adds what depends on the ballot box rows themselves: electorate, abstention and times."""
    tallied_electorate = sum(x[3] or 0 for x in rows)
    line["tallied_electorate"] = tallied_electorate
    line["abstention"] = max(0, tallied_electorate - line["turnout"])
    line["pct_turnout"] = pct(line["turnout"], tallied_electorate)
    line["pct_abstention"] = pct(line["abstention"], tallied_electorate)
    line["tallied_at"] = max((x[1] for x in rows if x[1]), default=None)
    line["captured_at"] = max((x[2] for x in rows if x[2]), default=None)
    return line


async def ballot_box_line(
    session: AsyncSession, round_number: int, office_code: int, r: GeoArea, at: datetime | None
) -> Line | None:
    """Result of a zone, polling place or section: the sum of the ballot boxes collected."""
    filters, sections_total, electorate = await _scope(session, round_number, r)
    filters.insert(0, BallotBoxReport.round == round_number)
    if at is not None:
        filters.append(BallotBoxReport.tallied_at <= at)
    rows = (
        await session.execute(
            select(
                BallotBoxReport.votes[str(office_code)],
                BallotBoxReport.tallied_at,
                BallotBoxReport.captured_at,
                BallotBoxReport.eligible_voters,
            ).where(*filters)
        )
    ).all()
    if not rows and r.level == "section":
        return None
    sq_map = await ballot_numbers_to_sq(session, round_number, office_code, r.state_code or "br")
    electorate_value = int(electorate or sum(x[3] or 0 for x in rows))
    line = sum_ballot_boxes([x[0] for x in rows], electorate_value, sections_total, sq_map)
    return _finish_line(line, rows)


async def get_line(
    session: AsyncSession, round_number: int, office_code: int, r: GeoArea, at: datetime | None
) -> Line | None:
    if r.level in ("country", "state", "municipality", "zone"):
        line = await tse_line(session, round_number, office_code, r.level, r.id, at)
        if line is not None or r.level != "zone":
            return line
    if r.level in ("zone", "polling_place", "section"):
        return await ballot_box_line(session, round_number, office_code, r, at)
    return None
