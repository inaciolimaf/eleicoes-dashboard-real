"""Vote generation for the majoritarian offices: President, Governor and Senator."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from tse_fake.data import UFS, state_seats
from tse_fake.scenario.helpers import (
    blank_and_null,
    distribute,
    make_name,
    make_parties,
    spatial_field,
    tse_candidate_id,
    unique_numbers,
)
from tse_fake.scenario.model import (
    FEDERAL_ELECTION_CODE,
    STATE_ELECTION_CODE,
    Candidate,
    ProportionalOffice,
    StateOffice,
)
from tse_fake.scenario.proportional import add_proportional_office

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario

# (base utility, bonus by region): a close race with opposed regional strengths, so the lead changes
PRESIDENTIAL_PROFILE: list[tuple[float, dict[str, float]]] = [
    (1.30, {"Nordeste": 0.75, "Norte": 0.35, "Sudeste": -0.15, "Sul": -0.45, "Centro-Oeste": -0.35}),
    (1.28, {"Nordeste": -0.55, "Norte": 0.05, "Sudeste": 0.12, "Sul": 0.45, "Centro-Oeste": 0.40}),
    (-0.35, {"Sudeste": 0.25, "Sul": 0.10}),
    (-0.75, {"Nordeste": 0.20}),
    (-1.25, {"Sul": 0.30}),
    (-1.70, {}),
    (-2.20, {"Norte": 0.40}),
    (-2.60, {}),
]
PRESIDENTIAL_PARTY_INDEXES = [0, 2, 5, 6, 7, 8, 9, 10]


def build_votes(scenario: Scenario) -> None:
    rng = np.random.default_rng(scenario.seed + 1)
    scenario.parties = make_parties()
    _presidency(scenario, rng)
    for uf in scenario.ufs:
        start, end = scenario.state_ranges[uf]
        used: set[str] = set()
        _governor(scenario, rng, uf, start, end, used)
        _senate(scenario, rng, uf, start, end, used)
        seats = UFS[uf][2]
        add_proportional_office(scenario, rng, ProportionalOffice(6, uf, seats, 4), start, end, used)
        state_code = 8 if uf == "df" else 7
        state_seats_count = 24 if uf == "df" else state_seats(seats)
        add_proportional_office(
            scenario, rng, ProportionalOffice(state_code, uf, state_seats_count, 5), start, end, used
        )


def _draw_names(rng: np.random.Generator, used: set[str], vice_count: int) -> tuple[str, str, list[str]]:
    """Full name, ballot name and the ballot names of `vice_count` running mates or substitutes."""
    name, ballot = make_name(rng, used)
    vices = [make_name(rng, used)[1] for _ in range(vice_count)]
    return name, ballot, vices


def _presidency(scenario: Scenario, rng: np.random.Generator) -> None:
    n = scenario.section_count
    noise_by_municipality = rng.normal(0, 1, (len(scenario.municipalities), 12))
    region_of_section = np.array([m.region for m in scenario.municipalities])[scenario.section_municipality]
    candidates, util = _presidential_slate(scenario, rng, noise_by_municipality, region_of_section)
    blank, null, valid = blank_and_null(rng, scenario.section_turnout[0:n], 0.018, 0.032)
    scenario.offices[(1, "br")] = StateOffice(
        office_code=1,
        uf="br",
        election_code=FEDERAL_ELECTION_CODE,
        system="majoritario",
        seats=1,
        votes_per_voter=1,
        start=0,
        end=n,
        candidates=candidates,
        votes=distribute(rng, util, valid),
        blank=blank,
        null=null,
    )


def _presidential_slate(
    scenario: Scenario,
    rng: np.random.Generator,
    noise_by_municipality: np.ndarray,
    region_of_section: np.ndarray,
) -> tuple[list[Candidate], np.ndarray]:
    used: set[str] = set()
    util = np.zeros((scenario.section_count, len(PRESIDENTIAL_PROFILE)))
    candidates: list[Candidate] = []
    for i, (base, bonus) in enumerate(PRESIDENTIAL_PROFILE):
        party = scenario.parties[PRESIDENTIAL_PARTY_INDEXES[i]]
        name, ballot, (vice,) = _draw_names(rng, used, 1)
        candidate_id = tse_candidate_id(scenario.seed, 1, "br", i)
        candidates.append(Candidate(candidate_id, party.number, name, ballot, party, [("v", vice)]))
        noise = noise_by_municipality[scenario.section_municipality, i]
        util[:, i] = _presidential_column(scenario, rng, base, bonus, region_of_section, noise)
    return candidates, util


def _presidential_column(
    scenario: Scenario,
    rng: np.random.Generator,
    base: float,
    bonus: dict[str, float],
    region_of_section: np.ndarray,
    noise: np.ndarray,
) -> np.ndarray:
    """Utility of one presidential candidate in every section."""
    n = scenario.section_count
    column = np.full(n, base)
    for region, value in bonus.items():
        column = column + np.where(region_of_section == region, value, 0.0)
    column = column + spatial_field(rng, scenario.section_lat, scenario.section_lon, 6, 1.0) * 0.35
    column = column + noise * 0.18
    return column + rng.normal(0, 0.08, n)


def _governor(
    scenario: Scenario, rng: np.random.Generator, uf: str, start: int, end: int, used: set[str]
) -> None:
    candidates, util = _governor_slate(scenario, rng, uf, start, end, used)
    blank, null, valid = blank_and_null(rng, scenario.section_turnout[start:end], 0.03, 0.04)
    scenario.offices[(3, uf)] = StateOffice(
        office_code=3,
        uf=uf,
        election_code=STATE_ELECTION_CODE,
        system="majoritario",
        seats=1,
        votes_per_voter=1,
        start=start,
        end=end,
        candidates=candidates,
        votes=distribute(rng, util, valid),
        blank=blank,
        null=null,
    )


def _governor_slate(
    scenario: Scenario, rng: np.random.Generator, uf: str, start: int, end: int, used: set[str]
) -> tuple[list[Candidate], np.ndarray]:
    n = end - start
    lat = scenario.section_lat[start:end]
    lon = scenario.section_lon[start:end]
    parties = scenario.parties
    count = int(rng.integers(3, 7))
    bases = np.sort(rng.normal(0, 0.9, count))[::-1]
    bases[0] += float(rng.uniform(0.0, 0.9))
    candidates: list[Candidate] = []
    util = np.zeros((n, count))
    chosen = rng.choice(len(parties), count, replace=False)
    for i in range(count):
        party = parties[int(chosen[i])]
        name, ballot, (vice,) = _draw_names(rng, used, 1)
        candidate_id = tse_candidate_id(scenario.seed, 3, uf, i)
        candidates.append(Candidate(candidate_id, party.number, name, ballot, party, [("v", vice)]))
        util[:, i] = bases[i] + spatial_field(rng, lat, lon, 3, 0.6) * 0.5 + rng.normal(0, 0.1, n)
    return unique_numbers(candidates, util)


def _senate(
    scenario: Scenario, rng: np.random.Generator, uf: str, start: int, end: int, used: set[str]
) -> None:
    """Senate: two seats in 2026, so each voter votes for two candidates."""
    candidates, util = _senate_slate(scenario, rng, uf, start, end, used)
    blank, null, valid = blank_and_null(rng, scenario.section_turnout[start:end], 0.06, 0.07)
    scenario.offices[(5, uf)] = StateOffice(
        office_code=5,
        uf=uf,
        election_code=STATE_ELECTION_CODE,
        system="majoritario",
        seats=2,
        votes_per_voter=2,
        start=start,
        end=end,
        candidates=candidates,
        votes=distribute(rng, util, valid * 2),
        blank=blank * 2,
        null=null * 2,
    )


def _senate_slate(
    scenario: Scenario, rng: np.random.Generator, uf: str, start: int, end: int, used: set[str]
) -> tuple[list[Candidate], np.ndarray]:
    n = end - start
    lat = scenario.section_lat[start:end]
    lon = scenario.section_lon[start:end]
    parties = scenario.parties
    count = int(rng.integers(5, 9))
    candidates: list[Candidate] = []
    util = np.zeros((n, count))
    bases = np.sort(rng.normal(0, 0.8, count))[::-1]
    chosen = rng.choice(len(parties), count, replace=False)
    for i in range(count):
        party = parties[int(chosen[i])]
        name, ballot, substitutes = _draw_names(rng, used, 2)
        number = party.number * 10 + int(rng.integers(0, 10))
        candidate_id = tse_candidate_id(scenario.seed, 5, uf, i)
        vices = [("s", substitute) for substitute in substitutes]
        candidates.append(Candidate(candidate_id, number, name, ballot, party, vices))
        util[:, i] = bases[i] + spatial_field(rng, lat, lon, 3, 0.6) * 0.5 + rng.normal(0, 0.1, n)
    return unique_numbers(candidates, util)
