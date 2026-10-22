"""EA12 file: the municipalities of each state, with their TSE and IBGE codes and their zones."""

from dataclasses import dataclass
from typing import Any

from app.infra.tse.numbers import integer, integer_or_none, yes_no


@dataclass
class MunicipalityTSE:
    state_code: str
    cd: int
    ibge_code: int | None
    name: str
    is_capital: bool
    zones: list[int]


def parse_municipalities(data: dict[str, Any]) -> list[MunicipalityTSE]:
    result: list[MunicipalityTSE] = []
    for area in data.get("abr", []) or []:
        state_code = str(area.get("cd") or "").lower()
        for entry in area.get("mu", []) or []:
            result.append(
                MunicipalityTSE(
                    state_code=state_code,
                    cd=integer(entry.get("cd")),
                    ibge_code=integer_or_none(entry.get("cdi")),
                    name=str(entry.get("nm") or "").strip(),
                    is_capital=yes_no(entry.get("c")),
                    zones=[integer(z) for z in (entry.get("z") or [])],
                )
            )
    return result
