"""The public status: is the collector live, when the last tally and collection happened."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.redis import get_redis
from app.modules.elections import Election
from app.modules.public.schemas import CollectorStatusDto, StatusDto
from app.modules.public.status.metrics import read_metrics
from app.modules.results import queries as results


async def current_status(session: AsyncSession) -> StatusDto:
    settings = get_settings()
    redis = get_redis()
    metrics = await read_metrics(redis)
    raw_last_collection = await redis.get("collector:last_collection")
    last_tally = await results.last_tally(session)
    elections = await results.list_elections(session)
    live = bool(metrics) and not metrics.get("paused")
    return StatusDto(
        tse_environment=settings.tse_environment,
        live=live,
        now=datetime.now().astimezone().isoformat(),
        last_tally=results.iso(last_tally),
        last_collection=(
            raw_last_collection.decode() if isinstance(raw_last_collection, bytes) else raw_last_collection
        ),
        release_start=await _release_start(session, elections),
        pct_sections_br=await results.pct_country(session),
        collector=CollectorStatusDto(
            paused=bool(metrics.get("paused")), requests_per_second=metrics.get("requests_per_second", 0.0)
        ),
    )


async def _release_start(session: AsyncSession, elections: list[dict[str, object]]) -> str | None:
    """Start of the release: 20:00 (Brasília) on the day of the first election, as ISO 8601."""
    if not elections:
        return None
    election = await session.get(Election, elections[0]["id"])
    if election is None or not election.date:
        return None
    day, month, year = election.date.split("/")
    return f"{year}-{month}-{day}T20:00:00+00:00"
