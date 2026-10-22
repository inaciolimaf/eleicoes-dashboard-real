"""Turns a party number, an abbreviation or a candidate into the color shown for it.

Parties without a known color fall into the stable categorical palette, so a party keeps the same
color in every process and on every page.
"""

import hashlib
import re
from typing import TYPE_CHECKING

from app.modules.elections.colors.palette import BY_ABBREVIATION, PALETTE, PARTIES, UNKNOWN_COLOR

if TYPE_CHECKING:
    from app.modules.elections.models import Candidate


def color_by_order(position: int) -> str:
    return PALETTE[position % len(PALETTE)]


def color_for_text(text: str) -> str:
    """Stable color for any text, the same in every process."""
    digest = hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()
    return PALETTE[int(digest[:6], 16) % len(PALETTE)]


def color_by_abbreviation(abbreviation: str | None) -> str | None:
    if not abbreviation:
        return None
    return BY_ABBREVIATION.get(abbreviation.strip().upper())


def party_color(number: int) -> str:
    """Color by party number (or by candidate number: the first two digits are the party)."""
    n = abs(int(number))
    while n >= 100:
        n //= 10
    party = PARTIES.get(n)
    return party[1] if party else PALETTE[(n * 7) % len(PALETTE)]


def alliance_color(name: str) -> str:
    """Federation or coalition: the color of the first recognized party in its name."""
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
