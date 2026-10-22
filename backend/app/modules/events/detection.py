"""Event detection for the tally: compares the state before and after a result line.

Only the country and state levels produce events. The titles and descriptions are product text
(Portuguese); the event types and payload keys are the stored, English names.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.elections import status

MILESTONES = (10, 25, 50, 75, 90, 100)
ELECTED_STATUSES = (status.ELECTED, status.MATHEMATICALLY_ELECTED)
OFFICE_NAMES = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Dep. Federal",
    7: "Dep. Estadual",
    8: "Dep. Distrital",
}


def _fmt(p: float) -> str:
    return f"{p:.2f}".replace(".", ",") + "%"


@dataclass(frozen=True)
class _Change:
    """One country or state level of one office, between two result lines."""

    before: dict[str, Any] | None
    after: dict[str, Any]
    area_name: str
    office_name: str
    system: str

    @property
    def base(self) -> dict[str, Any]:
        row = self.after
        return {
            "office_code": row["office_code"],
            "level": row["level"],
            "geo_area_id": row["geo_area_id"],
            "occurred_at": row["tallied_at"],
            "round": row["round"],
        }

    @property
    def pct_before(self) -> float:
        return (self.before or {}).get("pct_sections") or 0.0

    @property
    def pct_after(self) -> float:
        return self.after.get("pct_sections") or 0.0


def detect(
    before: dict[str, Any] | None,
    after: dict[str, Any],
    names: dict[str, str],
    area_name: str,
    system: str,
    statuses_before: dict[str, str] | None = None,
    statuses_after: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Events for a country or state level of one office. `names`: tse_candidate_id -> ballot name."""
    if after["level"] not in ("country", "state"):
        return []
    change = _Change(
        before, after, area_name, OFFICE_NAMES.get(after["office_code"], str(after["office_code"])), system
    )
    events: list[dict[str, Any]] = []
    start = _start_event(change)
    if start is not None:
        events.append(start)
    events.extend(_milestone_events(change))
    lead = _lead_change_event(change, names)
    if lead is not None:
        events.append(lead)
    events.extend(_status_events(change, names, statuses_before or {}, statuses_after))
    return events


def _start_event(change: _Change) -> dict[str, Any] | None:
    if change.after["office_code"] != 1 or change.after["level"] != "country":
        return None
    if not change.pct_before <= 0 < change.pct_after:
        return None
    return {
        **change.base,
        "type": "start",
        "title": "Começou a divulgação dos resultados",
        "description": f"Primeiras seções totalizadas ({_fmt(change.pct_after)}).",
        "payload": {},
    }


def _milestone_events(change: _Change) -> list[dict[str, Any]]:
    """Progress marks, only for the reference office (the progress is the same for every office)."""
    level, office_code = change.after["level"], change.after["office_code"]
    is_reference = office_code == 1 or (level == "state" and office_code == 3)
    if not is_reference or (office_code == 3 and level == "country"):
        return []
    events: list[dict[str, Any]] = []
    for milestone in MILESTONES:
        if change.pct_before < milestone <= change.pct_after + 1e-9:
            title = (
                f"Apuração finalizada em {change.area_name}"
                if milestone == 100
                else f"{change.area_name}: {milestone}% das seções apuradas"
            )
            events.append(
                {
                    **change.base,
                    "type": "milestone",
                    "title": title,
                    "description": f"{_fmt(change.pct_after)} das seções totalizadas.",
                    "payload": {"milestone": milestone},
                }
            )
    return events


def _lead_change_event(change: _Change, names: dict[str, str]) -> dict[str, Any] | None:
    """Change of leader; majoritarian offices only, and ignored at the very beginning of the tally."""
    if change.system != "majoritario" or not change.before or change.pct_after < 1.0:
        return None
    before_leader = change.before.get("leader_candidate_id")
    after_leader = change.after.get("leader_candidate_id")
    if not before_leader or not after_leader or before_leader == after_leader:
        return None
    after = change.after
    return {
        **change.base,
        "type": "lead_change",
        "title": f"Virada em {change.area_name} ({change.office_name})",
        "description": (
            f"{names.get(after_leader, after_leader)} passou {names.get(before_leader, before_leader)} "
            f"({_fmt(after.get('leader_pct') or 0)} × {_fmt(after.get('second_pct') or 0)}) "
            f"com {_fmt(change.pct_after)} apurado."
        ),
        "payload": {"new_leader": after_leader, "previous_leader": before_leader},
    }


def _status_events(
    change: _Change,
    names: dict[str, str],
    statuses_before: dict[str, str],
    statuses_after: dict[str, str] | None,
) -> list[dict[str, Any]]:
    """Candidates who were elected, went to a runoff, or were mathematically decided in this line."""
    events: list[dict[str, Any]] = []
    for candidate_id, new_status in (statuses_after or {}).items():
        if statuses_before.get(candidate_id) == new_status:
            continue
        name = names.get(candidate_id, candidate_id)
        if new_status in ELECTED_STATUSES and statuses_before.get(candidate_id) not in ELECTED_STATUSES:
            events.append(_elected_event(change, candidate_id, name, new_status))
        elif new_status == status.RUNOFF and change.system == "majoritario":
            events.append(_runoff_event(change, candidate_id, name))
    return events


def _elected_event(change: _Change, candidate_id: str, name: str, new_status: str) -> dict[str, Any]:
    kind = "elected" if new_status == status.ELECTED else "mathematically_decided"
    description = (
        f"Eleição definida com {_fmt(change.pct_after)} apurado."
        if kind == "elected"
        else "Matematicamente eleito(a) antes do fim da apuração."
    )
    return {
        **change.base,
        "type": kind,
        "title": f"{name} eleito(a) — {change.office_name} {change.area_name}",
        "description": description,
        "payload": {"tse_candidate_id": candidate_id},
    }


def _runoff_event(change: _Change, candidate_id: str, name: str) -> dict[str, Any]:
    return {
        **change.base,
        "type": "runoff",
        "title": f"{name} vai ao 2º turno — {change.office_name} {change.area_name}",
        "description": "Nenhum candidato atingiu a maioria absoluta dos votos válidos.",
        "payload": {"tse_candidate_id": candidate_id},
    }
