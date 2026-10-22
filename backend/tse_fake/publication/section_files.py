"""Per-section files of the mock: auxiliary document, ballot box report (.bu) and section ids."""

from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from app.infra.tse.ballot_box import BallotBoxSpec, BallotVote, encode
from tse_fake.publication.formatting import START, format_datetime, round_of
from tse_fake.scenario.model import (
    ELECTION_EVENT_CODE,
    FEDERAL_ELECTION_CODE,
    STATE_ELECTION_CODE,
    StateOffice,
)

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario


def section_hash(scenario: Scenario, i: int) -> str:
    return hashlib.sha256(f"{scenario.seed}:secao:{i}".encode()).hexdigest()


def bu_name(scenario: Scenario, i: int) -> str:
    municipality = scenario.municipalities[int(scenario.section_municipality[i])]
    zone = scenario.zones[int(scenario.section_zone[i])]
    state_code = municipality.state_code.lower()
    return (
        f"o{ELECTION_EVENT_CODE:05d}{state_code}{municipality.tse_code:05d}{zone.number:04d}"
        f"{int(scenario.section_number[i]):04d}"
    )


def auxiliary_document(scenario: Scenario, i: int, t: float) -> tuple[str, dict[str, Any]]:
    tallied_at = float(scenario.section_time[i])
    dg, hg = format_datetime(round_of(t))
    if tallied_at > t:
        return "1", {"dg": dg, "hg": hg, "f": "o", "st": "Não totalizada", "ds": "", "hashes": []}
    dr, hr = format_datetime(tallied_at)
    name = bu_name(scenario, i)
    urn = {
        "hash": section_hash(scenario, i),
        "dr": dr,
        "hr": hr,
        "st": "Totalizado",
        "ds": "",
        # 2026 layout (the real TSE stopped publishing `nmarq` and the `.bu` extension)
        "arq": [
            {"nm": f"{name}-bu.dat", "tp": "bu"},
            {"nm": f"{name}-log.jez", "tp": "log"},
            {"nm": f"{name}-vota.vsc", "tp": "vota"},
            {"nm": f"{name}-rdv.dat", "tp": "rdv"},
        ],
    }
    return "2", {"dg": dg, "hg": hg, "f": "o", "st": "Totalizada", "ds": "", "hashes": [urn]}


def ballot_box_bytes(scenario: Scenario, i: int) -> bytes:
    """The .bu file of section `i`, with the votes of every office that section elects."""
    municipality = scenario.municipalities[int(scenario.section_municipality[i])]
    zone = scenario.zones[int(scenario.section_zone[i])]
    place = scenario.polling_places[int(scenario.section_place[i])]
    emitted_seconds = max(30.0, float(scenario.section_time[i]) - 240.0)
    issued = (START + timedelta(seconds=emitted_seconds)).strftime("%Y%m%dT%H%M%S")
    turnout = int(scenario.section_turnout[i])
    return encode(
        BallotBoxSpec(
            event=ELECTION_EVENT_CODE,
            elections=_elections(scenario, i, municipality.state_code, turnout),
            municipality=municipality.tse_code,
            zone=zone.number,
            place=place.number,
            section=int(scenario.section_number[i]),
            issued=issued,
            eligible=int(scenario.section_voters[i]),
            turnout=turnout,
        )
    )


def _elections(
    scenario: Scenario, i: int, state_code: str, turnout: int
) -> list[tuple[int, int, list[tuple[int, int, list[BallotVote]]]]]:
    """The three elections of the report: President, then the majoritarian and proportional state offices."""
    presidency = scenario.offices[(1, "br")]
    state_offices = [scenario.offices[key] for key in _state_keys(state_code) if key in scenario.offices]
    majoritarian = [
        (office.office_code, turnout, _office_votes(office, i))
        for office in state_offices
        if office.system == "majoritario"
    ]
    proportional = [
        (office.office_code, turnout, _office_votes(office, i))
        for office in state_offices
        if office.system == "proporcional"
    ]
    return [
        (FEDERAL_ELECTION_CODE, 1, [(1, turnout, _office_votes(presidency, i))]),
        (STATE_ELECTION_CODE, 1, majoritarian),
        (STATE_ELECTION_CODE, 2, proportional),
    ]


def _office_votes(office: StateOffice, i: int) -> list[BallotVote]:
    row = i - office.start
    votes = [
        BallotVote("nominal", int(v), candidate.ballot_number, candidate.party.number)
        for candidate, v in zip(office.candidates, office.votes[row], strict=True)
        if v > 0
    ]
    if office.party_votes is not None:
        votes += [
            BallotVote("legenda", int(v), party.number, party.number)
            for party, v in zip(office.parties, office.party_votes[row], strict=True)
            if v > 0
        ]
    if office.blank[row]:
        votes.append(BallotVote("branco", int(office.blank[row])))
    if office.null[row]:
        votes.append(BallotVote("nulo", int(office.null[row])))
    return votes


def _state_keys(state_code: str) -> list[tuple[int, str]]:
    """Keys of the state offices elected in `uf`: governor, senator, and the two proportional offices."""
    return [(3, state_code), (5, state_code), (6, state_code), (8 if state_code == "df" else 7, state_code)]
