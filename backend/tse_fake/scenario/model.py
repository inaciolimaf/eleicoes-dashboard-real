"""Records of the synthetic election: parties, candidates, offices, municipalities, zones and places."""

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

MUNICIPALITIES_FILE = Path(__file__).resolve().parent.parent.parent / "app" / "data" / "municipios.json"

ELECTION_EVENT_CODE = 9001
FEDERAL_ELECTION_CODE = 9100
STATE_ELECTION_CODE = 9102
CYCLE = "ele2026"


@dataclass(frozen=True)
class ProportionalOffice:
    """Proportional office to generate: TSE code, state, seats and digits of the candidate number."""

    code: int
    state_code: str
    seats: int
    digits: int


@dataclass
class Party:
    number: int
    acronym: str
    name: str
    alliance: str
    alliance_number: str
    kind: str  # i (isolated) | f (federation)


@dataclass
class Candidate:
    tse_candidate_id: str
    ballot_number: int
    name: str
    ballot_name: str
    party: Party
    vice_candidates: list[tuple[str, str]] = field(default_factory=list)  # (kind, name)


@dataclass
class StateOffice:
    """Votes of one office in one area (the whole country for President, one state for the others)."""

    office_code: int
    state_code: str  # "br" or a state acronym
    election_code: int
    system: str
    seats: int
    votes_per_voter: int
    start: int  # global index of the first section
    end: int
    candidates: list[Candidate]
    votes: np.ndarray  # (end-start, candidates) int32
    blank: np.ndarray
    null: np.ndarray
    parties: list[Party] = field(default_factory=list)
    party_votes: np.ndarray | None = None  # (end-start, parties)


@dataclass
class Municipality:
    idx: int
    state_code: str
    tse_code: int
    ibge_code: int
    name: str
    is_capital: bool
    lat: float
    lon: float
    region: str
    start: int = 0
    end: int = 0
    zones: list[int] = field(default_factory=list)


@dataclass
class Zone:
    idx: int
    state_code: str
    number: int
    municipality: int
    start: int = 0
    end: int = 0


@dataclass
class PollingPlace:
    idx: int
    zone: int
    number: int
    name: str
    address: str
    district: str
    zip_code: str
    lat: float | None
    lon: float | None
    start: int = 0
    end: int = 0
