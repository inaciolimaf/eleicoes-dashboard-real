"""Totalization times: minutes after 17h (Brasilia time) at which each section is tallied."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from tse_fake.scenario.core import Scenario

MEDIAN_MINUTES_BY_REGION = {
    "Sudeste": 32.0,
    "Sul": 30.0,
    "Centro-Oeste": 42.0,
    "Nordeste": 62.0,
    "Norte": 85.0,
}


def build_timing(scenario: Scenario) -> None:
    rng = scenario.rng
    median_by_municipality = np.array(
        [
            MEDIAN_MINUTES_BY_REGION[m.region] * (0.75 if m.capital else 1.0) * float(rng.lognormal(0, 0.25))
            for m in scenario.municipalities
        ]
    )
    times = rng.lognormal(np.log(median_by_municipality[scenario.section_municipality]), 0.55)
    late = rng.random(scenario.section_count) < 0.004
    times[late] = rng.uniform(200, 380, int(late.sum()))
    scenario.section_time = np.clip(times, 0.4, 390.0) * 60.0  # seconds
