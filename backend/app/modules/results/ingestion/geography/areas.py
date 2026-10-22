"""Municipalities, electoral zones and voting sections, from the TSE files."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import MunicipioTSE, SecaoTSE
from app.modules.geography import (
    ElectoralZone,
    Municipality,
    PollingSection,
    municipality_id_of,
    section_id_of,
    zone_id_of,
)

MUNICIPALITY_BATCH = 1000
ZONE_BATCH = 2000
SECTION_BATCH = 3000
_LOWERCASE_WORDS = {"de", "da", "do", "das", "dos", "e", "d'"}


def proper_name(name: str) -> str:
    words = name.lower().split()
    return " ".join(w if i and w in _LOWERCASE_WORDS else w[:1].upper() + w[1:] for i, w in enumerate(words))


async def ingest_municipalities(
    session: AsyncSession, municipalities: list[MunicipioTSE], geo: Mapping[int, tuple[Any, ...]]
) -> int:
    """`geo`: IBGE code -> (lat, lon[, name with the correct spelling])."""
    rows: list[dict[str, Any]] = []
    zones: list[dict[str, Any]] = []
    for m in municipalities:
        key = municipality_id_of(m.uf, m.cd)
        rows.append(_municipality_row(m, geo.get(m.cd_ibge or -1, ()), key))
        zones.extend(_zone_row(m.uf, m.cd, z, key) for z in m.zonas)
    await _upsert_municipalities(session, rows)
    await insert_zones(session, zones)
    await session.flush()
    return len(rows)


def _municipality_row(m: MunicipioTSE, geo: tuple[Any, ...], key: str) -> dict[str, Any]:
    lat, lon = (geo[0], geo[1]) if len(geo) >= 2 else (None, None)
    name = geo[2] if len(geo) >= 3 else proper_name(m.nome)
    return {
        "id": key,
        "state_code": m.uf,
        "tse_code": m.cd,
        "ibge_code": m.cd_ibge,
        "name": name,
        "is_capital": m.capital,
        "lat": lat,
        "lon": lon,
    }


def _zone_row(uf: str, cd_mun: int, zone: int, municipality_key: str) -> dict[str, Any]:
    return {
        "id": zone_id_of(uf, cd_mun, zone),
        "municipality_id": municipality_key,
        "state_code": uf,
        "number": zone,
    }


async def _upsert_municipalities(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    for i in range(0, len(rows), MUNICIPALITY_BATCH):
        stmt = insert(Municipality).values(rows[i : i + MUNICIPALITY_BATCH])
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": stmt.excluded.name,
                    "ibge_code": stmt.excluded.ibge_code,
                    "is_capital": stmt.excluded.is_capital,
                    "lat": func.coalesce(stmt.excluded.lat, Municipality.lat),
                    "lon": func.coalesce(stmt.excluded.lon, Municipality.lon),
                },
            )
        )


async def insert_zones(session: AsyncSession, zones: list[dict[str, Any]]) -> None:
    for i in range(0, len(zones), ZONE_BATCH):
        await session.execute(
            insert(ElectoralZone).values(zones[i : i + ZONE_BATCH]).on_conflict_do_nothing()
        )


async def ingest_sections(session: AsyncSession, sections: list[SecaoTSE]) -> int:
    zones: dict[str, dict[str, Any]] = {}
    rows: list[dict[str, Any]] = []
    for s in sections:
        municipality_key = municipality_id_of(s.uf, s.municipio)
        zone_key = zone_id_of(s.uf, s.municipio, s.zona)
        zones[zone_key] = {
            "id": zone_key,
            "municipality_id": municipality_key,
            "state_code": s.uf,
            "number": s.zona,
        }
        rows.append(_section_row(s, municipality_key, zone_key))
    await insert_zones(session, list(zones.values()))
    for i in range(0, len(rows), SECTION_BATCH):
        stmt = insert(PollingSection).values(rows[i : i + SECTION_BATCH])
        await session.execute(stmt.on_conflict_do_nothing())
    await session.flush()
    return len(rows)


def _section_row(s: SecaoTSE, municipality_key: str, zone_key: str) -> dict[str, Any]:
    return {
        "id": section_id_of(s.uf, s.municipio, s.zona, s.secao),
        "municipality_id": municipality_key,
        "electoral_zone_id": zone_key,
        "state_code": s.uf,
        "number": s.secao,
        "aggregator_section": s.agregadora,
    }
