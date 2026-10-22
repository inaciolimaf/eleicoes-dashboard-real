"""Alertas do usuário: consultas e gravação (o disparo é feito pelo worker, em `evaluation`)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_owned
from app.modules.accounts import User
from app.modules.alerts import evaluation
from app.modules.alerts.models import Alert
from app.modules.alerts.schemas import AlertCreate, AlertDto, AlertUpdate


def alert_dto(a: Alert) -> AlertDto:
    return AlertDto(
        id=str(a.id),
        type=a.type,
        params=a.params,
        active=a.active,
        triggered_at=a.triggered_at,
    )


async def list_alerts(session: AsyncSession, u: User) -> list[AlertDto]:
    rows = (
        await session.execute(select(Alert).where(Alert.user_id == u.id).order_by(Alert.created_at))
    ).scalars()
    return [alert_dto(a) for a in rows]


async def create_alert(session: AsyncSession, u: User, dados: AlertCreate) -> AlertDto:
    a = Alert(user_id=u.id, type=dados.type, params=dados.params, active=dados.active)
    session.add(a)
    await session.flush()
    await session.refresh(a)
    evaluation.invalidar_cache()
    return alert_dto(a)


async def update_alert(session: AsyncSession, u: User, alert_id: str, dados: AlertUpdate) -> AlertDto:
    a = await get_owned(session, Alert, alert_id, u, what="alerta")
    a.type, a.params, a.active, a.triggered_at = dados.type, dados.params, dados.active, None
    await session.flush()
    await session.refresh(a)
    evaluation.invalidar_cache()
    return alert_dto(a)


async def delete_alert(session: AsyncSession, u: User, alert_id: str) -> None:
    a = await get_owned(session, Alert, alert_id, u, what="alerta")
    await session.delete(a)
    await session.flush()
    evaluation.invalidar_cache()
