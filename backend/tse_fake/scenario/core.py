"""The synthetic election, generated deterministically from a seed.

Everything is fictitious (candidates, parties, votes, places). The geography is real, so maps make sense.
The scenario is meant to "have a story": regional strengths differ and regions tally at
different paces, which makes the lead change during the night.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from tse_fake.data import UFS
from tse_fake.scenario.geography import build_geography
from tse_fake.scenario.model import Municipality, Party, PollingPlace, StateOffice, Zone
from tse_fake.scenario.timing import build_timing
from tse_fake.scenario.votes import build_votes


class Scenario:
    def __init__(self, semente: int = 2026, escala: float = 1.0) -> None:
        # The keyword names `semente` and `escala` are kept because tests/integration/test_fluxo_completo.py
        # calls them; rename them together with that test.
        self.seed = semente
        self.scale = escala
        self.rng = np.random.default_rng(semente)
        self.municipalities: list[Municipality] = []
        self.zones: list[Zone] = []
        self.polling_places: list[PollingPlace] = []
        self.ufs: list[str] = sorted(UFS)
        self.state_ranges: dict[str, tuple[int, int]] = {}
        self.offices: dict[tuple[int, str], StateOffice] = {}
        self.parties: list[Party] = []
        self.rings: dict[int, list[Any]] = {}  # municipality outlines, from the real map
        self._municipality_index: dict[tuple[str, int], Municipality] | None = None
        # Per-section arrays, filled by the geography and timing builders.
        self.section_count: int = 0
        self.section_uf: np.ndarray
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

    def offices_of_uf(self, uf: str) -> list[StateOffice]:
        return [office for (_code, office_uf), office in self.offices.items() if office_uf == uf]

    def municipality_by_code(self, uf: str, tse_code: int) -> Municipality | None:
        if self._municipality_index is None:
            self._municipality_index = {(m.uf, m.tse_code): m for m in self.municipalities}
        return self._municipality_index.get((uf, tse_code))
