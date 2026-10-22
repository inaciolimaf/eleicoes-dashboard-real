"""Tracking file (EA15): progress by state and municipality, which tells what changed since the last poll."""

from __future__ import annotations

import asyncio
import time

import orjson

from app.collector.steps.base import STATES, now_iso
from app.collector.steps.catalog import CatalogSteps
from app.infra import queue
from app.infra.tse.parsers import AcompanhamentoTSE, parse_acompanhamento
from app.modules.elections import Election

MUNICIPALITY_ITEM_TYPES = ("mu", "mun", "municipio")


class TrackingSteps(CatalogSteps):
    async def tracking_cycle(self) -> None:
        assert self.urls is not None
        for round_number in self.rounds():
            if round_number > 1 and not await self.round_published(round_number):
                continue
            e = self.election_of_round(round_number)
            if e is None:
                continue
            await asyncio.gather(*(self._track_uf(round_number, e, uf) for uf in ["br", *STATES]))

    async def _track_uf(self, round_number: int, e: Election, uf: str) -> None:
        assert self.urls is not None
        _status, body, _ = await self.fetch_file(self.urls.acompanhamento(e.election_code, uf))
        if body is None:
            return
        await queue.enqueue(
            self.redis,
            queue.TYPE_TRACKING,
            body,
            high_priority=True,
            key=f"tracking:{round_number}:{uf}",
            round=round_number,
            state_code=uf,
            captured_at=now_iso(),
        )
        if uf == "br":
            return
        tracking = parse_acompanhamento(orjson.loads(body))
        if not self._track_items(round_number, uf, tracking):
            # TSE file without a breakdown by municipality: sweeps the state when it changes
            for municipality_id, m in self.municipalities.items():
                if m["uf"] == uf:
                    self.schedule_municipality(round_number, municipality_id)

    def _track_items(self, round_number: int, uf: str, tracking: AcompanhamentoTSE) -> bool:
        """Marks changed states and municipalities; True when the file lists municipalities."""
        has_municipalities = False
        for item in tracking.itens:
            signature = (item.secoes_totalizadas, item.totalizado_em)
            if item.tipo == "uf":
                key = (round_number, uf)
                if self.state_signature.get(key) != signature and item.secoes_totalizadas > 0:
                    self.state_signature[key] = signature
            elif item.tipo in MUNICIPALITY_ITEM_TYPES:
                has_municipalities = True
                municipality_id = item.codigo if item.codigo[:2].isalpha() else f"{uf}{int(item.codigo):05d}"
                if (
                    item.secoes_totalizadas > 0
                    and self.municipality_signature.get((round_number, municipality_id)) != signature
                ):
                    self.municipality_signature[(round_number, municipality_id)] = signature
                    self.schedule_municipality(round_number, municipality_id)
        return has_municipalities

    def schedule_municipality(self, round_number: int, municipality_id: str) -> None:
        """Queues the municipality; keeps a minimum interval between two collections of the same one."""
        if (round_number, municipality_id) in self.pending_municipalities:
            return
        self.pending_municipalities.add((round_number, municipality_id))
        priority = 0 if municipality_id in self.watched else 1
        interval = self.settings.intervalo_min_municipio / (3 if priority == 0 else 1)
        wait = interval - (
            time.monotonic() - self.last_municipality_collection.get((round_number, municipality_id), -1e9)
        )
        item = (priority, self._next_order(), round_number, municipality_id)
        if wait > 0:
            asyncio.get_running_loop().call_later(wait, self.municipality_queue.put_nowait, item)
        else:
            self.municipality_queue.put_nowait(item)
