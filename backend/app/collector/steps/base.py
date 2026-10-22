"""State shared by the collector steps.

The steps are mixins of `Collector` (see `app/collector/collector.py`). Each one reads and writes
the attributes declared here, so each module type-checks on its own. `Collector.__init__` sets them.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TypedDict

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.collector.fetcher import Fetcher
from app.core.config import Settings
from app.infra.tse.catalog import Catalogo
from app.infra.tse.jws import ChaveJWS
from app.infra.tse.urls import MontadorUrls
from app.modules.elections import Election

log = logging.getLogger("collector")

STATES = [
    "ac",
    "al",
    "am",
    "ap",
    "ba",
    "ce",
    "df",
    "es",
    "go",
    "ma",
    "mg",
    "ms",
    "mt",
    "pa",
    "pb",
    "pe",
    "pi",
    "pr",
    "rj",
    "rn",
    "ro",
    "rr",
    "rs",
    "sc",
    "se",
    "sp",
    "to",
]

# (priority, order, round, municipality id): lower priority number goes first
MunicipalityJob = tuple[int, int, int, str]
# (priority, order, round, state, municipality code, zone, section)
SectionJob = tuple[int, int, int, str, int, int, int]


class MunicipalityInfo(TypedDict):
    uf: str
    code: int
    zonas: list[int]


@dataclass(frozen=True)
class SectionRef:
    """One polling section: its round and its TSE location."""

    round: int
    uf: str
    municipality: int
    zone: int
    section: int

    @property
    def id(self) -> str:
        """The section id used in Redis and in the database, for example `sp71072-z0001-s0120`."""
        return f"{self.uf}{self.municipality:05d}-z{self.zone:04d}-s{self.section:04d}"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class CollectorBase:
    """Attribute declarations only: `Collector.__init__` assigns them."""

    settings: Settings
    sessionmaker: async_sessionmaker[AsyncSession]
    redis: Redis
    fetcher: Fetcher
    #: Public key of the signed (JWS) files; None when the signature is not checked.
    signing_key: ChaveJWS | None
    catalog: Catalogo | None
    urls: MontadorUrls | None
    elections: list[Election]
    municipalities: dict[str, MunicipalityInfo]
    sections_by_municipality: dict[str, list[tuple[int, int]]]
    states_with_sections: set[str]
    #: (round, municipality id) -> (sections tallied, tallied at) seen by the last tracking file.
    municipality_signature: dict[tuple[int, str], tuple[object, ...]]
    #: (round, state) -> the same signature, for the state line of the tracking file.
    state_signature: dict[tuple[int, str], tuple[object, ...]]
    sections_done: dict[str, float]
    section_attempts: dict[str, float]
    municipality_queue: asyncio.PriorityQueue[MunicipalityJob]
    section_queue: asyncio.PriorityQueue[SectionJob]
    pending_municipalities: set[tuple[int, str]]
    pending_sections: set[str]
    #: Municipalities and sections open in the dashboard (they get priority).
    watched: set[str]
    last_municipality_collection: dict[tuple[int, str], float]
    paused: bool
    jws_disabled: bool
    instance_id: str
    _counter: int

    def _next_order(self) -> int:
        """Increasing number that keeps equal-priority jobs in arrival order."""
        self._counter += 1
        return self._counter

    def _section_done(self, section_id: str) -> bool:
        """Whether the section was downloaded recently (always, in "all sections" mode)."""
        done = self.sections_done.get(section_id)
        return done is not None and (self.settings.modo_secoes == "todas" or time.monotonic() - done < 120)
