"""Account routes: authentication, dashboards, sharing, favorites and preferences (HTTP only)."""

from fastapi import APIRouter, Request, Response

from app.core.deps import DbSession
from app.modules.accounts.auth import credentials, tokens
from app.modules.accounts.dashboards import records as dashboards
from app.modules.accounts.dashboards import shares
from app.modules.accounts.deps import CurrentUser
from app.modules.accounts.favorites import records as favorites
from app.modules.accounts.preferences import records as preferences
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
async def register(session: DbSession, body: RegisterCreate) -> TokenDto:
    return tokens.token_dto(await credentials.register(session, body))


@router.post("/auth/login", response_model=TokenDto, tags=["auth"])
async def login(session: DbSession, body: LoginCreate, request: Request) -> TokenDto:
    ip = request.client.host if request.client else "unknown"
    return tokens.token_dto(await credentials.authenticate(session, body, ip))


@router.get("/auth/me", response_model=UserDto, tags=["auth"])
async def me(user: CurrentUser) -> UserDto:
    return tokens.user_dto(user)


@router.get("/dashboards", response_model=list[DashboardDto], tags=["dashboards"])
async def list_dashboards(session: DbSession, user: CurrentUser) -> list[DashboardDto]:
    return await dashboards.list_dashboards(session, user)


@router.post("/dashboards", status_code=201, response_model=DashboardDto, tags=["dashboards"])
async def create_dashboard(session: DbSession, user: CurrentUser, body: DashboardCreate) -> DashboardDto:
    return await dashboards.create_dashboard(session, user, body)


@router.get("/dashboards/{dashboard_id}", response_model=DashboardDto, tags=["dashboards"])
async def get_dashboard(session: DbSession, user: CurrentUser, dashboard_id: str) -> DashboardDto:
    return await dashboards.get_dashboard(session, user, dashboard_id)


@router.put("/dashboards/{dashboard_id}", response_model=DashboardDto, tags=["dashboards"])
async def update_dashboard(
    session: DbSession, user: CurrentUser, dashboard_id: str, body: DashboardUpdate
) -> DashboardDto:
    return await dashboards.update_dashboard(session, user, dashboard_id, body)


@router.delete("/dashboards/{dashboard_id}", status_code=204, tags=["dashboards"])
async def delete_dashboard(session: DbSession, user: CurrentUser, dashboard_id: str) -> Response:
    await dashboards.delete_dashboard(session, user, dashboard_id)
    return Response(status_code=204)


@router.post("/dashboards/{dashboard_id}/shares", response_model=ShareDto, tags=["dashboards"])
async def create_share(
    session: DbSession, user: CurrentUser, dashboard_id: str, body: ShareCreate
) -> ShareDto:
    return await shares.create_share(session, user, dashboard_id, body)


@router.get("/shared/{token}", response_model=SharedDashboardDto, tags=["dashboards"])
async def get_shared(session: DbSession, token: str) -> SharedDashboardDto:
    return await shares.get_shared(session, token)


@router.get("/favorites", response_model=list[FavoriteDto], tags=["favorites"])
async def list_favorites(session: DbSession, user: CurrentUser) -> list[FavoriteDto]:
    return await favorites.list_favorites(session, user)


@router.post("/favorites", status_code=201, response_model=FavoriteDto, tags=["favorites"])
async def add_favorite(session: DbSession, user: CurrentUser, body: FavoriteCreate) -> FavoriteDto:
    return await favorites.add_favorite(session, user, body)


@router.delete("/favorites/{type}/{ref}", status_code=204, tags=["favorites"])
async def remove_favorite(session: DbSession, user: CurrentUser, type: str, ref: str) -> Response:  # noqa: A002
    await favorites.remove_favorite(session, user, type, ref)
    return Response(status_code=204)


@router.get("/preferences", response_model=PreferencesDto, tags=["preferences"])
async def get_preferences(session: DbSession, user: CurrentUser) -> PreferencesDto:
    return await preferences.get_preferences(session, user)


@router.put("/preferences", response_model=PreferencesDto, tags=["preferences"])
async def save_preferences(session: DbSession, user: CurrentUser, body: PreferencesUpdate) -> PreferencesDto:
    return await preferences.save_preferences(session, user, body)
