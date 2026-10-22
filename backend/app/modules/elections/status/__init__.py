"""Candidate status (`rules`): the status constants, the TSE mapping and the leader calculation.

Imported as a whole (`from app.modules.elections import status`), so the names are re-exported here.
"""

from app.modules.elections.status.rules import (
    COUNTING,
    ELECTED,
    LEADING,
    MATHEMATICALLY_ELECTED,
    NOT_ELECTED,
    RUNOFF,
    SUB_JUDICE,
    SUBSTITUTE,
    calculate,
    from_tse,
)

__all__ = [
    "COUNTING",
    "ELECTED",
    "LEADING",
    "MATHEMATICALLY_ELECTED",
    "NOT_ELECTED",
    "RUNOFF",
    "SUBSTITUTE",
    "SUB_JUDICE",
    "calculate",
    "from_tse",
]

# TEMPORARY: removed by the main agent after integration. The results and events slices still
# call the old names.
calcular = calculate
da_tse = from_tse
