from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import CandidateTSE, ResultTSE
from app.modules.elections import Candidate, colors
from app.modules.elections import status as candidate_status

if TYPE_CHECKING:
    from app.modules.results.ingestion.results import ResultContext

BATCH = 500
_UPDATED_COLUMNS = (
    "name",
    "ballot_name",
    "party_abbreviation",
    "party_number",
    "alliance",
    "color",
    "vice_and_substitutes",
    "overall_status",
    "elected",
    "ballot_number",
)

# TSE ids of the candidates already written in this process; the worker clears it in tests.
known_candidate_ids: set[str] = set()


async def ensure_candidates(session: AsyncSession, ctx: ResultContext, res: ResultTSE, seats: int) -> None:
    """Writes the candidates when the office covers the whole geo area or when one of them is new."""
    if not ctx.has_nationwide_scope and all(
        c.tse_candidate_id in known_candidate_ids for c in res.candidates
    ):
        return
    await _upsert_candidates(session, ctx, res, seats)
    known_candidate_ids.update(c.tse_candidate_id for c in res.candidates)


async def _upsert_candidates(session: AsyncSession, ctx: ResultContext, res: ResultTSE, seats: int) -> None:
    statuses = candidate_status.calculate(
        [
            {
                "sq": c.tse_candidate_id,
                "v": c.votes,
                "e": c.elected,
                "st": c.tse_status,
                "d": c.vote_destination,
            }
            for c in res.candidates
        ],
        seats,
        res.final,
        res.mathematically_decided,
        ctx.has_nationwide_scope,
    )
    rows = [_candidate_row(ctx, c, statuses) for c in res.candidates]
    for i in range(0, len(rows), BATCH):
        stmt = insert(Candidate).values(rows[i : i + BATCH])
        if ctx.has_nationwide_scope:
            stmt = stmt.on_conflict_do_update(
                index_elements=["tse_candidate_id"],
                set_={c: getattr(stmt.excluded, c) for c in _UPDATED_COLUMNS},
            )
        else:
            stmt = stmt.on_conflict_do_nothing()
        await session.execute(stmt)


def _candidate_row(ctx: ResultContext, c: CandidateTSE, statuses: dict[str, str]) -> dict[str, Any]:
    return {
        "tse_candidate_id": c.tse_candidate_id,
        "election_id": ctx.election_id,
        "round": ctx.round,
        "office_code": ctx.office_code,
        "state_code": "br" if ctx.office_code == 1 else ctx.state_code,
        "ballot_number": c.number,
        "name": c.name,
        "ballot_name": c.ballot_name,
        "party_abbreviation": c.party_abbreviation,
        "party_number": c.party_number,
        "alliance": c.alliance,
        "color": colors.candidate_color(c.number, c.party_number, c.party_abbreviation),
        "vice_and_substitutes": [
            {"nome": v.name, "tipo": "vice" if v.kind == "v" else "suplente"} for v in c.running_mates
        ],
        "overall_status": statuses.get(c.tse_candidate_id, candidate_status.COUNTING),
        "elected": statuses.get(c.tse_candidate_id)
        in (candidate_status.ELECTED, candidate_status.MATHEMATICALLY_ELECTED),
    }
