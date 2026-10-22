"""Polling places and their sections, from the open-data CSV that the TSE publishes."""

from __future__ import annotations

import csv
import io
import zipfile
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.geography import (
    Municipality,
    PollingPlace,
    PollingSection,
    municipality_id_of,
    polling_place_id_of,
    section_id_of,
    zone_id_of,
)
from app.modules.results.ingestion.geography.areas import insert_zones

PLACE_BATCH = 1000
# the Brazil file has about 500 thousand sections: they are written in blocks of this size
SECTIONS_PER_WRITE = 3000
_PLACE_UPDATED_COLUMNS = (
    "name",
    "address",
    "neighborhood",
    "zip_code",
    "lat",
    "lon",
    "is_approximate",
    "eligible_voters",
    "section_count",
)


def read_polling_place_csv(content: bytes) -> Iterator[dict[str, Any]]:
    """CSV of the Open Data Portal (';' separator, latin-1). Also accepts a .zip with the CSV inside.

    The official zip has one CSV per state and a "_BRASIL" file with all of them: it uses the Brazil
    file (or, without it, every CSV).
    """
    if content[:2] != b"PK":
        yield from _csv_rows(io.StringIO(content.decode("latin-1")))
        return
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
        brazil = [n for n in names if "brasil" in n.lower()]
        for name in brazil or names:
            with archive.open(name) as f:
                yield from _csv_rows(io.TextIOWrapper(f, encoding="latin-1", newline=""))


def _csv_rows(stream: Iterable[str]) -> Iterator[dict[str, Any]]:
    yield from csv.DictReader(stream, delimiter=";")


def _coordinate(value: object) -> float | None:
    try:
        v = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return None if v in (-1.0, 0.0) else v


@dataclass(frozen=True)
class _CsvSection:
    uf: str
    cd_mun: int
    zone: int
    section: int
    place_number: int


def _parse_csv_section(row: Mapping[str, Any]) -> _CsvSection | None:
    try:
        return _CsvSection(
            uf=str(row.get("SG_UF", "")).lower(),
            cd_mun=int(row["CD_MUNICIPIO"]),
            zone=int(row["NR_ZONA"]),
            section=int(row["NR_SECAO"]),
            place_number=int(row["NR_LOCAL_VOTACAO"]),
        )
    except (KeyError, ValueError, TypeError):
        return None


class _PollingPlaceLoad:
    """Rows of the CSV, grouped by polling place, until they are written."""

    def __init__(self, municipalities: dict[str, Municipality]) -> None:
        self.municipalities = municipalities
        self.places: dict[str, dict[str, Any]] = {}
        self.zones: dict[str, dict[str, Any]] = {}
        self.sections: list[dict[str, Any]] = []

    def add(self, row: Mapping[str, Any]) -> None:
        parsed = _parse_csv_section(row)
        if parsed is None:
            return
        municipality = self.municipalities.get(municipality_id_of(parsed.uf, parsed.cd_mun))
        if municipality is None:
            return
        municipality_key = municipality.id
        place_key = polling_place_id_of(parsed.uf, parsed.cd_mun, parsed.zone, parsed.place_number)
        zone_key = zone_id_of(parsed.uf, parsed.cd_mun, parsed.zone)
        self.zones[zone_key] = {
            "id": zone_key,
            "municipality_id": municipality_key,
            "state_code": parsed.uf,
            "number": parsed.zone,
        }
        voters = int(row.get("QT_ELEITOR_SECAO") or row.get("QT_ELEITOR") or 0)
        place = self.places.get(place_key)
        if place is None:
            place = self.places[place_key] = _new_place(row, parsed, municipality, place_key, zone_key)
        place["eligible_voters"] += voters
        place["section_count"] += 1
        self.sections.append(_section_row(parsed, municipality_key, zone_key, place_key, voters))


def _new_place(
    row: Mapping[str, Any], parsed: _CsvSection, municipality: Municipality, place_key: str, zone_key: str
) -> dict[str, Any]:
    lat = _coordinate(row.get("NR_LATITUDE"))
    lon = _coordinate(row.get("NR_LONGITUDE"))
    approximate = lat is None or lon is None
    return {
        "id": place_key,
        "municipality_id": municipality.id,
        "electoral_zone_id": zone_key,
        "state_code": parsed.uf,
        "number": parsed.place_number,
        "name": str(row.get("NM_LOCAL_VOTACAO") or f"LOCAL {parsed.place_number}").strip(),
        "address": (row.get("DS_ENDERECO") or "").strip() or None,
        "neighborhood": (row.get("NM_BAIRRO") or "").strip() or None,
        "zip_code": (row.get("NR_CEP") or "").strip() or None,
        "lat": municipality.lat if approximate else lat,
        "lon": municipality.lon if approximate else lon,
        "is_approximate": approximate,
        "eligible_voters": 0,
        "section_count": 0,
    }


def _section_row(
    parsed: _CsvSection, municipality_key: str, zone_key: str, place_key: str, voters: int
) -> dict[str, Any]:
    return {
        "id": section_id_of(parsed.uf, parsed.cd_mun, parsed.zone, parsed.section),
        "municipality_id": municipality_key,
        "electoral_zone_id": zone_key,
        "polling_place_id": place_key,
        "state_code": parsed.uf,
        "number": parsed.section,
        "eligible_voters": voters,
    }


async def import_polling_places(session: AsyncSession, rows: Iterable[Mapping[str, Any]]) -> int:
    municipalities = {m.id: m for m in (await session.execute(select(Municipality))).scalars()}
    load = _PollingPlaceLoad(municipalities)
    for row in rows:
        load.add(row)
        if len(load.sections) >= SECTIONS_PER_WRITE:
            await _write_sections(session, load.sections)
            load.sections = []
    if load.sections:
        await _write_sections(session, load.sections)
    await insert_zones(session, list(load.zones.values()))
    await _upsert_places(session, list(load.places.values()))
    await session.flush()
    return len(load.places)


async def _write_sections(session: AsyncSession, sections: list[dict[str, Any]]) -> None:
    stmt = insert(PollingSection).values(sections)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "polling_place_id": stmt.excluded.polling_place_id,
                "eligible_voters": stmt.excluded.eligible_voters,
            },
        )
    )


async def _upsert_places(session: AsyncSession, places: list[dict[str, Any]]) -> None:
    for i in range(0, len(places), PLACE_BATCH):
        stmt = insert(PollingPlace).values(places[i : i + PLACE_BATCH])
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={c: getattr(stmt.excluded, c) for c in _PLACE_UPDATED_COLUMNS},
            )
        )
