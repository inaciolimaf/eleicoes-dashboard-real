"""Synthetic election served by the TSE mock: geography, totalization times and votes, from one seed."""

from tse_fake.scenario.core import Scenario
from tse_fake.scenario.model import (
    CYCLE,
    ELECTION_EVENT_CODE,
    FEDERAL_ELECTION_CODE,
    STATE_ELECTION_CODE,
    Candidate,
    Municipality,
    Party,
    PollingPlace,
    ProportionalOffice,
    StateOffice,
    Zone,
)

__all__ = [
    "CYCLE",
    "ELECTION_EVENT_CODE",
    "FEDERAL_ELECTION_CODE",
    "STATE_ELECTION_CODE",
    "Candidate",
    "Municipality",
    "Party",
    "PollingPlace",
    "ProportionalOffice",
    "Scenario",
    "StateOffice",
    "Zone",
]
