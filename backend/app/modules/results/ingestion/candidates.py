from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import CandidateTSE, ResultadoTSE
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


async def ensure_candidates(session: AsyncSession, ctx: ResultContext, res: ResultadoTSE, seats: int) -> None:
    """Writes the candidates when the office covers the whole geo area or when one of them is new."""
    if not ctx.abrangencia_do_cargo and all(c.sqcand in known_candidate_ids for c in res.candidatos):
        return
    await _upsert_candidates(session, ctx, res, seats)
    known_candidate_ids.update(c.sqcand for c in res.candidatos)


async def _upsert_candidates(
    session: AsyncSession, ctx: ResultContext, res: ResultadoTSE, seats: int
) -> None:
    statuses = candidate_status.calculate(
        [
            {"sq": c.sqcand, "v": c.votos, "e": c.eleito, "st": c.situacao_tse, "d": c.destinacao}
            for c in res.candidatos
        ],
        seats,
        res.final,
        res.matematicamente_definido,
        ctx.abrangencia_do_cargo,
    )
    rows = [_candidate_row(ctx, c, statuses) for c in res.candidatos]
    for i in range(0, len(rows), BATCH):
        stmt = insert(Candidate).values(rows[i : i + BATCH])
        if ctx.abrangencia_do_cargo:
            stmt = stmt.on_conflict_do_update(
                index_elements=["tse_candidate_id"],
                set_={c: getattr(stmt.excluded, c) for c in _UPDATED_COLUMNS},
            )
        else:
            stmt = stmt.on_conflict_do_nothing()
        await session.execute(stmt)


def _candidate_row(ctx: ResultContext, c: CandidateTSE, statuses: dict[str, str]) -> dict[str, Any]:
    return {
        "tse_candidate_id": c.sqcand,
        "election_id": ctx.eleicao_id,
        "round": ctx.turno,
        "office_code": ctx.cd_cargo,
        "state_code": "br" if ctx.cd_cargo == 1 else ctx.uf,
        "ballot_number": c.numero,
        "name": c.nome,
        "ballot_name": c.nome_urna,
        "party_abbreviation": c.partido_sigla,
        "party_number": c.partido_numero,
        "alliance": c.agremiacao,
        "color": colors.candidate_color(c.numero, c.partido_numero, c.partido_sigla),
        "vice_and_substitutes": [
            {"nome": v.nome, "tipo": "vice" if v.tipo == "v" else "suplente"} for v in c.vices
        ],
        "overall_status": statuses.get(c.sqcand, candidate_status.COUNTING),
        "elected": statuses.get(c.sqcand)
        in (candidate_status.ELECTED, candidate_status.MATHEMATICALLY_ELECTED),
    }
