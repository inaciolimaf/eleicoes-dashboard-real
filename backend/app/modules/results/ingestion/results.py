from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import AllianceTSE, CandidateTSE, ResultadoTSE, TotalsTSE
from app.modules.geography import Municipality
from app.modules.results.ingestion.candidates import ensure_candidates
from app.modules.results.ingestion.common import now
from app.modules.results.models import CurrentResult, ResultSnapshot

_CURRENT_KEY = ("round", "office_code", "level", "geo_area_id")


@dataclass
class ResultContext:
    """What the worker knows about the file of a result before it is written."""

    turno: int
    eleicao_id: int
    cd_cargo: int
    nivel: str
    recorte_id: str
    pai_id: str
    uf: str
    arquivo: str | None = None
    jws_verificado: bool = False
    capturado_em: datetime | None = None

    @property
    def abrangencia_do_cargo(self) -> bool:
        return (self.cd_cargo == 1 and self.nivel == "country") or (
            self.cd_cargo != 1 and self.nivel == "state"
        )


async def ingest_result(
    session: AsyncSession, ctx: ResultContext, res: ResultadoTSE, system: str, seats: int | None
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
    if ctx.nivel == "municipality" and ctx.cd_cargo == 1:
        await session.execute(
            update(Municipality).where(Municipality.id == ctx.recorte_id).values(electorate=row["electorate"])
        )
    await session.flush()
    return previous, row


def _result_row(ctx: ResultContext, res: ResultadoTSE, system: str) -> dict[str, Any]:
    row: dict[str, Any] = {
        "election_id": ctx.eleicao_id,
        "round": ctx.turno,
        "office_code": ctx.cd_cargo,
        "level": ctx.nivel,
        "geo_area_id": ctx.recorte_id,
        "parent_id": ctx.pai_id,
        "state_code": ctx.uf,
        "generation_id": int(res.idg or 0),
        "tallied_at": res.totalizado_em or ctx.capturado_em or now(),
        "captured_at": ctx.capturado_em or now(),
        "jws_verified": ctx.jws_verificado,
        "source": "tse",
        "source_file": ctx.arquivo,
    }
    row.update(_totals_columns(res.totais))
    row.update(_ranking_columns(res, system))
    return row


def _totals_columns(t: TotalsTSE) -> dict[str, Any]:
    return {
        "electorate": t.eleitorado,
        "tallied_electorate": t.eleitorado_apurado,
        "sections_total": t.secoes_total,
        "sections_tallied": t.secoes_totalizadas,
        "pct_sections": t.pct_secoes,
        "turnout": t.comparecimento,
        "pct_turnout": t.pct_comparecimento,
        "abstention": t.abstencao,
        "pct_abstention": t.pct_abstencao,
        "total_votes": t.votos_total,
        "valid_votes": t.votos_validos,
        "pct_valid": t.pct_validos,
        "blank_votes": t.brancos,
        "pct_blank": t.pct_brancos,
        "null_votes": t.nulos,
        "pct_null": t.pct_nulos,
    }


def _ranking_columns(res: ResultadoTSE, system: str) -> dict[str, Any]:
    ranked = sorted((c for c in res.candidatos if c.destinacao.startswith("V")), key=lambda c: -c.votos)
    leader = ranked[0] if ranked and ranked[0].votos > 0 else None
    second = ranked[1] if len(ranked) > 1 and ranked[1].votos > 0 else None
    leader_pct = leader.pct_validos if leader else 0
    second_pct = second.pct_validos if second else 0
    return {
        "mathematically_decided": res.matematicamente_definido,
        "final_tally": res.final,
        "leader_candidate_id": leader.sqcand if leader else None,
        "leader_votes": leader.votos if leader else 0,
        "leader_pct": leader.pct_validos if leader else 0.0,
        "second_candidate_id": second.sqcand if second else None,
        "second_votes": second.votos if second else 0,
        "second_pct": second.pct_validos if second else 0.0,
        "margin_pp": round(leader_pct - second_pct, 4),
        "leader_party": _leader_party(res, system),
        "candidates": [_candidate_line(c) for c in res.candidatos],
        "alliances": [_alliance_line(a) for a in res.agremiacoes],
    }


def _candidate_line(c: CandidateTSE) -> dict[str, Any]:
    return {
        "sq": c.sqcand,
        "v": c.votos,
        "p": round(c.pct_validos, 4),
        "e": c.eleito,
        "st": c.situacao_tse,
        "d": c.destinacao,
    }


def _alliance_line(a: AllianceTSE) -> dict[str, Any]:
    return {"nome": a.nome, "partidos": a.partidos, "v": a.votos, "vag": a.vagas, "n": a.numero}


def _leader_party(res: ResultadoTSE, system: str) -> str | None:
    if not res.agremiacoes or system != "proporcional":
        return None
    return max(res.agremiacoes, key=lambda a: a.votos).nome


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
    if ctx.nivel not in ("country", "state"):
        return None
    current: CurrentResult | None = (
        await session.execute(
            select(CurrentResult).where(
                CurrentResult.round == ctx.turno,
                CurrentResult.office_code == ctx.cd_cargo,
                CurrentResult.level == ctx.nivel,
                CurrentResult.geo_area_id == ctx.recorte_id,
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
