"""Saúde do sistema para o painel admin: coletor, worker, fila e contagens do banco."""

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


async def _contar(session: AsyncSession, tabela: type) -> int:
    return (await session.execute(select(func.count()).select_from(tabela))).scalar_one()


async def admin_health(session: AsyncSession) -> AdminHealthDto:
    redis = get_redis()
    bruto = await redis.get("collector:metrics")
    worker = {
        str(k.decode() if isinstance(k, bytes) else k): int(v)
        for k, v in (await redis.hgetall("worker:metrics")).items()
    }
    contagens = DatabaseCountsDto(
        result_snapshots=await _contar(session, ResultSnapshot),
        ballot_reports=await _contar(session, BallotBoxReport),
        polling_places=await _contar(session, PollingPlace),
        events=await _contar(session, Event),
    )
    coletor = CollectorMetricsDto(**orjson.loads(bruto)) if bruto else None
    return AdminHealthDto(
        collector=coletor,
        worker=worker,
        queue=await queue.size(redis),
        database=contagens,
        environment=get_settings().tse_ambiente,
    )
