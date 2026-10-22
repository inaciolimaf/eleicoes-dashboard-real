"""System health for the admin panel: collector, worker, queue and the database row counts."""

from typing import Any

import orjson
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.redis import get_redis
from app.infra import queue
from app.modules.admin.schemas import AdminHealthDto, CollectorMetricsDto, DatabaseCountsDto
from app.modules.ballot_reports import BallotBoxReport
from app.modules.events import Event
from app.modules.geography import PollingPlace
from app.modules.results import ResultSnapshot


async def _count(session: AsyncSession, table: Any) -> int:
    return (await session.execute(select(func.count()).select_from(table))).scalar_one()


async def health_report(session: AsyncSession) -> AdminHealthDto:
    redis = get_redis()
    raw = await redis.get("collector:metrics")
    worker = {
        str(k.decode() if isinstance(k, bytes) else k): int(v)
        for k, v in (await redis.hgetall("worker:metrics")).items()
    }
    counts = DatabaseCountsDto(
        result_snapshots=await _count(session, ResultSnapshot),
        ballot_reports=await _count(session, BallotBoxReport),
        polling_places=await _count(session, PollingPlace),
        events=await _count(session, Event),
    )
    collector = CollectorMetricsDto(**orjson.loads(raw)) if raw else None
    return AdminHealthDto(
        collector=collector,
        worker=worker,
        queue=await queue.size(redis),
        database=counts,
        environment=get_settings().tse_environment,
    )
