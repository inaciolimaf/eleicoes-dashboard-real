"""Static documents of the mock: catalog, municipalities, state sections, places CSV and photos."""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Any

from tse_fake.data import STATES
from tse_fake.publication.formatting import OFFICE_NAMES
from tse_fake.scenario.model import (
    CYCLE,
    ELECTION_EVENT_CODE,
    FEDERAL_ELECTION_CODE,
    STATE_ELECTION_CODE,
)

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario


def catalog_document() -> dict[str, Any]:
    return {
        "dg": "01/10/2026",
        "hg": "12:00:00",
        "f": "o",
        "idg": "100000001",
        "c": CYCLE,
        "arq": _file_templates(),
        "pl": [_election_event()],
    }


def _file_templates() -> list[dict[str, str]]:
    base = "<base>/<ambiente>/<ciclo>"
    return [
        {"tp": "ft", "dir": f"{base}/<cd_eleicao>/fotos/<uf>"},
        {"tp": "cm", "dir": f"{base}/<cd_eleicao>/config"},
        {"tp": "e", "dir": f"{base}/<cd_eleicao>/dados/<uf>"},
        {"tp": "cs", "dir": f"{base}/arquivo-urna/<cd_pleito>/config/<uf>"},
        {"tp": "ab", "dir": f"{base}/<cd_eleicao>/dados/<uf>"},
        {"tp": "u", "dir": f"{base}/<cd_eleicao>/dados/<uf>"},
        {
            "tp": "aux",
            "dir": f"{base}/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>",
        },
    ]


def _office_entry(code: int, kind: str) -> dict[str, str]:
    return {"cd": str(code), "ds": OFFICE_NAMES[code], "tp": kind}


def _election_event() -> dict[str, Any]:
    return {
        "cd": str(ELECTION_EVENT_CODE),
        "cdpr": "9000",
        "c": CYCLE,
        "dt": "04/10/2026",
        "dtlim": "25/10/2026",
        "e": [_federal_election(), _state_election()],
    }


def _federal_election() -> dict[str, Any]:
    return {
        "cd": str(FEDERAL_ELECTION_CODE),
        "cdt2": str(FEDERAL_ELECTION_CODE + 1),
        "sqele": "1",
        "t": "1",
        "tp": "8",
        "nm": "Eleição Ordinária Federal - 2026 - MOCK 1º Turno",
        "abr": [{"cd": "br", "cp": [_office_entry(1, "1")]}],
    }


def _state_election() -> dict[str, Any]:
    offices = [(3, "1"), (5, "1"), (6, "2"), (7, "2"), (8, "2")]
    return {
        "cd": str(STATE_ELECTION_CODE),
        "cdt2": str(STATE_ELECTION_CODE + 1),
        "sqele": "2",
        "t": "1",
        "tp": "1",
        "nm": "Eleição Ordinária Estadual - 2026 - MOCK 1º Turno",
        "abr": [{"cd": "br", "cp": [_office_entry(code, kind) for code, kind in offices]}],
    }


def municipalities_document(scenario: Scenario) -> dict[str, Any]:
    areas: list[dict[str, Any]] = []
    for state_code in scenario.states:
        municipalities = [m for m in scenario.municipalities if m.state_code == state_code]
        areas.append(
            {
                "cd": state_code.upper(),
                "ds": STATES[state_code][0].upper(),
                "mu": [
                    {
                        "cd": f"{m.tse_code:05d}",
                        "cdi": str(m.ibge_code),
                        "nm": m.name,
                        "c": "S" if m.is_capital else "N",
                        "s": "S",
                        "z": [f"{scenario.zones[z].number:04d}" for z in m.zones],
                    }
                    for m in municipalities
                ],
            }
        )
    return {"dg": "01/10/2026", "hg": "12:00:00", "f": "o", "idg": "100000002", "abr": areas}


def state_sections_document(scenario: Scenario, state_code: str) -> dict[str, Any]:
    municipalities: list[dict[str, Any]] = []
    for m in scenario.municipalities:
        if m.state_code != state_code:
            continue
        zones = [
            {"cd": f"{zone.number:04d}", "sec": _zone_sections(scenario, zone.start, zone.end)}
            for zone in (scenario.zones[zi] for zi in m.zones)
        ]
        municipalities.append({"cd": f"{m.tse_code:05d}", "nm": m.name, "zon": zones})
    return {
        "dg": "01/10/2026",
        "hg": "12:00:00",
        "f": "o",
        "abr": [{"cd": state_code.upper(), "ds": STATES[state_code][0].upper(), "mu": municipalities}],
    }


def _zone_sections(scenario: Scenario, start: int, end: int) -> list[dict[str, str]]:
    return [
        {
            "ns": f"{int(scenario.section_number[i]):04d}",
            "nsp": f"{int(scenario.section_number[i]):04d}",
        }
        for i in range(start, end)
    ]


def places_csv(scenario: Scenario) -> bytes:
    lines = [";".join(f'"{x}"' for x in _CSV_HEADER)]
    for i in range(scenario.section_count):
        lines.append(";".join(f'"{v}"' for v in _places_row(scenario, i)))
    return ("\n".join(lines) + "\n").encode("latin-1", errors="replace")


_CSV_HEADER = [
    "AA_ELEICAO",
    "SG_UF",
    "CD_MUNICIPIO",
    "NM_MUNICIPIO",
    "NR_ZONA",
    "NR_SECAO",
    "NR_LOCAL_VOTACAO",
    "NM_LOCAL_VOTACAO",
    "DS_ENDERECO",
    "NM_BAIRRO",
    "NR_CEP",
    "NR_LATITUDE",
    "NR_LONGITUDE",
    "QT_ELEITOR_SECAO",
]


def _places_row(scenario: Scenario, i: int) -> list[str]:
    municipality = scenario.municipalities[int(scenario.section_municipality[i])]
    zone = scenario.zones[int(scenario.section_zone[i])]
    place = scenario.polling_places[int(scenario.section_place[i])]
    lat = f"{place.lat}" if place.lat is not None else "-1"
    lon = f"{place.lon}" if place.lon is not None else "-1"
    return [
        "2026",
        municipality.state_code.upper(),
        str(municipality.tse_code),
        municipality.name,
        str(zone.number),
        str(int(scenario.section_number[i])),
        str(place.number),
        place.name,
        place.address,
        place.district,
        place.zip_code,
        lat,
        lon,
        str(int(scenario.section_voters[i])),
    ]


def photo_svg(scenario: Scenario, tse_candidate_id: str) -> bytes | None:
    for office in scenario.offices.values():
        for candidate in office.candidates:
            if candidate.tse_candidate_id == tse_candidate_id:
                initials = "".join(p[0] for p in candidate.ballot_name.split()[:2])
                hue = (
                    int(hashlib.md5(tse_candidate_id.encode(), usedforsecurity=False).hexdigest()[:6], 16)
                    % 360
                )
                svg = (
                    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" '
                    'viewBox="0 0 160 200">'
                    f'<rect width="160" height="200" fill="hsl({hue},45%,38%)"/>'
                    f'<circle cx="80" cy="78" r="38" fill="hsl({hue},45%,62%)"/>'
                    f'<rect x="28" y="124" width="104" height="76" rx="40" fill="hsl({hue},45%,62%)"/>'
                    f'<text x="80" y="190" font-family="sans-serif" font-size="22" font-weight="700" '
                    f'text-anchor="middle" fill="#fff">{initials}</text></svg>'
                )
                return svg.encode()
    return None
