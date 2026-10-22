"""Elections and offices of the current election event, from the TSE catalog."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.catalog import Catalog, CatalogEvent, CatalogOffice
from app.modules.elections import Election, ElectionOffice

SEATS_BY_MAJORITARIAN_OFFICE = {1: 1, 3: 1, 5: 2, 11: 1}
SECOND_ROUND_OFFICES = (1, 3, 11)


@dataclass(frozen=True)
class _ElectionRecord:
    code: int
    turn: int
    jurisdiction: str
    name: str
    offices: list[CatalogOffice]


def _election_records(event: CatalogEvent) -> list[_ElectionRecord]:
    records: list[_ElectionRecord] = []
    for e in event.elections:
        records.append(_ElectionRecord(e.cd, e.round, e.tipo, e.name, e.offices))
        if e.cd_t2 and e.round == 1:
            # the second round holds only the majoritarian offices that run twice
            second_round = [c for c in e.offices if c.cd in SECOND_ROUND_OFFICES]
            if second_round:
                name = e.name.replace("1º Turno", "2º Turno")
                records.append(_ElectionRecord(e.cd_t2, 2, e.tipo, name, second_round))
    return records


async def ingest_catalog(session: AsyncSession, catalog: Catalog, environment: str) -> list[Election]:
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
    session: AsyncSession, event: CatalogEvent, environment: str, record: _ElectionRecord
) -> int:
    stmt = (
        insert(Election)
        .values(
            tse_environment=environment,
            cycle=event.cycle,
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
                "cycle": event.cycle,
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


async def _upsert_office(session: AsyncSession, election_id: int, office: CatalogOffice) -> None:
    seats = SEATS_BY_MAJORITARIAN_OFFICE.get(office.cd) if office.system == "majoritario" else None
    await session.execute(
        insert(ElectionOffice)
        .values(
            election_id=election_id,
            office_code=office.cd,
            name=office.name,
            voting_system=office.system,
            coverage=office.abrangencia,
            seats=seats,
        )
        .on_conflict_do_update(
            index_elements=["election_id", "office_code"],
            set_={"name": office.name, "voting_system": office.system, "seats": seats},
        )
    )
