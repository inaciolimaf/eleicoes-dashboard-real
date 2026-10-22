"""Public share links of a dashboard: `live` (current data) or `frozen` (data as of a given time)."""

import secrets
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import parse_time
from app.core.errors import AppError
from app.modules.accounts.dashboards.records import dashboard_dto, owned_dashboard
from app.modules.accounts.models import Dashboard, Share, User
from app.modules.accounts.schemas import ShareCreate, SharedDashboardDto, ShareDto


async def create_share(session: AsyncSession, user: User, dashboard_id: str, body: ShareCreate) -> ShareDto:
    dashboard = await owned_dashboard(session, user, dashboard_id)
    frozen_at = parse_time(body.frozen_time, "frozen_time") if body.mode == "frozen" else None
    if body.mode == "frozen" and frozen_at is None:
        raise AppError(
            422, "Parâmetro inválido", "modo congelado exige 'frozen_time'", "share/frozen_time_required"
        )
    token = secrets.token_urlsafe(16)
    session.add(
        Share(
            token=token,
            dashboard_id=dashboard.id,
            mode=body.mode,
            frozen_time=frozen_at,
            created_at=datetime.now(UTC),
        )
    )
    await session.flush()
    return ShareDto(token=token, url=f"/p/{token}")


async def get_shared(session: AsyncSession, token: str) -> SharedDashboardDto:
    share = await session.get(Share, token)
    if share is None:
        raise AppError(404, "Não encontrado", "link inválido", "share/not_found")
    dashboard = await session.get(Dashboard, share.dashboard_id)
    if dashboard is None:
        raise AppError(404, "Não encontrado", "painel removido", "dashboards/not_found")
    return SharedDashboardDto(
        dashboard=dashboard_dto(dashboard),
        mode=share.mode,
        frozen_time=share.frozen_time.isoformat() if share.frozen_time else None,
    )
