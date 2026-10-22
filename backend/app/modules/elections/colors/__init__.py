"""Party and candidate colors: the data (`palette`) and the functions that resolve a color (`resolve`).

Imported as a whole (`from app.modules.elections import colors`), so the functions are re-exported here.
"""

from app.modules.elections.colors.palette import PALETTE, PARTIES, UNKNOWN_COLOR
from app.modules.elections.colors.resolve import (
    alliance_color,
    candidate_color,
    color_by_abbreviation,
    color_by_order,
    color_for_text,
    color_of,
    colors_by_number,
    party_color,
)

__all__ = [
    "PALETTE",
    "PARTIES",
    "UNKNOWN_COLOR",
    "alliance_color",
    "candidate_color",
    "color_by_abbreviation",
    "color_by_order",
    "color_for_text",
    "color_of",
    "colors_by_number",
    "party_color",
]
