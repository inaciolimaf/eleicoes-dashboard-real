"""The user's alerts: list, create, replace and delete. The worker fires them (see `evaluation`)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_owned
from app.modules.accounts import User
from app.modules.alerts.evaluation import invalidate_cache
from app.modules.alerts.models import Alert
from app.modules.alerts.schemas import AlertCreate, AlertDto, AlertUpdate


def alert_dto(alert: Alert) -> AlertDto:
    return AlertDto(
        id=str(alert.id),
        type=alert.type,
        params=alert.params,
        active=alert.active,
        triggered_at=alert.triggered_at,
    )


async def list_alerts(session: AsyncSession, user: User) -> list[AlertDto]:
    rows = (
        await session.execute(select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at))
    ).scalars()
    return [alert_dto(alert) for alert in rows]


async def create_alert(session: AsyncSession, user: User, body: AlertCreate) -> AlertDto:
    alert = Alert(user_id=user.id, type=body.type, params=body.params, active=body.active)
    session.add(alert)
    await session.flush()
    await session.refresh(alert)
    invalidate_cache()
    return alert_dto(alert)


async def update_alert(session: AsyncSession, user: User, alert_id: str, body: AlertUpdate) -> AlertDto:
    alert = await get_owned(session, Alert, alert_id, user, what="alerta")
    # Replacing an alert re-arms it: the previous firing no longer applies.
    alert.type, alert.params, alert.active, alert.triggered_at = body.type, body.params, body.active, None
    await session.flush()
    await session.refresh(alert)
    invalidate_cache()
    return alert_dto(alert)


async def delete_alert(session: AsyncSession, user: User, alert_id: str) -> None:
    alert = await get_owned(session, Alert, alert_id, user, what="alerta")
    await session.delete(alert)
    await session.flush()
    invalidate_cache()
