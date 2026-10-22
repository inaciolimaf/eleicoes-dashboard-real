"""Ballot box report job: stores one BU, then publishes the places it changed and the alerts they fire.

The worker writes a diagnostic per section, read by the diagnostics route; see `diagnostics.py`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.db import unit_of_work
from app.infra.realtime import topics
from app.infra.tse import bu as bu_mod
from app.modules.alerts import evaluation as alertas
from app.modules.geography import parse
from app.modules.results import ingestion as ingestao
from app.modules.results import queries as resultados
from app.worker.jobs import diagnostics
from app.worker.jobs.publishing import Outbox
from app.worker.jobs.shared import BallotIds, ballot_ids, parse_datetime

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.worker.jobs import Processor


async def process(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    section_id = context.get("polling_section_id")
    try:
        await _ballot(proc, body, context)
    except Exception as exc:
        if section_id:
            await diagnostics.record_worker(proc.redis, section_id, {"error": f"{type(exc).__name__}: {exc}"})
        raise


async def _ballot(proc: Processor, body: bytes, context: dict[str, Any]) -> None:
    round_ = int(context["round"])
    state_code = context["state_code"]
    report = bu_mod.decodificar(body)
    out = Outbox()
    async with unit_of_work(proc.sessionmaker) as session:
        numbers = await proc.ballot_numbers(session, round_, state_code)
        changed = await ingestao.ingerir_boletim(
            session,
            round_,
            state_code,
            report,
            ingestao.BoletimContexto(
                hash=str(context["hash"]),
                status=str(context.get("status", "Totalizado")),
                totalizado_em=parse_datetime(context.get("tallied_at")),
                url=context.get("url"),
                numeros=numbers,
            ),
        )
        if context.get("polling_section_id"):
            outcome = diagnostics.ballot_outcome(state_code, report, changed)
            await diagnostics.record_worker(proc.redis, context["polling_section_id"], outcome)
        await _publish_ballot(session, proc, out, round_, ballot_ids(state_code, report), changed)
    await out.publish(proc.redis)


async def _publish_ballot(
    session: AsyncSession,
    proc: Processor,
    out: Outbox,
    round_: int,
    ids: BallotIds,
    changed: list[tuple[int, str]],
) -> None:
    for office_code, place_id in changed:
        await _publish_changed_place(session, proc, out, round_, ids, office_code, place_id)
    if changed:
        await _alerts_polling_place(session, out, round_, changed[0][0], changed[0][1])


async def _publish_changed_place(
    session: AsyncSession,
    proc: Processor,
    out: Outbox,
    round_: int,
    ids: BallotIds,
    office_code: int,
    place_id: str,
) -> None:
    places_topic = topics.polling_places(round_, office_code, ids.municipality)
    if await topics.is_active(proc.redis, places_topic):
        item = await resultados.item_local(session, round_, office_code, place_id)
        if item:
            out.add(places_topic, "polling_place", item)
    for level, geo_id in (("polling_place", place_id), ("section", ids.section), ("zone", ids.zone)):
        results_topic = topics.results(round_, office_code, level, geo_id)
        if await topics.is_active(proc.redis, results_topic):
            payload = await resultados.montar_resultado(session, round_, office_code, parse(geo_id))
            out.add(results_topic, "results", payload)
    children_topic = topics.children(round_, office_code, "zone", ids.zone)
    if await topics.is_active(proc.redis, children_topic):
        data = await resultados.filhos(session, round_, office_code, parse(ids.zone), None)
        for item in data["items"]:
            if item["id"] == place_id:
                out.add(children_topic, "children", item)


async def _alerts_polling_place(
    session: AsyncSession, out: Outbox, round_: int, office_code: int, place_id: str
) -> None:
    item = await resultados.item_local(session, round_, office_code, place_id)
    item_status = item["status"] if item else ""
    for alert in await alertas.ativos(session):
        text = alertas.avaliar_local(alert, place_id, item_status)
        if text:
            await alertas.marcar_disparado(session, alert)
            out.add_alert(alert, text)
