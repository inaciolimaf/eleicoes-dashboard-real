"""Candidate colors: the traditional color of the party, computed when read.

Parties without a known color fall into a stable categorical palette.
"""

import hashlib
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.elections.models import Candidate

PALETTE = [
    "#3B82F6",  # azul
    "#F97316",  # laranja
    "#10B981",  # verde-esmeralda
    "#A855F7",  # roxo
    "#EAB308",  # amarelo
    "#EC4899",  # rosa
    "#14B8A6",  # turquesa
    "#EF4444",  # vermelho
    "#84CC16",  # lima
    "#6366F1",  # índigo
    "#F59E0B",  # âmbar
    "#06B6D4",  # ciano
]

# party number -> (abbreviation, color)
PARTIES: dict[int, tuple[str, str]] = {
    10: ("REPUBLICANOS", "#1F6FB2"),
    11: ("PP", "#5DA9E9"),
    12: ("PDT", "#E4572E"),
    13: ("PT", "#D7191C"),
    14: ("PTB", "#2E7D32"),
    15: ("MDB", "#2E9E48"),
    16: ("PSTU", "#B71C1C"),
    18: ("REDE", "#F28C28"),
    19: ("PODE", "#22B14C"),
    20: ("PSC", "#1B7F3A"),
    21: ("PCB", "#C62828"),
    22: ("PL", "#0B3D91"),
    23: ("CIDADANIA", "#E6007E"),
    25: ("PRD", "#1E4FA0"),
    27: ("DC", "#7CB342"),
    28: ("PRTB", "#00897B"),
    29: ("PCO", "#8E0000"),
    30: ("NOVO", "#F26522"),
    33: ("PMN", "#C0392B"),
    35: ("PMB", "#AD1457"),
    36: ("AGIR", "#4A90E2"),
    40: ("PSB", "#F2C200"),
    43: ("PV", "#00A651"),
    44: ("UNIÃO", "#2A4D9B"),
    45: ("PSDB", "#0A84D6"),
    50: ("PSOL", "#8E24AA"),
    55: ("PSD", "#F5A623"),
    65: ("PCdoB", "#A50F15"),
    70: ("AVANTE", "#00A3AD"),
    77: ("SOLIDARIEDADE", "#FF8C00"),
    80: ("UP", "#7B1F1F"),
    90: ("PROS", "#F57C00"),
}

_BY_ABBREVIATION = {abbreviation.upper(): color for abbreviation, color in PARTIES.values()}
_BY_ABBREVIATION.update(
    {
        "UNIAO": PARTIES[44][1],
        "PODEMOS": PARTIES[19][1],
        "PC DO B": PARTIES[65][1],
        "SD": PARTIES[77][1],
        "SOLIDARIEDADE": PARTIES[77][1],
        "REPUBLICANO": PARTIES[10][1],
    }
)

UNKNOWN_COLOR = "#888888"


def color_by_order(position: int) -> str:
    return PALETTE[position % len(PALETTE)]


def color_for_text(text: str) -> str:
    """Stable color for any text, the same in every process."""
    digest = hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()
    return PALETTE[int(digest[:6], 16) % len(PALETTE)]


def color_by_abbreviation(abbreviation: str | None) -> str | None:
    if not abbreviation:
        return None
    return _BY_ABBREVIATION.get(abbreviation.strip().upper())


def party_color(number: int) -> str:
    """Color by party number (or by candidate number: the first two digits are the party)."""
    n = abs(int(number))
    while n >= 100:
        n //= 10
    party = PARTIES.get(n)
    return party[1] if party else PALETTE[(n * 7) % len(PALETTE)]


def alliance_color(name: str) -> str:
    """Federation/coalition: the color of the first recognized party in the name."""
    for part in re.split(r"[/,;\-–()]+|\s+", name or ""):
        color = color_by_abbreviation(part)
        if color:
            return color
    return color_by_abbreviation(name) or color_for_text(name or "")


def candidate_color(
    number: int | None, party_number: int | None = None, party_abbreviation: str | None = None
) -> str:
    color = color_by_abbreviation(party_abbreviation)
    if color:
        return color
    if party_number:
        return party_color(party_number)
    if number is not None:
        return party_color(number)
    return UNKNOWN_COLOR


def color_of(candidate: "Candidate | None") -> str:
    """Color of a Candidate record (or of a missing one)."""
    if candidate is None:
        return UNKNOWN_COLOR
    return candidate_color(candidate.ballot_number, candidate.party_number, candidate.party_abbreviation)


def colors_by_number(numbers: list[int]) -> dict[int, str]:
    return {n: party_color(n) for n in set(numbers)}
