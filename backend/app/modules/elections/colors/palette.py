"""The color data: the categorical palette and the traditional color of each party."""

PALETTE = [
    "#3B82F6",  # blue
    "#F97316",  # orange
    "#10B981",  # emerald
    "#A855F7",  # purple
    "#EAB308",  # yellow
    "#EC4899",  # pink
    "#14B8A6",  # turquoise
    "#EF4444",  # red
    "#84CC16",  # lime
    "#6366F1",  # indigo
    "#F59E0B",  # amber
    "#06B6D4",  # cyan
]

#: Party number -> (abbreviation, color). Abbreviations are the TSE's, product text.
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

#: Abbreviation (upper case) -> color, including the spellings the TSE uses for the same party.
BY_ABBREVIATION: dict[str, str] = {abbreviation.upper(): color for abbreviation, color in PARTIES.values()}
BY_ABBREVIATION.update(
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
