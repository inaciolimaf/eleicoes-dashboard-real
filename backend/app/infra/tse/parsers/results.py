"""EA20 file (resultado unificado): the tally of one office, with the candidates, alliances and totals."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time, decimal, integer, integer_or_none, yes_no
from app.infra.tse.parsers.common import generation_id


@dataclass
class RunningMateTSE:
    name: str
    tipo: str


@dataclass
class CandidateTSE:
    tse_candidate_id: str
    number: int
    name: str
    ballot_name: str
    party_abbreviation: str
    party_number: int
    alliance: str
    alliance_number: str
    votes: int
    pct_valid: float
    elected: bool
    tse_status: str
    vote_destination: str
    running_mates: list[RunningMateTSE] = field(default_factory=list)


@dataclass
class AllianceTSE:
    number: str
    name: str
    tipo: str
    parties: list[str]
    votes: int
    seats: int | None


@dataclass
class TotalsTSE:
    electorate: int = 0
    tallied_electorate: int = 0
    sections_total: int = 0
    sections_tallied: int = 0
    pct_sections: float = 0.0
    turnout: int = 0
    pct_turnout: float = 0.0
    abstention: int = 0
    pct_abstention: float = 0.0
    total_votes: int = 0
    valid_votes: int = 0
    pct_valid: float = 0.0
    blank_votes: int = 0
    pct_blank: float = 0.0
    null_votes: int = 0
    pct_null: float = 0.0


@dataclass
class ResultTSE:
    election_code: int
    round: int
    office_code: int
    seats: int | None
    generation_id: str
    generated_at: datetime | None
    tallied_at: datetime | None
    final: bool
    mathematically_decided: bool
    totals: TotalsTSE
    candidates: list[CandidateTSE]
    alliances: list[AllianceTSE]


def _pct(part: int, whole: int) -> float:
    return round(part * 100.0 / whole, 4) if whole else 0.0


def _totals(data: dict[str, Any]) -> TotalsTSE:
    sections = data.get("s") or {}
    electorate = data.get("e") or {}
    votes = data.get("v") or {}
    totals = TotalsTSE(
        electorate=integer(electorate.get("te")),
        tallied_electorate=integer(electorate.get("est")),
        sections_total=integer(sections.get("ts")),
        sections_tallied=integer(sections.get("st")),
        pct_sections=decimal(sections.get("pstn", sections.get("pst"))),
        turnout=integer(electorate.get("c")),
        abstention=integer(electorate.get("a")),
        total_votes=integer(votes.get("tv")),
        valid_votes=integer(votes.get("vv")),
        blank_votes=integer(votes.get("vb")),
        null_votes=integer(votes.get("tvn", votes.get("vn"))),
    )
    if not totals.turnout and totals.total_votes:
        totals.turnout = totals.total_votes
    _turnout_percentages(totals, electorate)
    return totals


def _turnout_percentages(totals: TotalsTSE, electorate: dict[str, Any]) -> None:
    totals.pct_turnout = decimal(electorate.get("pcn", electorate.get("pc"))) or _pct(
        totals.turnout, totals.tallied_electorate
    )
    totals.pct_abstention = decimal(electorate.get("pan", electorate.get("pa"))) or _pct(
        totals.abstention, totals.tallied_electorate
    )
    base = totals.total_votes or totals.turnout
    totals.pct_valid = _pct(totals.valid_votes, base)
    totals.pct_blank = _pct(totals.blank_votes, base)
    totals.pct_null = _pct(totals.null_votes, base)
    if not totals.pct_sections and totals.sections_total:
        totals.pct_sections = _pct(totals.sections_tallied, totals.sections_total)


def _select_office(data: dict[str, Any], office_code: int | None) -> dict[str, Any] | None:
    offices: list[dict[str, Any]] = data.get("carg") or []
    if not offices:
        return None
    selected: dict[str, Any] = next(
        (o for o in offices if office_code is None or integer(o.get("cd")) == office_code), offices[0]
    )
    return selected


def _read_candidate(cand: dict[str, Any], party: dict[str, Any], alliance: dict[str, Any]) -> CandidateTSE:
    return CandidateTSE(
        tse_candidate_id=str(cand.get("sqcand") or cand.get("n")),
        number=integer(cand.get("n")),
        name=str(cand.get("nm") or ""),
        ballot_name=str(cand.get("nmu") or cand.get("nm") or ""),
        party_abbreviation=str(party.get("sg") or ""),
        party_number=integer(party.get("n")),
        alliance=str(alliance.get("nm") or party.get("nm") or ""),
        alliance_number=str(alliance.get("n") or ""),
        votes=integer(cand.get("vap")),
        pct_valid=decimal(cand.get("pvapn", cand.get("pvap"))),
        elected=yes_no(cand.get("e")),
        tse_status=str(cand.get("st") or ""),
        vote_destination=str(cand.get("dvt") or "Válido"),
        running_mates=[
            RunningMateTSE(name=str(x.get("nmu") or x.get("nm") or ""), tipo=str(x.get("tp") or "v"))
            for x in (cand.get("vs") or [])
        ],
    )


def _read_alliance(alliance: dict[str, Any]) -> tuple[AllianceTSE, list[CandidateTSE]]:
    parties = alliance.get("par", []) or []
    acronyms = [str(p.get("sg") or "") for p in parties]
    candidates: list[CandidateTSE] = []
    votes = 0
    for party in parties:
        for cand in party.get("cand", []) or []:
            count = integer(cand.get("vap"))
            votes += count if str(cand.get("dvt") or "Válido").startswith("V") else 0
            candidates.append(_read_candidate(cand, party, alliance))
        votes += integer(party.get("tvl"))
    row = AllianceTSE(
        number=str(alliance.get("n") or ""),
        name=str(alliance.get("nm") or "/".join(acronyms)),
        tipo=str(alliance.get("tp") or "i"),
        parties=acronyms,
        votes=integer(alliance.get("tvtl"), votes) or votes,
        seats=integer_or_none(alliance.get("vag")),
    )
    return row, candidates


def _finish_percentages(totals: TotalsTSE, candidates: list[CandidateTSE]) -> None:
    if totals.valid_votes == 0 and candidates:
        totals.valid_votes = sum(c.votes for c in candidates if c.vote_destination.startswith("V"))
    for candidate in candidates:
        if not candidate.pct_valid and totals.valid_votes:
            candidate.pct_valid = _pct(candidate.votes, totals.valid_votes)


def parse_result(data: dict[str, Any], office_code: int | None = None) -> ResultTSE:
    totals = _totals(data)
    office = _select_office(data, office_code)
    candidates: list[CandidateTSE] = []
    alliances: list[AllianceTSE] = []
    seats = None
    code = office_code or 0
    if office:
        code = integer(office.get("cd"), code)
        seats = integer_or_none(office.get("nv"))
        for alliance in office.get("agr", []) or []:
            row, read = _read_alliance(alliance)
            alliances.append(row)
            candidates.extend(read)
    _finish_percentages(totals, candidates)
    candidates.sort(key=lambda c: (-c.votes, c.number))
    md_raw = str(data.get("md") or "").strip().lower()
    return ResultTSE(
        election_code=integer(data.get("ele")),
        round=integer(data.get("t"), 1),
        office_code=code,
        seats=seats,
        generation_id=generation_id(data),
        generated_at=date_time(data.get("dg"), data.get("hg")),
        tallied_at=date_time(data.get("dt"), data.get("ht")) or date_time(data.get("dg"), data.get("hg")),
        final=yes_no(data.get("tf")),
        mathematically_decided=md_raw in {"s", "e", "sim"},
        totals=totals,
        candidates=candidates,
        alliances=alliances,
    )
