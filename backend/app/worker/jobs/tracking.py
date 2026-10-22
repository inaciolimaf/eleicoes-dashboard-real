"""Tracking job (EA14/EA15): the progress of the tally, published when a country or state moved."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import orjson

from app.core.db import unit_of_work
from app.infra.realtime import topics
from app.infra.tse.parsers import parse_tracking
from app.modules.results import ingestion as ingestion
from app.modules.results import queries as results_queries
from app.worker.jobs.publishing import Outbox
from app.worker.jobs.shared import LEVEL_COUNTRY_STATE, parse_datetime

if TYPE_CHECKING:
    from app.worker.jobs import Processor


async def process(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    progress_report = parse_tracking(orjson.loads(body))
    round_ = int(context["round"])
    out = Outbox()
    async with unit_of_work(proc.sessionmaker) as session:
        changed = await ingestion.ingest_progress(
            session,
            round_,
            progress_report,
            context["state_code"],
            parse_datetime(context.get("captured_at")),
        )
        if any(m["level"] in LEVEL_COUNTRY_STATE for m in changed):
            payload = await results_queries.progress(session, round_, None)
            out.add(topics.progress(round_), "progress", payload)
    await out.publish(proc.redis)
