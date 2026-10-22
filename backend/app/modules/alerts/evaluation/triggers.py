"""Marks an alert as fired, so it does not fire again until the user changes it."""

from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.alerts.evaluation.cache import invalidate_cache
from app.modules.alerts.models import Alert


async def mark_triggered(session: AsyncSession, alert: Alert) -> None:
    await session.execute(update(Alert).where(Alert.id == alert.id).values(triggered_at=datetime.now(UTC)))
    invalidate_cache()
