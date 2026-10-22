"""Short-lived cache of the alerts that can still fire, so each tally does not reread the table."""

import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.alerts.models import Alert

#: Seconds a cached list is trusted. Changes to alerts clear the cache at once (`invalidate_cache`).
_TTL_SECONDS = 10

_cache: tuple[float, list[Alert]] = (0.0, [])


async def active_alerts(session: AsyncSession) -> list[Alert]:
    """Enabled alerts that have not fired yet."""
    global _cache
    if time.monotonic() - _cache[0] > _TTL_SECONDS:
        rows = (
            (await session.execute(select(Alert).where(Alert.active.is_(True), Alert.triggered_at.is_(None))))
            .scalars()
            .all()
        )
        _cache = (time.monotonic(), list(rows))
    return _cache[1]


def invalidate_cache() -> None:
    global _cache
    _cache = (0.0, [])
