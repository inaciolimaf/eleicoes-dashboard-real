"""The publication of the mock: the TSE dissemination files of the scenario at a simulated instant.

The files change only at the rounds of the tally (every PERIOD simulated seconds), and their generation
id changes with them, as in the TSE. Lookups and documents are cached per instance, not with lru_cache.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from tse_fake.publication import documents, results, section_files
from tse_fake.publication.formatting import PERIOD, last_change, round_of
from tse_fake.publication.status import Situation, compute_situation
from tse_fake.scenario.core import Scenario
from tse_fake.scenario.model import StateOffice


class Publication:
    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.national_times = np.sort(scenario.section_time)
        self.state_times = {
            state_code: np.sort(scenario.section_time[a:b])
            for state_code, (a, b) in scenario.state_ranges.items()
        }
        self.municipality_times = [
            np.sort(scenario.section_time[m.start : m.end]) for m in scenario.municipalities
        ]
        self.zone_times = [np.sort(scenario.section_time[z.start : z.end]) for z in scenario.zones]
        self._section_index = self._build_section_index()
        self._zone_index = self._build_zone_index()
        self._situation_cache: dict[tuple[int, str, float], tuple[Situation, dict[str, int], bool, bool]] = {}
        self._municipality_cache: dict[int, dict[str, Any]] = {}
        self._state_section_cache: dict[str, dict[str, Any]] = {}
        self._ballot_cache: dict[int, bytes] = {}
        self._places_csv: bytes | None = None

    def _build_section_index(self) -> dict[tuple[str, int, int, int], int]:
        scenario = self.scenario
        index: dict[tuple[str, int, int, int], int] = {}
        for i in range(scenario.section_count):
            municipality = scenario.municipalities[int(scenario.section_municipality[i])]
            zone = scenario.zones[int(scenario.section_zone[i])]
            key = (
                municipality.state_code,
                municipality.tse_code,
                zone.number,
                int(scenario.section_number[i]),
            )
            index[key] = i
        return index

    def _build_zone_index(self) -> dict[tuple[str, int, int], Any]:
        scenario = self.scenario
        return {
            (
                scenario.municipalities[z.municipality].state_code,
                scenario.municipalities[z.municipality].tse_code,
                z.number,
            ): z
            for z in scenario.zones
        }

    def office(self, office_code: int, state_code: str) -> StateOffice | None:
        if office_code == 1:
            return self.scenario.offices.get((1, "br"))
        return self.scenario.offices.get((office_code, state_code))

    def time_range(
        self, state_code: str, municipality: int | None, zone: int | None
    ) -> tuple[np.ndarray, int, int]:
        """Sorted tally times of the area, and the index range of its sections."""
        scenario = self.scenario
        if state_code == "br":
            return self.national_times, 0, scenario.section_count
        if municipality is None:
            start, end = scenario.state_ranges[state_code]
            return self.state_times[state_code], start, end
        found = scenario.municipality_by_code(state_code, municipality)
        if found is None:
            raise KeyError("municipio")
        if zone is None:
            return self.municipality_times[found.idx], found.start, found.end
        found_zone = self._zone_index.get((state_code, municipality, zone))
        if found_zone is None:
            raise KeyError("zona")
        return self.zone_times[found_zone.idx], found_zone.start, found_zone.end

    def generation(self, times: np.ndarray, t: float) -> tuple[str, float | None]:
        """Generation id of a file (changes with each rewrite) and the last change before `t`."""
        last = last_change(times, t)
        rounds = 0 if last is None else int(last / PERIOD) + 1
        return str(170000000 + rounds), last

    def sums(self, office: StateOffice, start: int, end: int, t: float) -> dict[str, Any]:
        """Votes and electorate of the sections of `office` inside [start, end) that are tallied at `t`."""
        scenario = self.scenario
        a, b = max(start, office.start), min(end, office.end)
        mask = scenario.section_time[a:b] <= t
        row_start, row_end = a - office.start, b - office.start
        voters = scenario.section_voters[a:b]
        turnout = scenario.section_turnout[a:b]
        party_votes = None
        if office.party_votes is not None:
            party_votes = office.party_votes[row_start:row_end][mask].sum(axis=0).astype(np.int64)
        return {
            "votos": office.votes[row_start:row_end][mask].sum(axis=0).astype(np.int64),
            "legenda": party_votes,
            "brancos": int(office.blank[row_start:row_end][mask].sum()),
            "nulos": int(office.null[row_start:row_end][mask].sum()),
            "ts": int(b - a),
            "st": int(mask.sum()),
            "te": int(voters.sum()),
            "est": int(voters[mask].sum()),
            "c": int(turnout[mask].sum()),
        }

    def situation(self, office: StateOffice, t: float) -> tuple[Situation, dict[str, int], bool, bool]:
        """Situation of the candidates, cached per round (as the TSE file is only rewritten per round)."""
        key = (office.office_code, office.state_code, round_of(t))
        cached = self._situation_cache.get(key)
        if cached is None:
            sums = self.sums(office, office.start, office.end, t)
            cached = compute_situation(self.scenario, office, t, sums)
            self._situation_cache[key] = cached
        return cached

    def catalog(self) -> dict[str, Any]:
        return documents.catalog_document()

    def municipalities(self, election: int) -> dict[str, Any]:
        if election not in self._municipality_cache:
            self._municipality_cache[election] = documents.municipalities_document(self.scenario)
        return self._municipality_cache[election]

    def tracking(self, election: int, state_code: str, t: float) -> tuple[str, dict[str, Any]]:
        return results.tracking_document(self, election, state_code, t)

    def result(
        self,
        election: int,
        office_code: int,
        state_code: str,
        municipality: int | None,
        zone: int | None,
        t: float,
        only_elected: bool = False,
    ) -> tuple[str, dict[str, Any]] | None:
        area = (state_code, municipality, zone)
        return results.result_document(self, election, office_code, area, t, only_elected)

    def state_sections(self, state_code: str) -> dict[str, Any]:
        if state_code not in self._state_section_cache:
            self._state_section_cache[state_code] = documents.state_sections_document(
                self.scenario, state_code
            )
        return self._state_section_cache[state_code]

    def section_index(self, state_code: str, municipality: int, zone: int, section: int) -> int | None:
        return self._section_index.get((state_code, municipality, zone, section))

    def section_hash(self, i: int) -> str:
        return section_files.section_hash(self.scenario, i)

    def bu_name(self, i: int) -> str:
        return section_files.bu_name(self.scenario, i)

    def auxiliary(self, i: int, t: float) -> tuple[str, dict[str, Any]]:
        return section_files.auxiliary_document(self.scenario, i, t)

    def ballot_box(self, i: int) -> bytes:
        if i not in self._ballot_cache:
            self._ballot_cache[i] = section_files.ballot_box_bytes(self.scenario, i)
        return self._ballot_cache[i]

    def places_csv(self) -> bytes:
        if self._places_csv is None:
            self._places_csv = documents.places_csv(self.scenario)
        return self._places_csv

    def photo_svg(self, tse_candidate_id: str) -> bytes | None:
        return documents.photo_svg(self.scenario, tse_candidate_id)
