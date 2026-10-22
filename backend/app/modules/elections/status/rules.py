"""Candidate status: the TSE decides who is elected; we only compute LEADING (and the pending states).

The values are stored and sent to the frontend as they are: keep them in sync with the frontend.
"""

from typing import Any

ELECTED = "ELECTED"
RUNOFF = "RUNOFF"
MATHEMATICALLY_ELECTED = "MATHEMATICALLY_ELECTED"
LEADING = "LEADING"
SUBSTITUTE = "SUBSTITUTE"
NOT_ELECTED = "NOT_ELECTED"
SUB_JUDICE = "SUB_JUDICE"
COUNTING = "COUNTING"


def from_tse(
    elected: bool, status_text: str, destination: str, final: bool, mathematically: bool
) -> str | None:
    """Maps the TSE fields to a status. None when the TSE has not decided yet.

    `destination` is the TSE's vote destination ("Válido" when the vote counts); `mathematically`
    is kept for the TSE's signature and is not used by the mapping.
    """
    text = (status_text or "").strip().lower()
    dest = (destination or "Válido").strip().lower()
    if dest and not dest.startswith("v"):
        return SUB_JUDICE
    if "2º turno" in text or "2o turno" in text or "segundo turno" in text:
        return RUNOFF
    if elected or text.startswith("eleito"):
        return ELECTED if final else MATHEMATICALLY_ELECTED
    if text.startswith("suplente"):
        return SUBSTITUTE
    if text.startswith("não eleito") or text.startswith("nao eleito"):
        return NOT_ELECTED
    return None


def calculate(
    candidates: list[dict[str, Any]], seats: int, final: bool, mathematically: bool, office_coverage: bool
) -> dict[str, str]:
    """Status of each candidate, from the ones ordered by votes (highest first).

    Each item is a dict with the TSE keys: `sq` (candidate id), `v` (votes), `e` (elected flag),
    `st` (status text), `d` (vote destination). At the office's own coverage the TSE status is used;
    elsewhere (and while the TSE has not decided) the first `seats` candidates with votes are LEADING
    and the rest are COUNTING.
    """
    result: dict[str, str] = {}
    seats = seats or 0  # proportional offices: 0 means nobody leads, the seat depends on the party
    for position, candidate in enumerate(candidates):
        tse_status = from_tse(
            bool(candidate.get("e")),
            str(candidate.get("st") or ""),
            str(candidate.get("d") or "Válido"),
            final,
            mathematically,
        )
        if office_coverage and tse_status:
            result[candidate["sq"]] = tse_status
        elif tse_status == SUB_JUDICE:
            result[candidate["sq"]] = SUB_JUDICE
        elif position < seats and int(candidate.get("v") or 0) > 0:
            result[candidate["sq"]] = LEADING
        else:
            result[candidate["sq"]] = COUNTING
    return result
