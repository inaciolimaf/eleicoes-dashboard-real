"""The user's dashboards (painéis): list, create, read, replace and delete."""

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_owned
from app.modules.accounts.models import Dashboard, User
from app.modules.accounts.schemas import DashboardCreate, DashboardDto, DashboardUpdate


def dashboard_dto(dashboard: Dashboard) -> DashboardDto:
    return DashboardDto(
        id=str(dashboard.id),
        name=dashboard.name,
        position=dashboard.position,
        is_default=dashboard.is_default,
        schema_version=dashboard.schema_version,
        config=dashboard.config,
        updated_at=dashboard.updated_at.isoformat() if dashboard.updated_at else None,
    )


async def owned_dashboard(session: AsyncSession, user: User, dashboard_id: str) -> Dashboard:
    return await get_owned(session, Dashboard, dashboard_id, user, what="painel")


async def list_dashboards(session: AsyncSession, user: User) -> list[DashboardDto]:
    rows = (
        await session.execute(
            select(Dashboard)
            .where(Dashboard.user_id == user.id)
            .order_by(Dashboard.position, Dashboard.created_at)
        )
    ).scalars()
    return [dashboard_dto(dashboard) for dashboard in rows]


async def _clear_default(session: AsyncSession, user: User) -> None:
    await session.execute(update(Dashboard).where(Dashboard.user_id == user.id).values(is_default=False))


async def create_dashboard(session: AsyncSession, user: User, body: DashboardCreate) -> DashboardDto:
    position = body.position
    if position is None:
        position = (
            await session.execute(
                select(func.count()).select_from(Dashboard).where(Dashboard.user_id == user.id)
            )
        ).scalar_one()
    if body.is_default:
        await _clear_default(session, user)
    dashboard = Dashboard(
        user_id=user.id,
        name=body.name,
        config=body.config,
        is_default=body.is_default,
        position=position,
        schema_version=body.schema_version,
    )
    session.add(dashboard)
    await session.flush()
    await session.refresh(dashboard)
    return dashboard_dto(dashboard)


async def get_dashboard(session: AsyncSession, user: User, dashboard_id: str) -> DashboardDto:
    return dashboard_dto(await owned_dashboard(session, user, dashboard_id))


async def update_dashboard(
    session: AsyncSession, user: User, dashboard_id: str, body: DashboardUpdate
) -> DashboardDto:
    dashboard = await owned_dashboard(session, user, dashboard_id)
    if body.is_default and not dashboard.is_default:
        await _clear_default(session, user)
    dashboard.name, dashboard.config, dashboard.is_default, dashboard.schema_version = (
        body.name,
        body.config,
        body.is_default,
        body.schema_version,
    )
    if body.position is not None:
        dashboard.position = body.position
    await session.flush()
    await session.refresh(dashboard)
    return dashboard_dto(dashboard)


async def delete_dashboard(session: AsyncSession, user: User, dashboard_id: str) -> None:
    dashboard = await owned_dashboard(session, user, dashboard_id)
    await session.delete(dashboard)
