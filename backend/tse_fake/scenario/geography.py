"""Geography of the synthetic election: municipalities, zones, polling places and sections.

The real map (municipalities and outlines) is used so the maps make sense. Everything else is fictitious.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import numpy as np

from tse_fake.data import CAPITALS, DISTRICTS, HONOREES, PLACE_TYPES, STATES, STREET_TYPES
from tse_fake.scenario.model import MUNICIPALITIES_FILE, Municipality, PollingPlace, Zone

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario

ZONE_SECTIONS = 140  # sections per zone (about)
MAX_ZONES = 40


@dataclass
class _SectionColumns:
    """One list per section attribute; turned into numpy arrays once every municipality is placed."""

    state_code: list[int] = field(default_factory=list)
    municipality: list[int] = field(default_factory=list)
    zone: list[int] = field(default_factory=list)
    place: list[int] = field(default_factory=list)
    number: list[int] = field(default_factory=list)
    voters: list[int] = field(default_factory=list)
    lat: list[float] = field(default_factory=list)
    lon: list[float] = field(default_factory=list)


def build_geography(scenario: Scenario) -> None:
    builder = _GeographyBuilder(scenario)
    raw: list[dict[str, Any]] = json.loads(MUNICIPALITIES_FILE.read_text(encoding="utf-8"))
    raw.sort(key=lambda m: (m["uf"].lower(), m["nome"]))
    for entry in raw:
        builder.add_municipality(entry)
    builder.finish()
    _turnout(scenario)


def _turnout(scenario: Scenario) -> None:
    rng = scenario.rng
    rate_by_municipality = np.clip(rng.normal(0.80, 0.045, len(scenario.municipalities)), 0.6, 0.93)
    rate = np.clip(
        rate_by_municipality[scenario.section_municipality] + rng.normal(0, 0.02, scenario.section_count),
        0.5,
        0.97,
    )
    scenario.section_turnout = rng.binomial(scenario.section_voters, rate).astype(np.int32)


def _inside(x: float, y: float, ring: list[Any]) -> bool:
    """Ray casting: is the point inside the polygon `ring`?"""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


class _GeographyBuilder:
    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.rng = scenario.rng
        self.cols = _SectionColumns()
        self.uf_index = {state_code: i for i, state_code in enumerate(scenario.states)}
        self.zone_numbers: dict[str, int] = {}

    def add_municipality(self, entry: dict[str, Any]) -> None:
        scenario = self.scenario
        state_code = entry["uf"].lower()
        is_capital = entry["ibge"] in CAPITALS
        mun = Municipality(
            idx=len(scenario.municipalities),
            state_code=state_code,
            tse_code=entry["ibge"] % 100000,
            ibge_code=entry["ibge"],
            name=entry["nome"].upper(),
            is_capital=is_capital,
            lat=entry["lat"],
            lon=entry["lon"],
            region=STATES[state_code][1],
        )
        scenario.rings[mun.idx] = entry["aneis"]
        count = self._section_count(state_code, is_capital)
        mun.start = len(self.cols.number)
        zone_count = max(1, min(MAX_ZONES, math.ceil(count / ZONE_SECTIONS)))
        for part in np.array_split(np.arange(count), zone_count):
            if len(part) > 0:
                self._add_zone(mun, len(part))
        mun.end = len(self.cols.number)
        scenario.municipalities.append(mun)

    def _section_count(self, state_code: str, is_capital: bool) -> int:
        if is_capital:
            count = int(
                self.rng.lognormal(math.log(380), 0.45) * (1.6 if state_code in ("sp", "rj") else 1.0)
            )
        else:
            count = int(self.rng.lognormal(math.log(5.5), 0.95))
        return max(1, round(count * self.scenario.scale))

    def _add_zone(self, mun: Municipality, remaining: int) -> None:
        scenario = self.scenario
        self.zone_numbers[mun.state_code] = self.zone_numbers.get(mun.state_code, 0) + 1
        zone = Zone(
            idx=len(scenario.zones),
            state_code=mun.state_code,
            number=self.zone_numbers[mun.state_code],
            municipality=mun.idx,
            start=len(self.cols.number),
        )
        scenario.zones.append(zone)
        mun.zones.append(zone.idx)
        number = 1
        place_index = 0
        while remaining > 0:
            size = min(remaining, int(self.rng.integers(2, 11)))
            lat, lon, approx = self._point(mun)
            place = self._new_place(mun, zone, place_index, lat, lon, approx)
            number = self._add_sections(mun, zone, place, size, (lat, lon), number)
            place.end = len(self.cols.number)
            scenario.polling_places.append(place)
            remaining -= size
            place_index += 1
        zone.end = len(self.cols.number)

    def _place_name(self) -> str:
        return f"{self.rng.choice(PLACE_TYPES)} {self.rng.choice(HONOREES)}"

    def _new_place(
        self, mun: Municipality, zone: Zone, place_index: int, lat: float, lon: float, approx: bool
    ) -> PollingPlace:
        rng = self.rng
        name = self._place_name()
        address = f"{rng.choice(STREET_TYPES)} {rng.choice(HONOREES)}, {int(rng.integers(1, 3000))}"
        if mun.is_capital:
            district = f"{rng.choice(DISTRICTS)} {int(rng.integers(1, 9))}"
        else:
            district = str(rng.choice(DISTRICTS))
        zip_code = f"{int(rng.integers(10000, 99999))}-{int(rng.integers(0, 999)):03d}"
        return PollingPlace(
            idx=len(self.scenario.polling_places),
            zone=zone.idx,
            number=1015 + 8 * place_index,
            name=name,
            address=address,
            district=district,
            zip_code=zip_code,
            lat=None if approx else lat,
            lon=None if approx else lon,
            start=len(self.cols.number),
        )

    def _add_sections(
        self,
        mun: Municipality,
        zone: Zone,
        place: PollingPlace,
        size: int,
        point: tuple[float, float],
        number: int,
    ) -> int:
        lat, lon = point
        for _ in range(size):
            self.cols.state_code.append(self.uf_index[mun.state_code])
            self.cols.municipality.append(mun.idx)
            self.cols.zone.append(zone.idx)
            self.cols.place.append(place.idx)
            self.cols.number.append(number)
            number += 1 + int(self.rng.integers(0, 3) == 0)
            self.cols.voters.append(int(self.rng.integers(170, 400)))
            self.cols.lat.append(lat)
            self.cols.lon.append(lon)
        return number

    def _point(self, mun: Municipality) -> tuple[float, float, bool]:
        """A point inside the municipality (or near its centre), and whether the point is approximate."""
        rng = self.rng
        approx = rng.random() < 0.03
        rings = self.scenario.rings.get(mun.idx) or []
        ring = max(rings, key=len) if rings else None
        if ring:
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
            for _ in range(30):
                if mun.is_capital or rng.random() < 0.6:
                    sx = max((maxx - minx) * 0.12, 0.004)
                    sy = max((maxy - miny) * 0.12, 0.004)
                    x = float(rng.normal(mun.lon, sx))
                    y = float(rng.normal(mun.lat, sy))
                else:
                    x = float(rng.uniform(minx, maxx))
                    y = float(rng.uniform(miny, maxy))
                if _inside(x, y, ring):
                    return round(y, 5), round(x, 5), approx
        return (
            round(mun.lat + float(rng.normal(0, 0.005)), 5),
            round(mun.lon + float(rng.normal(0, 0.005)), 5),
            approx,
        )

    def finish(self) -> None:
        scenario = self.scenario
        cols = self.cols
        scenario.section_uf = np.array(cols.state_code, dtype=np.int16)
        scenario.section_municipality = np.array(cols.municipality, dtype=np.int32)
        scenario.section_zone = np.array(cols.zone, dtype=np.int32)
        scenario.section_place = np.array(cols.place, dtype=np.int32)
        scenario.section_number = np.array(cols.number, dtype=np.int32)
        scenario.section_voters = np.array(cols.voters, dtype=np.int32)
        scenario.section_lat = np.array(cols.lat, dtype=np.float64)
        scenario.section_lon = np.array(cols.lon, dtype=np.float64)
        scenario.section_count = len(cols.number)
        for state_code in scenario.states:
            indexes = np.nonzero(scenario.section_uf == self.uf_index[state_code])[0]
            scenario.state_ranges[state_code] = (int(indexes[0]), int(indexes[-1]) + 1)
