"""Simulated clock and the TSE value formats: decimal comma, dd/mm/yyyy dates, and the shared JSON blocks."""

from datetime import datetime, timedelta

import numpy as np

from app.infra.tse.numbers import BRT

START = datetime(2026, 10, 4, 17, 0, 0, tzinfo=BRT)  # the simulated 17h
PERIOD = 30.0  # simulated seconds between two tallying rounds
OFFICE_NAMES = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Deputado Federal",
    7: "Deputado Estadual",
    8: "Deputado Distrital",
}


def round_of(t: float) -> float:
    """Start of the tallying round that holds the simulated instant `t`."""
    return float(np.floor(t / PERIOD) * PERIOD)


def last_change(times: np.ndarray, t: float) -> float | None:
    """End of the last round in which one of the sorted `times` changed a file, or None if none has yet."""
    k = int(np.searchsorted(times, t, side="right"))
    if k == 0:
        return None
    return float(np.ceil(times[k - 1] / PERIOD) * PERIOD)


def format_datetime(seconds: float) -> tuple[str, str]:
    """Simulated seconds -> ('dd/mm/yyyy', 'hh:mm:ss') in Brasilia time."""
    moment = START + timedelta(seconds=seconds)
    return moment.strftime("%d/%m/%Y"), moment.strftime("%H:%M:%S")


def pct2(part: float, whole: float) -> str:
    return f"{(part * 100.0 / whole) if whole else 0:.2f}".replace(".", ",")


def pctn(part: float, whole: float) -> str:
    return f"{(part * 100.0 / whole) if whole else 0:.9f}".rstrip("0").rstrip(",.").replace(".", ",") or "0"


def sections_block(total: int, tallied: int) -> dict[str, str]:
    """The `s` block: sections in the area and how many are tallied."""
    return {
        "ts": str(total),
        "st": str(tallied),
        "pst": pct2(tallied, total),
        "pstn": pctn(tallied, total),
        "snt": str(total - tallied),
        "psnt": pct2(total - tallied, total),
    }


def electorate_block(total: int, tallied: int, turnout: int) -> dict[str, str]:
    """The `e` block: electorate, electorate in the tallied sections, turnout and abstention."""
    return {
        "te": str(total),
        "est": str(tallied),
        "pest": pct2(tallied, total),
        "esnt": str(total - tallied),
        "c": str(turnout),
        "pc": pct2(turnout, tallied),
        "pcn": pctn(turnout, tallied),
        "a": str(tallied - turnout),
        "pa": pct2(tallied - turnout, tallied),
        "pan": pctn(tallied - turnout, tallied),
    }
