"""EA12 file: the municipalities of each state, with their TSE and IBGE codes and their zones."""

from dataclasses import dataclass
from typing import Any

from app.infra.tse.numbers import integer, integer_or_none, yes_no


@dataclass
class MunicipalityTSE:
    uf: str
    cd: int
    cd_ibge: int | None
    nome: str
    capital: bool
    zonas: list[int]


def parse_municipalities(data: dict[str, Any]) -> list[MunicipalityTSE]:
    result: list[MunicipalityTSE] = []
    for area in data.get("abr", []) or []:
        uf = str(area.get("cd") or "").lower()
        for entry in area.get("mu", []) or []:
            result.append(
                MunicipalityTSE(
                    uf=uf,
                    cd=integer(entry.get("cd")),
                    cd_ibge=integer_or_none(entry.get("cdi")),
                    nome=str(entry.get("nm") or "").strip(),
                    capital=yes_no(entry.get("c")),
                    zonas=[integer(z) for z in (entry.get("z") or [])],
                )
            )
    return result
