"""The collector: finds the TSE files through the catalog, polls them with priority and queues them
for the worker. The work is split into the mixins of `app/collector/steps/`."""

from __future__ import annotations

import asyncio
import contextlib
import os
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import orjson
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.collector.fetcher import Fetcher
from app.collector.steps.base import SectionRef, log, now_iso
from app.collector.steps.demand import DemandSteps
from app.collector.steps.results import ResultSteps
from app.collector.steps.tracking import TrackingSteps
from app.core.config import Settings
from app.infra import queue
from app.infra.realtime import topics
from app.infra.tse.keys import chave_do_ambiente

__all__ = ["Collector"]


def _text(value: bytes | str | None) -> str:
    """Redis answers bytes; a missing key reads as the empty string."""
    if value is None:
        return ""
    return value.decode() if isinstance(value, bytes) else value


class Collector(ResultSteps, TrackingSteps, DemandSteps):
    """Runs the loops of the collector: catalog, primary results, tracking, on-demand sections and the
    consumers of the municipality and section queues. Only the leader instance runs them."""

    def __init__(
        self,
        settings: Settings,
        sessionmaker: async_sessionmaker[AsyncSession],
        redis: Redis,
        fetcher: Fetcher | None = None,
    ) -> None:
        self.settings = settings
        self.sessionmaker = sessionmaker
        self.redis = redis
        self.fetcher = fetcher or Fetcher(settings.tse_max_rps, settings.tse_concorrencia)
        self.signing_key = chave_do_ambiente(settings.tse_ambiente) if settings.tse_verificar_jws else None
        self.catalog = None
        self.urls = None
        self.elections = []
        self.municipalities = {}
        self.sections_by_municipality = {}
        self.states_with_sections = set()
        self.municipality_signature = {}
        self.state_signature = {}
        self.sections_done = {}
        self.section_attempts = {}
        self.municipality_queue = asyncio.PriorityQueue()
        self.section_queue = asyncio.PriorityQueue()
        self.pending_municipalities = set()
        self.pending_sections = set()
        self.watched = set()
        self.last_municipality_collection = {}
        self.paused = False
        self.jws_disabled = False
        self.instance_id = uuid.uuid4().hex[:8]
        self._counter = 0

    # ------------------------------------------------------------------ loops
    async def _loop(self, name: str, interval: float, step: Callable[[], Awaitable[object]]) -> None:
        while True:
            started = time.monotonic()
            if not self.paused and self.urls is not None:
                try:
                    await step()
                except Exception:
                    log.exception("falha no laço %s", name)
            await asyncio.sleep(max(0.5, interval - (time.monotonic() - started)))

    async def _queue_full(self) -> bool:
        """Brake: if the worker cannot keep up, stop downloading municipalities until the queue drains.

        Without it the Redis queue grows without limit (and can exhaust the memory). Nothing is lost: the
        file is not downloaded, so its ETag does not change and it is fetched again when the queue empties.
        """
        try:
            return await queue.low_priority_size(self.redis) > self.settings.fila_max
        except Exception:
            return False

    async def _consume_municipalities(self) -> None:
        while True:
            _, _, round_number, municipality_id = await self.municipality_queue.get()
            self.pending_municipalities.discard((round_number, municipality_id))
            while self.paused or (municipality_id not in self.watched and await self._queue_full()):
                await asyncio.sleep(2)
            try:
                await self.process_municipality(round_number, municipality_id)
            except Exception:
                log.exception("falha no município %s", municipality_id)

    async def _consume_sections(self) -> None:
        while True:
            priority, _, round_number, uf, municipality_code, zone, section = await self.section_queue.get()
            section_id = SectionRef(round_number, uf, municipality_code, zone, section).id
            self.pending_sections.discard(section_id)
            while self.paused:
                await asyncio.sleep(1)
            try:
                # priority 0 = section or place open in the dashboard: goes first at the TSE
                # and in the worker queue
                await self.process_section(
                    round_number, uf, municipality_code, zone, section, high_priority=priority == 0
                )
            except Exception:
                log.exception("falha na seção %s", section_id)

    async def _refresh_watched(self) -> None:
        while True:
            try:
                watched: set[str] = set()
                for topic in await topics.active(self.redis):
                    for part in topic.split(":"):
                        if len(part) >= 7 and part[:2].isalpha() and part[2:7].isdigit():
                            watched.add(part[:7])
                self.watched = watched
                self.paused = bool(await self.redis.get("collector:paused"))
            except Exception:
                log.exception("falha ao ler tópicos ativos")
            await asyncio.sleep(5)

    async def _publish_metrics(self) -> None:
        while True:
            payload = self._metrics_payload()
            with contextlib.suppress(Exception):
                await self.redis.set("collector:metrics", orjson.dumps(payload), ex=60)
                await self.redis.set("collector:last_collection", now_iso(), ex=3600)
            await asyncio.sleep(3)

    def _metrics_payload(self) -> dict[str, Any]:
        metrics = self.fetcher.metrics
        return {
            "requests_per_second": metrics.requests_per_second(),
            "status": {str(k): v for k, v in metrics.by_status.items()},
            "network_errors": metrics.network_errors,
            "jws_failures": metrics.jws_failures,
            "municipality_queue": self.municipality_queue.qsize(),
            "section_queue": self.section_queue.qsize(),
            "sections_collected": len(self.sections_done),
            "municipalities": len(self.municipalities),
            "section_mode": self.settings.modo_secoes,
            "watched": len(self.watched),
            "paused": self.paused,
            "environment": self.settings.tse_ambiente,
            "base_url": self.settings.tse_base_url,
            "max_rps": self.settings.tse_max_rps,
            "updated_at": now_iso(),
            "leader": self.instance_id,
        }

    async def _wait_for_leadership(self) -> None:
        while not await self.redis.set("collector:leader", self.instance_id, nx=True, ex=30):
            if _text(await self.redis.get("collector:leader")) == self.instance_id:
                break
            log.info("outro coletor é líder; aguardando")
            await asyncio.sleep(10)

    async def _renew_leadership(self) -> None:
        while True:
            await asyncio.sleep(10)
            await self.redis.set("collector:leader", self.instance_id, ex=30)

    async def run(self) -> None:
        await self._wait_for_leadership()
        while self.urls is None:
            try:
                await self.refresh_catalog()
            except Exception:
                log.exception("falha ao carregar catálogo")
            if self.urls is None:
                await asyncio.sleep(5)
        municipality_workers = int(os.getenv("COLETOR_WORKERS_MUNICIPIO", "8"))
        section_workers = int(os.getenv("COLETOR_WORKERS_SECAO", "16"))
        tasks = [
            self._renew_leadership(),
            self._publish_metrics(),
            self._refresh_watched(),
            self._loop("catalogo", self.settings.intervalo_catalogo, self.refresh_catalog),
            self._loop("principal", self.settings.intervalo_principal, self.primary_cycle),
            self._loop("acompanhamento", self.settings.intervalo_acompanhamento, self.tracking_cycle),
            self._loop("sob_demanda", 3, self.on_demand_cycle),
            *(self._consume_municipalities() for _ in range(municipality_workers)),
            *(self._consume_sections() for _ in range(section_workers)),
        ]
        await asyncio.gather(*tasks)
