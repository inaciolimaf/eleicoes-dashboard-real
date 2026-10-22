"""On-demand collection: only the polling places and sections open in the dashboard or watched by an alert.

Requests come from the Redis demand list (`ballot_reports.demand`) and from "polling place tallied"
alerts. Ballot reports already in the database are not downloaded again.
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.collector.steps.sections import SectionSteps
from app.modules.alerts import evaluation as alerts
from app.modules.ballot_reports import BallotBoxReport
from app.modules.ballot_reports import demand as ballot_demand
from app.modules.geography import GeoAreaInvalid, PollingSection, parse

# (round, level, id) of a request
Request = tuple[int, str, str]


class DemandSteps(SectionSteps):
    async def on_demand_cycle(self) -> None:
        """Queues only the ballot reports of the places and sections opened in the dashboard or with a
        "polling place tallied" alert.

        A section still not tallied is tried again while someone is looking at it, with a minimum interval.
        """
        if not self.settings.collect_sections or self.settings.section_mode != "sob_demanda":
            return
        rounds = set(self.rounds())
        requests = await ballot_demand.pending(self.redis)
        sections, collected = await self._demanded_sections(rounds, requests)
        self._enqueue_demanded(sections, collected)

    async def _demanded_sections(
        self, rounds: set[int], requests: set[Request]
    ) -> tuple[dict[int, set[str]], set[tuple[int, str]]]:
        async with self.sessionmaker() as session:
            await _add_alert_requests(session, requests)
            sections, by_place = _group_requests(requests, rounds)
            if by_place:
                await _add_place_sections(session, by_place, sections)
            collected = await _collected_sections(session, sections)
        return sections, collected

    def _enqueue_demanded(self, sections: Mapping[int, set[str]], collected: set[tuple[int, str]]) -> None:
        interval = self.settings.interval_min_municipality / 3
        now = time.monotonic()
        for round_number, ids in sections.items():
            for section_id in ids:
                if self._demand_is_settled(round_number, section_id, collected, now, interval):
                    continue
                parsed = _parse_section_id(section_id)
                if parsed is None:
                    continue
                self.pending_sections.add(section_id)
                uf, municipality, zone, section = parsed
                self.section_queue.put_nowait(
                    (0, self._next_order(), round_number, uf, municipality, zone, section)
                )

    def _demand_is_settled(
        self, round_number: int, section_id: str, collected: set[tuple[int, str]], now: float, interval: float
    ) -> bool:
        """True when the section needs no download now: collected, queued, or tried too recently."""
        if (
            (round_number, section_id) in collected
            or self._section_done(section_id)
            or section_id in self.pending_sections
        ):
            return True
        return now - self.section_attempts.get(section_id, -1e9) < interval


async def _add_alert_requests(session: AsyncSession, requests: set[Request]) -> None:
    for alert in await alerts.active_alerts(session):
        params = alert.params or {}
        if alert.type == "polling_place_tallied" and params.get("polling_place_id"):
            requests.add((int(params.get("round", 1)), "polling_place", str(params["polling_place_id"])))


def _group_requests(
    requests: set[Request], rounds: set[int]
) -> tuple[defaultdict[int, set[str]], defaultdict[str, set[int]]]:
    """Splits the requests by kind: sections by round, and polling places with the rounds asked for."""
    sections: defaultdict[int, set[str]] = defaultdict(set)
    by_place: defaultdict[str, set[int]] = defaultdict(set)
    for round_number, level, rid in requests:
        if round_number not in rounds:
            continue
        if level == "section":
            sections[round_number].add(rid)
        elif level == "polling_place":
            by_place[rid].add(round_number)
    return sections, by_place


async def _add_place_sections(
    session: AsyncSession, by_place: Mapping[str, set[int]], sections: defaultdict[int, set[str]]
) -> None:
    """Adds the sections of each requested polling place to the sections asked for in each round."""
    rows = await session.execute(
        select(PollingSection.polling_place_id, PollingSection.id).where(
            PollingSection.polling_place_id.in_(by_place)
        )
    )
    for place_id, section_id in rows:
        if place_id is None:
            continue
        for round_number in by_place[place_id]:
            sections[round_number].add(section_id)


async def _collected_sections(
    session: AsyncSession, sections: Mapping[int, set[str]]
) -> set[tuple[int, str]]:
    """(round, section) pairs whose ballot report is already in the database."""
    collected: set[tuple[int, str]] = set()
    for round_number, ids in sections.items():
        if not ids:
            continue
        result = await session.execute(
            select(BallotBoxReport.polling_section_id).where(
                BallotBoxReport.round == round_number, BallotBoxReport.polling_section_id.in_(ids)
            )
        )
        collected.update(
            (round_number, section_id) for section_id in result.scalars() if section_id is not None
        )
    return collected


def _parse_section_id(section_id: str) -> tuple[str, int, int, int] | None:
    """(uf, municipality code, zone, section) of a section id, or None when it is not a section."""
    try:
        geo = parse(section_id)
    except GeoAreaInvalid:
        return None
    if (
        geo.level != "section"
        or geo.uf is None
        or geo.municipality is None
        or geo.zone is None
        or geo.section is None
    ):
        return None
    return geo.uf, geo.municipality, geo.zone, geo.section
