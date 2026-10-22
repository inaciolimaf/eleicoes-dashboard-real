"""One item of a children table: a child's dimension, merged with its result line when there is one."""

from __future__ import annotations

from typing import Any

from app.modules.elections import Candidate, colors
from app.modules.results.queries.common import NOT_RECEIVED, short_candidate, status_by_pct
from app.modules.results.queries.tally.lines import Line


def _empty_item(level: str, d: dict[str, Any]) -> dict[str, Any]:
    return {
        "level": level,
        "id": d["id"],
        "name": d["name"],
        "state_code": d.get("state_code"),
        "ibge_code": d.get("ibge_code"),
        "region": d.get("region"),
        "is_capital": d.get("is_capital", False),
        "lat": d.get("lat"),
        "lon": d.get("lon"),
        "status": NOT_RECEIVED,
        "pct_sections": 0.0,
        "electorate": d.get("electorate") or 0,
        "turnout": 0,
        "pct_abstention": 0.0,
        "valid_votes": 0,
        "blank_votes": 0,
        "null_votes": 0,
        "leader": None,
        "second": None,
        "margin_pp": 0.0,
        "leader_party": None,
        "values": {},
    }


def _line_fields(line: Line, electorate_default: int, meta: dict[str, Candidate]) -> dict[str, Any]:
    lsq, ssq = line.get("leader_candidate_id"), line.get("second_candidate_id")
    return {
        "status": status_by_pct(line.get("pct_sections"), line.get("sections_tallied")),
        "pct_sections": line.get("pct_sections") or 0.0,
        "electorate": line.get("electorate") or electorate_default,
        "turnout": line.get("turnout") or 0,
        "pct_abstention": line.get("pct_abstention") or 0.0,
        "valid_votes": line.get("valid_votes") or 0,
        "blank_votes": line.get("blank_votes") or 0,
        "null_votes": line.get("null_votes") or 0,
        "leader": short_candidate(
            meta.get(lsq), lsq, line.get("leader_votes") or 0, line.get("leader_pct") or 0
        )
        if lsq
        else None,
        "second": short_candidate(
            meta.get(ssq), ssq, line.get("second_votes") or 0, line.get("second_pct") or 0
        )
        if ssq
        else None,
        "margin_pp": line.get("margin_pp") or 0.0,
    }


def build_item(
    level: str,
    d: dict[str, Any],
    line: Line | None,
    meta: dict[str, Candidate],
    candidates: list[str] | None = None,
) -> dict[str, Any]:
    item = _empty_item(level, d)
    if not line:
        return item
    item.update(_line_fields(line, item["electorate"], meta))
    if line.get("leader_party"):
        item["leader_party"] = {
            "abbreviation": line["leader_party"],
            "color": colors.alliance_color(line["leader_party"]),
        }
    if candidates and line.get("candidates") is not None:
        pcts = {c["sq"]: c.get("p", 0) for c in line["candidates"]}
        item["values"] = {sq: pcts.get(sq, 0.0) for sq in candidates}
    return item
