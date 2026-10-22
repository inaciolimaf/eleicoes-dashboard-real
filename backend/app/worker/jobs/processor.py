"""Runs one queue message through the job of its type; the caches are shared by the consumers.

The consumers of one process share this object, so the caches here are per process, not per job.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.infra import queue
from app.modules.elections import ElectionOffice
from app.modules.results import ingestion as ingestao
from app.worker.jobs import ballot_box, result, tracking

log = logging.getLogger(__name__)

NUMBERS_TTL_SECONDS = 60
BallotNumbers = dict[tuple[int, int], str]


class Processor:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], redis: Redis) -> None:
        self.sessionmaker = sessionmaker
        self.redis = redis
        self._offices: dict[tuple[int, int], tuple[str, int | None]] = {}
        self._numbers: dict[tuple[int, str], tuple[float, BallotNumbers]] = {}

    async def process(self, type_: str, body: bytes, context: dict[str, Any]) -> None:
        if type_ == queue.TYPE_RESULT:
            await result.process(self, body, context)
        elif type_ == queue.TYPE_TRACKING:
            await tracking.process(self, body, context)
        elif type_ == queue.TYPE_BALLOT:
            await ballot_box.process(self, body, context)
        else:
            log.warning("tipo de mensagem desconhecido: %s", type_)

    async def office_settings(
        self, session: AsyncSession, election_id: int, office_code: int
    ) -> tuple[str, int | None]:
        """Voting system and seats of an office; a missing office is a majoritarian single seat."""
        key = (election_id, office_code)
        if key not in self._offices:
            office = await session.get(
                ElectionOffice, {"election_id": election_id, "office_code": office_code}
            )
            self._offices[key] = (office.voting_system, office.seats) if office else ("majoritario", 1)
        return self._offices[key]

    async def ballot_numbers(self, session: AsyncSession, round_: int, state_code: str) -> BallotNumbers:
        key = (round_, state_code)
        hit = self._numbers.get(key)
        if hit is None or time.monotonic() - hit[0] > NUMBERS_TTL_SECONDS or not hit[1]:
            self._numbers[key] = (time.monotonic(), await ingestao.mapa_numeros(session, round_, state_code))
        return self._numbers[key][1]
