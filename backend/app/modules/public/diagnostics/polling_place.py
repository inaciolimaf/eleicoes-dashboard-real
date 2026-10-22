"""Why the sections of a polling place do not show: what the collector and the worker did with each one."""

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.modules.ballot_reports import BallotBoxReport, demand
from app.modules.geography import Municipality, PollingPlace, PollingSection
from app.modules.public.polling_places.dtos import PollingPlaceDiagnosticsDto, SectionDiagnosticDto
from app.modules.public.status.metrics import read_json, read_metrics

COLLECTOR_DIAGNOSTIC_FIELDS = ("section_mode", "section_queue", "sections_collected", "updated_at", "paused")


async def polling_place_diagnostics(
    session: AsyncSession, round_number: int, polling_place_id: str
) -> PollingPlaceDiagnosticsDto:
    """Explains why the sections of a polling place do not show.

    Only reads the database and Redis (no request to the TSE). Open the polling place page first, so the
    collector receives the request, and wait about 30 s.
    """
    lid = polling_place_id.strip().lower()
    redis = get_redis()
    place = await session.get(PollingPlace, lid)
    sections = (
        (await session.execute(select(PollingSection).where(PollingSection.polling_place_id == lid)))
        .scalars()
        .all()
    )
    reported = await _reported_section_ids(session, round_number, lid)
    requests = await demand.pending(redis)
    return PollingPlaceDiagnosticsDto(
        polling_place_id=lid,
        polling_place_in_db=place is not None,
        municipality_in_db=bool(place and await session.get(Municipality, place.municipality_id)),
        request_registered=(round_number, "polling_place", lid) in requests,
        collector=await _collector_diagnostic(redis),
        sections=[
            await _section_diagnostic(redis, section.id, section.id in reported) for section in sections
        ],
    )


async def _reported_section_ids(session: AsyncSession, round_number: int, lid: str) -> set[str]:
    """Sections of the polling place whose ballot box report is already in the database."""
    rows = await session.execute(
        select(BallotBoxReport.polling_section_id).where(
            BallotBoxReport.round == round_number, BallotBoxReport.polling_place_id == lid
        )
    )
    return set(rows.scalars())


async def _collector_diagnostic(redis: Redis) -> dict[str, object]:
    metrics = await read_metrics(redis)
    return {k: metrics.get(k) for k in COLLECTOR_DIAGNOSTIC_FIELDS}


async def _section_diagnostic(redis: Redis, section_id: str, in_db: bool) -> SectionDiagnosticDto:
    return SectionDiagnosticDto(
        id=section_id,
        ballot_in_db=in_db,
        collector=await read_json(redis, f"diag:section:{section_id}"),
        worker=await read_json(redis, f"diag:section:{section_id}:worker"),
    )
