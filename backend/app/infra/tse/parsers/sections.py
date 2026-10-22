"""EA16 file (configuração de seções): every section of a state, grouped by municipality and zone."""

from dataclasses import dataclass
from typing import Any

from app.infra.tse.numbers import integer, integer_or_none


@dataclass
class SectionTSE:
    state_code: str
    municipality: int
    zone: int
    section: int
    aggregator: int | None


def parse_sections(data: dict[str, Any]) -> list[SectionTSE]:
    result: list[SectionTSE] = []
    for area in data.get("abr", []) or []:
        state_code = str(area.get("cd") or "").lower()
        for municipality in area.get("mu", []) or []:
            municipality_code = integer(municipality.get("cd"))
            for zone in municipality.get("zon", []) or []:
                zone_code = integer(zone.get("cd"))
                for section in zone.get("sec", []) or []:
                    number = integer(section.get("ns"))
                    aggregator = integer_or_none(section.get("nsp"))
                    result.append(
                        SectionTSE(
                            state_code=state_code,
                            municipality=municipality_code,
                            zone=zone_code,
                            section=number,
                            aggregator=aggregator if aggregator and aggregator != number else None,
                        )
                    )
    return result
