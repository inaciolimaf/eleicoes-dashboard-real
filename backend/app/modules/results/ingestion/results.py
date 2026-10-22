from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import AllianceTSE, CandidateTSE, ResultTSE, TotalsTSE
from app.modules.geography import Municipality
from app.modules.results.ingestion.candidates import ensure_candidates
from app.modules.results.ingestion.common import now
from app.modules.results.models import CurrentResult, ResultSnapshot

_CURRENT_KEY = ("round", "office_code", "level", "geo_area_id")


@dataclass
class ResultContext:
    """What the worker knows about the file of a result before it is written."""

    round: int
    election_id: int
    office_code: int
    level: str
    geo_area_id: str
    parent_id: str
    state_code: str
    source_file: str | None = None
    jws_verified: bool = False
    captured_at: datetime | None = None

    @property
    def has_nationwide_scope(self) -> bool:
        return (self.office_code == 1 and self.level == "country") or (
            self.office_code != 1 and self.level == "state"
        )


async def ingest_result(
    session: AsyncSession, ctx: ResultContext, res: ResultTSE, system: str, seats: int | None
) -> tuple[dict[str, Any] | None, dict[str, Any]] | None:
    """Writes the snapshot and the current result.

    Returns (previous state, new), or None if the snapshot already existed.

    The previous state is read only for the country and state levels (event detection); elsewhere the
    upsert is conditional.
    """
    row = _result_row(ctx, res, system)
    if not await _insert_snapshot(session, row):
        await session.rollback()
        return None
    seats_effective = (seats if system == "majoritario" else 0) or 0
    await ensure_candidates(session, ctx, res, seats_effective)
    previous = await _previous_state(session, ctx)
    await _upsert_current(session, row)
    if ctx.level == "municipality" and ctx.office_code == 1:
        await session.execute(
            update(Municipality)
            .where(Municipality.id == ctx.geo_area_id)
            .values(electorate=row["electorate"])
        )
    await session.flush()
    return previous, row


def _result_row(ctx: ResultContext, res: ResultTSE, system: str) -> dict[str, Any]:
    row: dict[str, Any] = {
        "election_id": ctx.election_id,
        "round": ctx.round,
        "office_code": ctx.office_code,
        "level": ctx.level,
        "geo_area_id": ctx.geo_area_id,
        "parent_id": ctx.parent_id,
        "state_code": ctx.state_code,
        "generation_id": int(res.generation_id or 0),
        "tallied_at": res.tallied_at or ctx.captured_at or now(),
        "captured_at": ctx.captured_at or now(),
        "jws_verified": ctx.jws_verified,
        "source": "tse",
        "source_file": ctx.source_file,
    }
    row.update(_totals_columns(res.totals))
    row.update(_ranking_columns(res, system))
    return row


def _totals_columns(t: TotalsTSE) -> dict[str, Any]:
    return {
        "electorate": t.electorate,
        "tallied_electorate": t.tallied_electorate,
        "sections_total": t.sections_total,
        "sections_tallied": t.sections_tallied,
        "pct_sections": t.pct_sections,
        "turnout": t.turnout,
        "pct_turnout": t.pct_turnout,
        "abstention": t.abstention,
        "pct_abstention": t.pct_abstention,
        "total_votes": t.total_votes,
        "valid_votes": t.valid_votes,
        "pct_valid": t.pct_valid,
        "blank_votes": t.blank_votes,
        "pct_blank": t.pct_blank,
        "null_votes": t.null_votes,
        "pct_null": t.pct_null,
    }


def _ranking_columns(res: ResultTSE, system: str) -> dict[str, Any]:
    ranked = sorted((c for c in res.candidates if c.vote_destination.startswith("V")), key=lambda c: -c.votes)
    leader = ranked[0] if ranked and ranked[0].votes > 0 else None
    second = ranked[1] if len(ranked) > 1 and ranked[1].votes > 0 else None
    leader_pct = leader.pct_valid if leader else 0
    second_pct = second.pct_valid if second else 0
    return {
        "mathematically_decided": res.mathematically_decided,
        "final_tally": res.final,
        "leader_candidate_id": leader.tse_candidate_id if leader else None,
        "leader_votes": leader.votes if leader else 0,
        "leader_pct": leader.pct_valid if leader else 0.0,
        "second_candidate_id": second.tse_candidate_id if second else None,
        "second_votes": second.votes if second else 0,
        "second_pct": second.pct_valid if second else 0.0,
        "margin_pp": round(leader_pct - second_pct, 4),
        "leader_party": _leader_party(res, system),
        "candidates": [_candidate_line(c) for c in res.candidates],
        "alliances": [_alliance_line(a) for a in res.alliances],
    }


def _candidate_line(c: CandidateTSE) -> dict[str, Any]:
    return {
        "sq": c.tse_candidate_id,
        "v": c.votes,
        "p": round(c.pct_valid, 4),
        "e": c.elected,
        "st": c.tse_status,
        "d": c.vote_destination,
    }


def _alliance_line(a: AllianceTSE) -> dict[str, Any]:
    return {"nome": a.name, "partidos": a.parties, "v": a.votes, "vag": a.seats, "n": a.number}


def _leader_party(res: ResultTSE, system: str) -> str | None:
    if not res.alliances or system != "proporcional":
        return None
    return max(res.alliances, key=lambda a: a.votes).name


async def _insert_snapshot(session: AsyncSession, row: dict[str, Any]) -> bool:
    result = await session.execute(
        insert(ResultSnapshot)
        .values(**row)
        .on_conflict_do_nothing(
            index_elements=["round", "office_code", "level", "geo_area_id", "generation_id"]
        )
        .returning(ResultSnapshot.id)
    )
    return result.scalar_one_or_none() is not None


async def _previous_state(session: AsyncSession, ctx: ResultContext) -> dict[str, Any] | None:
    if ctx.level not in ("country", "state"):
        return None
    current: CurrentResult | None = (
        await session.execute(
            select(CurrentResult).where(
                CurrentResult.round == ctx.round,
                CurrentResult.office_code == ctx.office_code,
                CurrentResult.level == ctx.level,
                CurrentResult.geo_area_id == ctx.geo_area_id,
            )
        )
    ).scalar_one_or_none()
    return _row_as_dict(current) if current else None


async def _upsert_current(session: AsyncSession, row: dict[str, Any]) -> None:
    stmt = insert(CurrentResult).values(**row)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=list(_CURRENT_KEY),
            set_={k: getattr(stmt.excluded, k) for k in row if k not in _CURRENT_KEY},
            where=(CurrentResult.tallied_at < stmt.excluded.tallied_at)
            | (
                (CurrentResult.tallied_at == stmt.excluded.tallied_at)
                & (CurrentResult.generation_id <= stmt.excluded.generation_id)
            ),
        )
    )


def _row_as_dict(obj: CurrentResult) -> dict[str, Any]:
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}
