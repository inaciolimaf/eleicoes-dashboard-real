from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.geography import PollingPlace, PollingSection


@dataclass(frozen=True)
class _PlaceContext:
    round_number: int
    place_id: str
    place: PollingPlace
    total_sections: int
    last_tally: datetime | None
    numbers: dict[tuple[int, int], str]


@dataclass(frozen=True)
class _Standing:
    valid: int
    leader: tuple[str, int] | None
    leader_pct: float
    second_pct: float


async def recalculate_polling_place(
    session: AsyncSession, round_number: int, place_id: str, numbers: dict[tuple[int, int], str]
) -> list[tuple[int, str]]:
    """Recalculates the result of each office of a polling place. Returns [(office code, place id)]."""
    place = await session.get(PollingPlace, place_id)
    if place is None:
        return []
    reports = await _reports_of_place(session, round_number, place_id)
    ctx = _PlaceContext(
        round_number=round_number,
        place_id=place_id,
        place=place,
        total_sections=await _total_sections(session, place, place_id),
        last_tally=max((b.tallied_at for b in reports if b.tallied_at), default=None),
        numbers=numbers,
    )
    changed: list[tuple[int, str]] = []
    for office_key, figures in _sum_reports(reports).items():
        office_code = int(office_key)
        await _upsert_place_result(session, _place_result_row(ctx, office_code, figures))
        changed.append((office_code, place_id))
    return changed


async def _reports_of_place(session: AsyncSession, round_number: int, place_id: str) -> list[BallotBoxReport]:
    result = await session.execute(
        select(BallotBoxReport).where(
            BallotBoxReport.round == round_number, BallotBoxReport.polling_place_id == place_id
        )
    )
    return list(result.scalars().all())


async def _total_sections(session: AsyncSession, place: PollingPlace, place_id: str) -> int:
    if place.section_count:
        return place.section_count
    count: int = (
        await session.execute(
            select(func.count())
            .select_from(PollingSection)
            .where(PollingSection.polling_place_id == place_id)
        )
    ).scalar_one()
    return count


def _sum_reports(reports: list[BallotBoxReport]) -> dict[str, dict[str, Any]]:
    sums: dict[str, dict[str, Any]] = {}
    for report in reports:
        for office_key, votes in (report.votes or {}).items():
            total = sums.setdefault(
                office_key, {"comp": 0, "b": 0, "n": 0, "nom": {}, "leg": {}, "secoes": 0}
            )
            _add_votes(total, votes)
            total["secoes"] += 1
    return sums


def _add_votes(total: dict[str, Any], votes: dict[str, Any]) -> None:
    total["comp"] += votes.get("comp", 0)
    total["b"] += votes.get("b", 0)
    total["n"] += votes.get("n", 0)
    for key in ("nom", "leg"):
        for number, count in (votes.get(key) or {}).items():
            total[key][number] = total[key].get(number, 0) + count


def _standing(figures: dict[str, Any]) -> _Standing:
    ordering = sorted(figures["nom"].items(), key=lambda kv: -kv[1])
    valid = sum(figures["nom"].values()) + sum(figures["leg"].values())
    leader = ordering[0] if ordering and ordering[0][1] > 0 else None
    second = ordering[1] if len(ordering) > 1 else None
    return _Standing(
        valid=valid,
        leader=leader,
        leader_pct=leader[1] * 100.0 / valid if leader and valid else 0.0,
        second_pct=second[1] * 100.0 / valid if second and valid else 0.0,
    )


def _place_status(tallied: int, total: int) -> str:
    if total and tallied >= total:
        return "tallied"
    return "partial" if tallied else "not_received"


def _place_result_row(ctx: _PlaceContext, office_code: int, figures: dict[str, Any]) -> dict[str, Any]:
    standing = _standing(figures)
    tallied = figures["secoes"]
    leader_number = ctx.numbers.get((office_code, int(standing.leader[0]))) if standing.leader else None
    return {
        "round": ctx.round_number,
        "office_code": office_code,
        "polling_place_id": ctx.place_id,
        "municipality_id": ctx.place.municipality_id,
        "state_code": ctx.place.state_code,
        "sections_total": max(ctx.total_sections, tallied),
        "sections_tallied": tallied,
        "status": _place_status(tallied, ctx.total_sections),
        "turnout": figures["comp"],
        "valid_votes": standing.valid,
        "blank_votes": figures["b"],
        "null_votes": figures["n"],
        "leader_candidate_id": leader_number,
        "leader_pct": round(standing.leader_pct, 4),
        "margin_pp": round(standing.leader_pct - standing.second_pct, 4),
        "votes": {"nom": figures["nom"], "leg": figures["leg"]},
        "updated_at": ctx.last_tally,
    }


async def _upsert_place_result(session: AsyncSession, row: dict[str, Any]) -> None:
    stmt = insert(PollingPlaceResult).values(**row)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["round", "office_code", "polling_place_id"],
            set_={
                k: getattr(stmt.excluded, k)
                for k in row
                if k not in ("round", "office_code", "polling_place_id")
            },
        )
    )
