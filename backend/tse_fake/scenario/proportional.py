"""Vote generation for proportional offices (federal and state deputies): candidates and votes."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from tse_fake.scenario.helpers import (
    blank_and_null,
    distribute,
    make_name,
    spatial_field,
    tse_candidate_id,
)
from tse_fake.scenario.model import STATE_ELECTION_CODE, Candidate, ProportionalOffice, StateOffice

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario


def add_proportional_office(
    scenario: Scenario,
    rng: np.random.Generator,
    office: ProportionalOffice,
    start: int,
    end: int,
    used: set[str],
) -> None:
    n = end - start
    lat = scenario.section_lat[start:end]
    lon = scenario.section_lon[start:end]
    strength, party_prob = _party_probabilities(scenario, rng, lat, lon, n)
    candidates, columns = _candidate_pool(scenario, rng, office, lat, lon, strength, used)
    blank, null, valid = blank_and_null(rng, scenario.section_turnout[start:end], 0.035, 0.055)
    party_list_fraction = rng.uniform(0.03, 0.09, n)
    party_list_total = rng.binomial(valid, party_list_fraction).astype(np.int32)
    nominal = valid - party_list_total
    util = _candidate_utilities(n, len(candidates), columns, party_prob, len(scenario.parties))
    votes = distribute(rng, util, nominal)
    party_votes = rng.multinomial(party_list_total.astype(np.int64), party_prob).astype(np.int32)
    scenario.offices[(office.code, office.uf)] = StateOffice(
        office_code=office.code,
        uf=office.uf,
        election_code=STATE_ELECTION_CODE,
        system="proporcional",
        seats=office.seats,
        votes_per_voter=1,
        start=start,
        end=end,
        candidates=candidates,
        votes=votes,
        blank=blank,
        null=null,
        parties=scenario.parties,
        party_votes=party_votes,
    )


def _party_probabilities(
    scenario: Scenario, rng: np.random.Generator, lat: np.ndarray, lon: np.ndarray, n: int
) -> tuple[np.ndarray, np.ndarray]:
    """Strength of each party (drawn once) and, per section, the probability of voting for it."""
    parties = scenario.parties
    strength = rng.normal(0, 0.7, len(parties))
    party_util = np.zeros((n, len(parties)))
    for j in range(len(parties)):
        party_util[:, j] = strength[j] + spatial_field(rng, lat, lon, 2, 0.6) * 0.4
    party_prob = np.exp(party_util)
    party_prob /= party_prob.sum(axis=1, keepdims=True)
    return strength, party_prob


def _candidate_pool(
    scenario: Scenario,
    rng: np.random.Generator,
    office: ProportionalOffice,
    lat: np.ndarray,
    lon: np.ndarray,
    strength: np.ndarray,
    used: set[str],
) -> tuple[list[Candidate], list[tuple[int, np.ndarray]]]:
    """Candidates of every party, each with its column of log-utilities (party index, values)."""
    parties = scenario.parties
    n = len(lat)
    total_candidates = max(len(parties) * 2, int(office.seats * 1.4))
    party_weight = np.exp(strength) / np.exp(strength).sum()
    per_party = np.maximum(1, np.round(party_weight * total_candidates)).astype(int)
    candidates: list[Candidate] = []
    columns: list[tuple[int, np.ndarray]] = []
    for j, party in enumerate(parties):
        zipf = 1.0 / np.arange(1, per_party[j] + 1) ** 1.05
        used_numbers: set[int] = set()
        for k in range(per_party[j]):
            number = _free_number(rng, party.number, office.digits, used_numbers)
            name, ballot = make_name(rng, used)
            candidates.append(
                Candidate(
                    tse_candidate_id(scenario.seed, office.code, office.uf, len(candidates)),
                    number,
                    name,
                    ballot,
                    party,
                )
            )
            section = int(rng.integers(0, n))
            d2 = (lat - lat[section]) ** 2 + (lon - lon[section]) ** 2
            stronghold = 1.6 * np.exp(-d2 / (2 * float(rng.uniform(0.05, 0.6)) ** 2))
            columns.append((j, np.log(zipf[k]) + stronghold))
    return candidates, columns


def _free_number(rng: np.random.Generator, party_number: int, digits: int, used_numbers: set[int]) -> int:
    while True:
        number: int = party_number * 10 ** (digits - 2) + int(rng.integers(1, 10 ** (digits - 2)))
        if number not in used_numbers:
            used_numbers.add(number)
            return number


def _candidate_utilities(
    n: int,
    count: int,
    columns: list[tuple[int, np.ndarray]],
    party_prob: np.ndarray,
    party_total: int,
) -> np.ndarray:
    """Candidate probability: party strength in the section times the weight of the candidate in the party."""
    util = np.zeros((n, count))
    for j in range(party_total):
        idx = [i for i, (party_index, _) in enumerate(columns) if party_index == j]
        if not idx:
            continue
        block = np.exp(np.array([columns[i][1] for i in idx]).T)
        block /= block.sum(axis=1, keepdims=True)
        util[:, idx] = np.log(party_prob[:, [j]] * block + 1e-12)
    return util
