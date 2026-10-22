"""The alert rules: does a result line or a polling place event fire an alert?

Alert parameters (JSON stored in `alerts.params`): `office_code`, `level`, `geo_area_id`,
`tse_candidate_id`, `threshold`, `polling_place_id`. The `row` and `event` dicts are the ones the
results and events modules produce; their keys (`sq`, `p`, `pct_sections`, ...) are read as they are.
"""

from typing import Any

from app.modules.alerts.models import Alert

#: A fired alert: (title, description), both product text shown to the user.
Firing = tuple[str, str]


def evaluate_result(alert: Alert, row: dict[str, Any], events: list[dict[str, Any]]) -> Firing | None:
    params = alert.params or {}
    if alert.type == "candidate_pct":
        return _candidate_percentage(params, row)
    if alert.type == "tally_threshold":
        return _tally_threshold(params, row)
    for event in events:
        if _event_matches(alert, params, event):
            return event["title"], event["description"]
    return None


def evaluate_polling_place(alert: Alert, polling_place_id: str, status: str) -> Firing | None:
    params = alert.params or {}
    if (
        alert.type == "polling_place_tallied"
        and params.get("polling_place_id") == polling_place_id
        and status == "tallied"
    ):
        return "Local de votação apurado", "Todas as seções do local foram totalizadas."
    return None


def _candidate_percentage(params: dict[str, Any], row: dict[str, Any]) -> Firing | None:
    if not _same_area(params, row):
        return None
    candidate = next(
        (c for c in row.get("candidates", []) if c["sq"] == params.get("tse_candidate_id")), None
    )
    if candidate and candidate.get("p", 0) >= float(params.get("threshold", 0)):
        return (
            "Alerta de percentual",
            f"Candidato passou de {params.get('threshold')}% em {row['geo_area_id'].upper()}.",
        )
    return None


def _tally_threshold(params: dict[str, Any], row: dict[str, Any]) -> Firing | None:
    reached = (row.get("pct_sections") or 0) >= float(params.get("threshold", 100))
    if params.get("level") == row["level"] and params.get("geo_area_id") == row["geo_area_id"] and reached:
        return (
            "Alerta de apuração",
            f"{row['geo_area_id'].upper()} chegou a {params.get('threshold')}% das seções apuradas.",
        )
    return None


def _event_matches(alert: Alert, params: dict[str, Any], event: dict[str, Any]) -> bool:
    if alert.type == "lead_change":
        return bool(
            event["type"] == "lead_change"
            and int(params.get("office_code", 0)) == event["office_code"]
            and params.get("level") == event["level"]
            and params.get("geo_area_id") == event["geo_area_id"]
        )
    if alert.type == "elected":
        return event["type"] in ("elected", "mathematically_decided") and bool(
            event.get("payload", {}).get("tse_candidate_id") == params.get("tse_candidate_id")
        )
    return False


def _same_area(params: dict[str, Any], row: dict[str, Any]) -> bool:
    return bool(
        int(params.get("office_code", 0)) == row["office_code"]
        and params.get("level") == row["level"]
        and params.get("geo_area_id") == row["geo_area_id"]
    )
