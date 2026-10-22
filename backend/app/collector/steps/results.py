"""Results files: national, state and municipality totals (the primary feed), sent to the worker."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable

from app.collector.steps.base import STATES, now_iso
from app.collector.steps.sections import SectionSteps
from app.infra import queue
from app.modules.elections import Election


def offices_of_state(offices: list[int], state_code: str) -> list[int]:
    """Drops the offices a state does not elect: the Senate (7) is not elected in the DF, and the
    district deputies (8) exist only in the DF."""
    out = []
    for office_code in offices:
        if office_code == 8 and state_code != "df":
            continue
        if office_code == 7 and state_code == "df":
            continue
        out.append(office_code)
    return out


def geo_area_of(state_code: str, municipality: int | None, zone: int | None) -> tuple[str, str, str]:
    """(level, geo area id, parent id) of the result file requested for this place."""
    if state_code == "br":
        return "country", "br", ""
    if municipality is None:
        return "state", state_code, "br"
    if zone is None:
        return "municipality", f"{state_code}{municipality:05d}", state_code
    return "zone", f"{state_code}{municipality:05d}-z{zone:04d}", f"{state_code}{municipality:05d}"


class ResultSteps(SectionSteps):
    async def fetch_result(
        self,
        round_number: int,
        e: Election,
        office_code: int,
        state_code: str,
        municipality: int | None = None,
        zone: int | None = None,
    ) -> None:
        assert self.urls is not None
        url = self.urls.result(e.election_code, office_code, state_code, municipality, zone)
        # Brazil/UF totals and municipalities open in the dashboard go first (TSE request limit and queue)
        high_priority = municipality is None or f"{state_code}{municipality:05d}" in self.watched
        status, body, jws_ok = await self.fetch_file(url, high_priority=high_priority)
        if status != 200 or body is None:
            return
        level, geo_area_id, parent_id = geo_area_of(state_code, municipality, zone)
        await queue.enqueue(
            self.redis,
            queue.TYPE_RESULT,
            body,
            high_priority=high_priority,
            key=url,
            round=round_number,
            election_id=e.id,
            office_code=office_code,
            level=level,
            geo_area_id=geo_area_id,
            parent_id=parent_id,
            state_code=state_code,
            file=url,
            jws_verified=jws_ok,
            captured_at=now_iso(),
        )

    async def primary_cycle(self) -> None:
        tasks: list[Awaitable[None]] = []
        for round_number in self.rounds():
            if round_number > 1 and not await self.round_published(round_number):
                continue
            for e in [x for x in self.elections if x.round == round_number]:
                tasks.extend(self._primary_tasks(round_number, e))
        await asyncio.gather(*tasks)

    def _primary_tasks(self, round_number: int, e: Election) -> list[Awaitable[None]]:
        cds = [c.office_code for c in e.offices]
        tasks: list[Awaitable[None]] = []
        if 1 in cds:
            tasks.append(self.fetch_result(round_number, e, 1, "br"))
            tasks.extend(self.fetch_result(round_number, e, 1, state_code) for state_code in [*STATES, "zz"])
        for state_code in STATES:
            tasks.extend(
                self.fetch_result(round_number, e, office_code, state_code)
                for office_code in offices_of_state([c for c in cds if c != 1], state_code)
            )
        return tasks

    async def process_municipality(self, round_number: int, municipality_id: str) -> None:
        self.last_municipality_collection[(round_number, municipality_id)] = time.monotonic()
        m = self.municipalities.get(municipality_id)
        if m is None:
            return
        state_code, municipality_code = m["state_code"], m["code"]
        tasks: list[Awaitable[None]] = []
        for e in [x for x in self.elections if x.round == round_number]:
            for office_code in offices_of_state([c.office_code for c in e.offices], state_code):
                tasks.append(self.fetch_result(round_number, e, office_code, state_code, municipality_code))
                if self.settings.collect_zones and len(m["zones"]) > 1:
                    tasks.extend(
                        self.fetch_result(round_number, e, office_code, state_code, municipality_code, z)
                        for z in m["zones"]
                    )
        await asyncio.gather(*tasks)
        if self.settings.collect_sections and self.settings.section_mode == "todas":
            await self.load_sections_of_state(state_code)
            self.schedule_municipality_sections(round_number, state_code, municipality_code, municipality_id)
