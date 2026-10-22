"""EA14/EA15 file (acompanhamento): progress of the tally by state and municipality."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time, decimal, integer
from app.infra.tse.parsers.common import generation_id


@dataclass
class ProgressTSE:
    tipo: str  # br | uf | mu
    code: str  # br, sp, 71072
    tallied_at: datetime | None
    progress_code: str
    sections_total: int
    sections_tallied: int
    pct_sections: float
    electorate: int
    tallied_electorate: int
    turnout: int
    pct_turnout: float
    abstention: int
    pct_abstention: float
    municipalities_completed: int
    municipalities_partial: int
    municipalities_not_received: int


@dataclass
class TrackingTSE:
    election_code: int
    round: int
    generation_id: str
    generated_at: datetime | None
    items: list[ProgressTSE]


def _progress(area: dict[str, Any]) -> ProgressTSE:
    sections = area.get("s") or {}
    electorate = area.get("e") or {}
    return ProgressTSE(
        tipo=str(area.get("tpabr") or "").lower(),
        code=str(area.get("cdabr") or "").lower(),
        tallied_at=date_time(area.get("dt"), area.get("ht")),
        progress_code=str(area.get("and") or ""),
        sections_total=integer(sections.get("ts")),
        sections_tallied=integer(sections.get("st")),
        pct_sections=decimal(sections.get("pstn", sections.get("pst"))),
        electorate=integer(electorate.get("te")),
        tallied_electorate=integer(electorate.get("est")),
        turnout=integer(electorate.get("c")),
        pct_turnout=decimal(electorate.get("pcn", electorate.get("pc"))),
        abstention=integer(electorate.get("a")),
        pct_abstention=decimal(electorate.get("pan", electorate.get("pa"))),
        municipalities_completed=integer(area.get("munf")),
        municipalities_partial=integer(area.get("munpt")),
        municipalities_not_received=integer(area.get("munnr")),
    )


def parse_tracking(data: dict[str, Any]) -> TrackingTSE:
    return TrackingTSE(
        election_code=integer(data.get("ele")),
        round=integer(data.get("t"), 1),
        generation_id=generation_id(data),
        generated_at=date_time(data.get("dg"), data.get("hg")),
        items=[_progress(area) for area in data.get("abr", []) or []],
    )
