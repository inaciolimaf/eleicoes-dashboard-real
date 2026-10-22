"""The synthetic election, generated deterministically from a seed.

Everything is fictitious (candidates, parties, votes, places). The geography is real, so maps make sense.
The scenario is meant to "have a story": regional strengths differ and regions tally at
different paces, which makes the lead change during the night.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from tse_fake.data import STATES
from tse_fake.scenario.geography import build_geography
from tse_fake.scenario.model import Municipality, Party, PollingPlace, StateOffice, Zone
from tse_fake.scenario.timing import build_timing
from tse_fake.scenario.votes import build_votes


class Scenario:
    def __init__(self, seed: int = 2026, scale: float = 1.0) -> None:
        self.seed = seed
        self.scale = scale
        self.rng = np.random.default_rng(seed)
        self.municipalities: list[Municipality] = []
        self.zones: list[Zone] = []
        self.polling_places: list[PollingPlace] = []
        self.states: list[str] = sorted(STATES)
        self.state_ranges: dict[str, tuple[int, int]] = {}
        self.offices: dict[tuple[int, str], StateOffice] = {}
        self.parties: list[Party] = []
        self.rings: dict[int, list[Any]] = {}  # municipality outlines, from the real map
        self._municipality_index: dict[tuple[str, int], Municipality] | None = None
        # Per-section arrays, filled by the geography and timing builders.
        self.section_count: int = 0
        self.section_state: np.ndarray
        self.section_municipality: np.ndarray
        self.section_zone: np.ndarray
        self.section_place: np.ndarray
        self.section_number: np.ndarray
        self.section_voters: np.ndarray
        self.section_lat: np.ndarray
        self.section_lon: np.ndarray
        self.section_turnout: np.ndarray
        self.section_time: np.ndarray
        build_geography(self)
        build_timing(self)
        build_votes(self)

    def offices_of_state(self, state_code: str) -> list[StateOffice]:
        return [
            office for (_code, office_state), office in self.offices.items() if office_state == state_code
        ]

    def municipality_by_code(self, state_code: str, tse_code: int) -> Municipality | None:
        if self._municipality_index is None:
            self._municipality_index = {(m.state_code, m.tse_code): m for m in self.municipalities}
        return self._municipality_index.get((state_code, tse_code))
