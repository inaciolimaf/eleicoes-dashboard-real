"""Rotas de conta: autenticação, painéis, compartilhamento, favoritos e preferências (só HTTP)."""

from fastapi import APIRouter, Response

from app.core.deps import DbSession
from app.modules.accounts import auth, dashboards, favorites, preferences
from app.modules.accounts.deps import UsuarioDep
from app.modules.accounts.schemas import (
    DashboardCreate,
    DashboardDto,
    DashboardUpdate,
    FavoriteCreate,
    FavoriteDto,
    LoginCreate,
    PreferencesDto,
    PreferencesUpdate,
    RegisterCreate,
    ShareCreate,
    SharedDashboardDto,
    ShareDto,
    TokenDto,
    UserDto,
)

router = APIRouter()


@router.post("/auth/register", status_code=201, response_model=TokenDto, tags=["auth"])
async def register(session: DbSession, dados: RegisterCreate) -> TokenDto:
    return auth.token_dto(await auth.register(session, dados))


@router.post("/auth/login", response_model=TokenDto, tags=["auth"])
async def login(session: DbSession, dados: LoginCreate) -> TokenDto:
    return auth.token_dto(await auth.authenticate(session, dados))


@router.get("/auth/me", response_model=UserDto, tags=["auth"])
async def me(u: UsuarioDep) -> UserDto:
    return auth.user_dto(u)


@router.get("/dashboards", response_model=list[DashboardDto], tags=["dashboards"])
async def list_dashboards(session: DbSession, u: UsuarioDep) -> list[DashboardDto]:
    return await dashboards.list_dashboards(session, u)


@router.post("/dashboards", status_code=201, response_model=DashboardDto, tags=["dashboards"])
async def create_dashboard(session: DbSession, u: UsuarioDep, dados: DashboardCreate) -> DashboardDto:
    return await dashboards.create_dashboard(session, u, dados)


@router.get("/dashboards/{dashboard_id}", response_model=DashboardDto, tags=["dashboards"])
async def get_dashboard(session: DbSession, u: UsuarioDep, dashboard_id: str) -> DashboardDto:
    return await dashboards.get_dashboard(session, u, dashboard_id)


@router.put("/dashboards/{dashboard_id}", response_model=DashboardDto, tags=["dashboards"])
async def update_dashboard(
    session: DbSession, u: UsuarioDep, dashboard_id: str, dados: DashboardUpdate
) -> DashboardDto:
    return await dashboards.update_dashboard(session, u, dashboard_id, dados)


@router.delete("/dashboards/{dashboard_id}", status_code=204, tags=["dashboards"])
async def delete_dashboard(session: DbSession, u: UsuarioDep, dashboard_id: str) -> Response:
    await dashboards.delete_dashboard(session, u, dashboard_id)
    return Response(status_code=204)


@router.post("/dashboards/{dashboard_id}/shares", response_model=ShareDto, tags=["dashboards"])
async def create_share(session: DbSession, u: UsuarioDep, dashboard_id: str, dados: ShareCreate) -> ShareDto:
    return await dashboards.create_share(session, u, dashboard_id, dados)


@router.get("/shared/{token}", response_model=SharedDashboardDto, tags=["dashboards"])
async def get_shared(session: DbSession, token: str) -> SharedDashboardDto:
    return await dashboards.get_shared(session, token)


@router.get("/favorites", response_model=list[FavoriteDto], tags=["favorites"])
async def list_favorites(session: DbSession, u: UsuarioDep) -> list[FavoriteDto]:
    return await favorites.list_favorites(session, u)


@router.post("/favorites", status_code=201, response_model=FavoriteDto, tags=["favorites"])
async def add_favorite(session: DbSession, u: UsuarioDep, dados: FavoriteCreate) -> FavoriteDto:
    return await favorites.add_favorite(session, u, dados)


@router.delete("/favorites/{type}/{ref}", status_code=204, tags=["favorites"])
async def remove_favorite(session: DbSession, u: UsuarioDep, type: str, ref: str) -> Response:  # noqa: A002
    await favorites.remove_favorite(session, u, type, ref)
    return Response(status_code=204)


@router.get("/preferences", response_model=PreferencesDto, tags=["preferences"])
async def get_preferences(session: DbSession, u: UsuarioDep) -> PreferencesDto:
    return await preferences.get_preferences(session, u)


@router.put("/preferences", response_model=PreferencesDto, tags=["preferences"])
async def save_preferences(session: DbSession, u: UsuarioDep, dados: PreferencesUpdate) -> PreferencesDto:
    return await preferences.save_preferences(session, u, dados)
