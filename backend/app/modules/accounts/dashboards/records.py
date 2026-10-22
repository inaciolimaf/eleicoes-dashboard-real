"""Painéis do usuário e os links de compartilhamento."""

import secrets
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_owned
from app.core.deps import parse_time
from app.core.errors import AppError
from app.modules.accounts.models import Dashboard, Share, User
from app.modules.accounts.schemas import (
    DashboardCreate,
    DashboardDto,
    DashboardUpdate,
    ShareCreate,
    SharedDashboardDto,
    ShareDto,
)


def dashboard_dto(p: Dashboard) -> DashboardDto:
    return DashboardDto(
        id=str(p.id),
        name=p.name,
        position=p.position,
        is_default=p.is_default,
        schema_version=p.schema_version,
        config=p.config,
        updated_at=p.updated_at.isoformat() if p.updated_at else None,
    )


async def _owned(session: AsyncSession, u: User, dashboard_id: str) -> Dashboard:
    return await get_owned(session, Dashboard, dashboard_id, u, what="painel")


async def list_dashboards(session: AsyncSession, u: User) -> list[DashboardDto]:
    rows = (
        await session.execute(
            select(Dashboard)
            .where(Dashboard.user_id == u.id)
            .order_by(Dashboard.position, Dashboard.created_at)
        )
    ).scalars()
    return [dashboard_dto(p) for p in rows]


async def _clear_default(session: AsyncSession, u: User) -> None:
    await session.execute(update(Dashboard).where(Dashboard.user_id == u.id).values(is_default=False))


async def create_dashboard(session: AsyncSession, u: User, dados: DashboardCreate) -> DashboardDto:
    ordem = dados.position
    if ordem is None:
        ordem = (
            await session.execute(
                select(func.count()).select_from(Dashboard).where(Dashboard.user_id == u.id)
            )
        ).scalar_one()
    if dados.is_default:
        await _clear_default(session, u)
    p = Dashboard(
        user_id=u.id,
        name=dados.name,
        config=dados.config,
        is_default=dados.is_default,
        position=ordem,
        schema_version=dados.schema_version,
    )
    session.add(p)
    await session.flush()
    await session.refresh(p)
    return dashboard_dto(p)


async def get_dashboard(session: AsyncSession, u: User, dashboard_id: str) -> DashboardDto:
    return dashboard_dto(await _owned(session, u, dashboard_id))


async def update_dashboard(
    session: AsyncSession, u: User, dashboard_id: str, dados: DashboardUpdate
) -> DashboardDto:
    p = await _owned(session, u, dashboard_id)
    if dados.is_default and not p.is_default:
        await _clear_default(session, u)
    p.name, p.config, p.is_default, p.schema_version = (
        dados.name,
        dados.config,
        dados.is_default,
        dados.schema_version,
    )
    if dados.position is not None:
        p.position = dados.position
    await session.flush()
    await session.refresh(p)
    return dashboard_dto(p)


async def delete_dashboard(session: AsyncSession, u: User, dashboard_id: str) -> None:
    p = await _owned(session, u, dashboard_id)
    await session.delete(p)


async def create_share(session: AsyncSession, u: User, dashboard_id: str, dados: ShareCreate) -> ShareDto:
    p = await _owned(session, u, dashboard_id)
    tempo = parse_time(dados.frozen_time, "frozen_time") if dados.mode == "frozen" else None
    if dados.mode == "frozen" and tempo is None:
        raise AppError(
            422, "Parâmetro inválido", "modo congelado exige 'frozen_time'", "share/frozen_time_required"
        )
    token = secrets.token_urlsafe(16)
    session.add(
        Share(
            token=token, dashboard_id=p.id, mode=dados.mode, frozen_time=tempo, created_at=datetime.now(UTC)
        )
    )
    await session.flush()
    return ShareDto(token=token, url=f"/p/{token}")


async def get_shared(session: AsyncSession, token: str) -> SharedDashboardDto:
    c = await session.get(Share, token)
    if c is None:
        raise AppError(404, "Não encontrado", "link inválido", "share/not_found")
    p = await session.get(Dashboard, c.dashboard_id)
    if p is None:
        raise AppError(404, "Não encontrado", "painel removido", "dashboards/not_found")
    return SharedDashboardDto(
        dashboard=dashboard_dto(p),
        mode=c.mode,
        frozen_time=c.frozen_time.isoformat() if c.frozen_time else None,
    )
