from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.bu import BoletimUrna, VotoBU
from app.modules.ballot_reports import BallotBoxReport
from app.modules.elections import Candidate
from app.modules.geography import (
    ElectoralZone,
    Municipality,
    PollingPlace,
    PollingSection,
    local_id,
    municipio_id,
    secao_id,
    zona_id,
)
from app.modules.results.ingestion.common import now
from app.modules.results.ingestion.tally import recalculate_polling_place


@dataclass(frozen=True)
class BallotReportContext:
    """What the worker knows about the file of a ballot box report before it is written."""

    hash: str
    status: str
    totalizado_em: datetime | None
    url: str | None
    numeros: dict[tuple[int, int], str]


@dataclass(frozen=True)
class _Keys:
    state_code: str
    municipality_id: str
    zone_id: str
    place_id: str
    section_id: str


async def candidate_number_map(
    session: AsyncSession, round_number: int, uf: str
) -> dict[tuple[int, int], str]:
    """(office code, ballot number) -> TSE candidate id, for President (uf=br) and the UF's state offices."""
    result = await session.execute(
        select(Candidate.office_code, Candidate.ballot_number, Candidate.tse_candidate_id).where(
            Candidate.round == round_number, Candidate.state_code.in_(["br", uf])
        )
    )
    return {(int(c), int(n)): sq for c, n, sq in result.all()}


async def ingest_ballot_report(
    session: AsyncSession,
    round_number: int,
    uf: str,
    bu: BoletimUrna,
    ctx: BallotReportContext,
) -> list[tuple[int, str]]:
    """Writes the report and recalculates its polling place. Returns the [(office code, place id)] changed."""
    keys = _keys(uf, bu)
    municipality = await session.get(Municipality, keys.municipality_id)
    if municipality is None:
        return []
    await _ensure_place(session, bu, keys, municipality)
    await _upsert_section(session, bu, keys)
    await _upsert_report(session, _report_row(round_number, ctx, bu, keys))
    changed = await recalculate_polling_place(session, round_number, keys.place_id, ctx.numeros)
    await session.flush()
    return changed


def _keys(uf: str, bu: BoletimUrna) -> _Keys:
    return _Keys(
        state_code=uf,
        municipality_id=municipio_id(uf, bu.municipio),
        zone_id=zona_id(uf, bu.municipio, bu.zona),
        place_id=local_id(uf, bu.municipio, bu.zona, bu.local),
        section_id=secao_id(uf, bu.municipio, bu.zona, bu.secao),
    )


async def _ensure_place(
    session: AsyncSession, bu: BoletimUrna, keys: _Keys, municipality: Municipality
) -> None:
    if await session.get(PollingPlace, keys.place_id) is not None:
        return
    await session.execute(
        insert(PollingPlace)
        .values(
            id=keys.place_id,
            municipality_id=keys.municipality_id,
            electoral_zone_id=keys.zone_id,
            state_code=keys.state_code,
            number=bu.local,
            name=f"LOCAL DE VOTAÇÃO {bu.local}",
            lat=municipality.lat,
            lon=municipality.lon,
            is_approximate=True,
            eligible_voters=0,
            section_count=0,
        )
        .on_conflict_do_nothing()
    )
    await session.execute(
        insert(ElectoralZone)
        .values(
            id=keys.zone_id,
            municipality_id=keys.municipality_id,
            state_code=keys.state_code,
            number=bu.zona,
        )
        .on_conflict_do_nothing()
    )


async def _upsert_section(session: AsyncSession, bu: BoletimUrna, keys: _Keys) -> None:
    await session.execute(
        insert(PollingSection)
        .values(
            id=keys.section_id,
            municipality_id=keys.municipality_id,
            electoral_zone_id=keys.zone_id,
            polling_place_id=keys.place_id,
            state_code=keys.state_code,
            number=bu.secao,
            eligible_voters=bu.eleitores_aptos,
        )
        .on_conflict_do_update(index_elements=["id"], set_={"polling_place_id": keys.place_id})
    )


def _report_row(round_number: int, ctx: BallotReportContext, bu: BoletimUrna, keys: _Keys) -> dict[str, Any]:
    return {
        "round": round_number,
        "polling_section_id": keys.section_id,
        "polling_place_id": keys.place_id,
        "electoral_zone_id": keys.zone_id,
        "municipality_id": keys.municipality_id,
        "state_code": keys.state_code,
        "hash": ctx.hash,
        "status": ctx.status,
        "tallied_at": ctx.totalizado_em,
        "issued_at": bu.emitido_em,
        "captured_at": now(),
        "eligible_voters": bu.eleitores_aptos,
        "turnout": bu.comparecimento,
        "signature_valid": None,
        "url": ctx.url,
        "votes": _votes_by_office(bu),
    }


def _votes_by_office(bu: BoletimUrna) -> dict[str, dict[str, Any]]:
    votes: dict[str, dict[str, Any]] = {}
    for cargo in bu.cargos:
        nominal, legend = _split_votes(cargo.votos)
        votes[str(cargo.cd_cargo)] = {
            "comp": cargo.comparecimento,
            "b": cargo.brancos,
            "n": cargo.nulos,
            "nom": nominal,
            "leg": legend,
        }
    return votes


def _split_votes(votes: list[VotoBU]) -> tuple[dict[str, int], dict[str, int]]:
    nominal: dict[str, int] = {}
    legend: dict[str, int] = {}
    for v in votes:
        if v.numero is None:
            continue
        if v.tipo == "nominal":
            nominal[str(v.numero)] = nominal.get(str(v.numero), 0) + v.votos
        elif v.tipo == "legenda":
            legend[str(v.numero)] = legend.get(str(v.numero), 0) + v.votos
    return nominal, legend


async def _upsert_report(session: AsyncSession, row: dict[str, Any]) -> None:
    stmt = insert(BallotBoxReport).values(**row)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["round", "polling_section_id"],
            set_={k: getattr(stmt.excluded, k) for k in row if k not in ("round", "polling_section_id")},
        )
    )
