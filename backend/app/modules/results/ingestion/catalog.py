"""Elections and offices of the current election event, from the TSE catalog."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.catalog import CargoCatalogo, Catalogo, PleitoCatalogo
from app.modules.elections import Election, ElectionOffice

SEATS_BY_MAJORITARIAN_OFFICE = {1: 1, 3: 1, 5: 2, 11: 1}
SECOND_ROUND_OFFICES = (1, 3, 11)


@dataclass(frozen=True)
class _ElectionRecord:
    code: int
    turn: int
    jurisdiction: str
    name: str
    offices: list[CargoCatalogo]


def _election_records(event: PleitoCatalogo) -> list[_ElectionRecord]:
    records: list[_ElectionRecord] = []
    for e in event.eleicoes:
        records.append(_ElectionRecord(e.cd, e.turno, e.tipo, e.nome, e.cargos))
        if e.cd_t2 and e.turno == 1:
            # the second round holds only the majoritarian offices that run twice
            second_round = [c for c in e.cargos if c.cd in SECOND_ROUND_OFFICES]
            if second_round:
                name = e.nome.replace("1º Turno", "2º Turno")
                records.append(_ElectionRecord(e.cd_t2, 2, e.tipo, name, second_round))
    return records


async def ingest_catalog(session: AsyncSession, catalog: Catalogo, environment: str) -> list[Election]:
    event = catalog.pleito_atual()
    if event is None:
        return []
    seen: set[int] = set()
    for record in _election_records(event):
        if record.code in seen:
            continue
        election_id = await _upsert_election(session, event, environment, record)
        for office in record.offices:
            await _upsert_office(session, election_id, office)
        seen.add(record.code)
    await session.flush()
    res = await session.execute(select(Election).where(Election.tse_environment == environment))
    return list(res.scalars())


async def _upsert_election(
    session: AsyncSession, event: PleitoCatalogo, environment: str, record: _ElectionRecord
) -> int:
    stmt = (
        insert(Election)
        .values(
            tse_environment=environment,
            cycle=event.ciclo,
            election_event_code=event.cd,
            election_code=record.code,
            round=record.turn,
            jurisdiction=record.jurisdiction,
            name=record.name,
            date=event.data,
            runoff_election_code=None,
        )
        .on_conflict_do_update(
            index_elements=["tse_environment", "election_code"],
            set_={
                "cycle": event.ciclo,
                "election_event_code": event.cd,
                "round": record.turn,
                "jurisdiction": record.jurisdiction,
                "name": record.name,
                "date": event.data,
            },
        )
        .returning(Election.id)
    )
    election_id: int = (await session.execute(stmt)).scalar_one()
    return election_id


async def _upsert_office(session: AsyncSession, election_id: int, office: CargoCatalogo) -> None:
    seats = SEATS_BY_MAJORITARIAN_OFFICE.get(office.cd) if office.sistema == "majoritario" else None
    await session.execute(
        insert(ElectionOffice)
        .values(
            election_id=election_id,
            office_code=office.cd,
            name=office.nome,
            voting_system=office.sistema,
            coverage=office.abrangencia,
            seats=seats,
        )
        .on_conflict_do_update(
            index_elements=["election_id", "office_code"],
            set_={"name": office.nome, "voting_system": office.sistema, "seats": seats},
        )
    )
