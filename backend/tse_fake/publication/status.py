"""Who is elected in a snapshot: candidate situation (e, st) and the seats of each alliance."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np

from tse_fake.scenario.model import StateOffice

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario

Situation = dict[str, tuple[str, str]]  # tse_candidate_id -> (elected flag s/n, status text)


def compute_situation(
    scenario: Scenario, office: StateOffice, t: float, sums: dict[str, Any]
) -> tuple[Situation, dict[str, int], bool, bool]:
    """Situation of the candidates of `office` at instant `t`.

    Returns (situation, seats per alliance, mathematically decided, final tally).
    """
    final = sums["st"] == sums["ts"]
    votes = sums["votos"]
    remaining = (
        int(
            scenario.section_voters[office.start : office.end][
                scenario.section_time[office.start : office.end] > t
            ].sum()
        )
        * office.votes_per_voter
    )
    order = list(np.argsort(-votes, kind="stable"))
    situation: Situation = {cand.tse_candidate_id: ("n", "") for cand in office.candidates}
    seats_by_alliance: dict[str, int] = {}
    decided = False
    valid = int(votes.sum())
    if office.system == "majoritario" and valid:
        if office.seats == 1:
            decided = _decide_single_seat(office, votes, order, valid, final, remaining, situation)
        else:
            decided = _decide_multi_seat(office, votes, order, final, remaining, situation)
    elif office.system == "proporcional" and final and valid:
        seats_by_alliance, situation = _proportional_status(office, votes, sums["legenda"])
    return situation, seats_by_alliance, decided, final


def _decide_single_seat(
    office: StateOffice,
    votes: np.ndarray,
    order: list[Any],
    valid: int,
    final: bool,
    remaining: int,
    situation: Situation,
) -> bool:
    leader = int(order[0])
    if final and votes[leader] * 2 <= valid:
        top_two = {int(order[0]), int(order[1])} if len(order) > 1 else {leader}
        for i, cand in enumerate(office.candidates):
            situation[cand.tse_candidate_id] = ("n", "2º turno") if i in top_two else ("n", "Não eleito")
        return False
    if final or votes[leader] * 2 > valid + remaining:
        for i, cand in enumerate(office.candidates):
            situation[cand.tse_candidate_id] = ("s", "Eleito") if i == leader else ("n", "Não eleito")
        return True
    return False


def _decide_multi_seat(
    office: StateOffice,
    votes: np.ndarray,
    order: list[Any],
    final: bool,
    remaining: int,
    situation: Situation,
) -> bool:
    seats = office.seats
    defined = final or (len(order) > seats and votes[order[seats - 1]] > votes[order[seats]] + remaining)
    if not defined:
        return False
    elected = {int(x) for x in order[:seats]}
    for i, cand in enumerate(office.candidates):
        situation[cand.tse_candidate_id] = ("s", "Eleito") if i in elected else ("n", "Não eleito")
    return not final


def _alliance_votes(
    office: StateOffice, votes: np.ndarray, party_votes: np.ndarray | None
) -> tuple[dict[str, int], dict[str, list[int]]]:
    alliance_votes: dict[str, int] = {}
    alliance_candidates: dict[str, list[int]] = {}
    for i, cand in enumerate(office.candidates):
        alliance = cand.party.alliance
        alliance_votes[alliance] = alliance_votes.get(alliance, 0) + int(votes[i])
        alliance_candidates.setdefault(alliance, []).append(i)
    if party_votes is not None:
        for j, party in enumerate(office.parties):
            alliance_votes[party.alliance] = alliance_votes.get(party.alliance, 0) + int(party_votes[j])
    return alliance_votes, alliance_candidates


def _seat_allocation(alliance_votes: dict[str, int], seats: int) -> tuple[dict[str, int], dict[str, int]]:
    """Electoral quotient: full quotients first, then the remaining seats by the highest average."""
    total = sum(alliance_votes.values())
    quotient = max(1, round(total / seats))
    by_quotient = {alliance: votes // quotient for alliance, votes in alliance_votes.items()}
    allocated = dict(by_quotient)
    while sum(allocated.values()) < seats:
        best = max(alliance_votes, key=lambda alliance: alliance_votes[alliance] / (allocated[alliance] + 1))
        allocated[best] += 1
    return by_quotient, allocated


def _proportional_status(
    office: StateOffice, votes: np.ndarray, party_votes: np.ndarray | None
) -> tuple[dict[str, int], Situation]:
    alliance_votes, alliance_candidates = _alliance_votes(office, votes, party_votes)
    by_quotient, seats_by_alliance = _seat_allocation(alliance_votes, office.seats)
    situation: Situation = {}
    for alliance, indexes in alliance_candidates.items():
        indexes.sort(key=lambda i: -int(votes[i]))
        for position, i in enumerate(indexes):
            tse_id = office.candidates[i].tse_candidate_id
            if position < by_quotient[alliance]:
                situation[tse_id] = ("s", "Eleito por QP")
            elif position < seats_by_alliance[alliance]:
                situation[tse_id] = ("s", "Eleito por média")
            elif seats_by_alliance[alliance] > 0:
                situation[tse_id] = ("n", "Suplente")
            else:
                situation[tse_id] = ("n", "Não eleito")
    return seats_by_alliance, situation
