"""Tracking job (EA14/EA15): the progress of the tally, published when a country or state moved."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import orjson

from app.core.db import unit_of_work
from app.infra.realtime import topics
from app.infra.tse.parsers import parse_acompanhamento
from app.modules.results import ingestion as ingestao
from app.modules.results import queries as resultados
from app.worker.jobs.publishing import Outbox
from app.worker.jobs.shared import LEVEL_COUNTRY_STATE, parse_datetime

if TYPE_CHECKING:
    from app.worker.jobs import Processor


async def process(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    progress_report = parse_acompanhamento(orjson.loads(body))
    round_ = int(context["round"])
    out = Outbox()
    async with unit_of_work(proc.sessionmaker) as session:
        changed = await ingestao.ingerir_progresso(
            session,
            round_,
            progress_report,
            context["state_code"],
            parse_datetime(context.get("captured_at")),
        )
        if any(m["level"] in LEVEL_COUNTRY_STATE for m in changed):
            payload = await resultados.progresso(session, round_, None)
            out.add(topics.progress(round_), "progress", payload)
    await out.publish(proc.redis)
