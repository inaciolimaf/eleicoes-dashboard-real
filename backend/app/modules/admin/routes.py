"""Admin routes: collector and worker health, and control of the fake TSE (HTTP only)."""

from fastapi import APIRouter

from app.core.deps import DbSession
from app.core.redis import get_redis
from app.modules.accounts import Admin
from app.modules.admin.fake_tse import control
from app.modules.admin.health import report
from app.modules.admin.schemas import (
    AdminHealthDto,
    CollectorPausedDto,
    FakeTseControlCreate,
    FakeTseStateDto,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/health", response_model=AdminHealthDto)
async def admin_health(session: DbSession, _: Admin) -> AdminHealthDto:
    return await report.health_report(session)


@router.post("/collector/pause", response_model=CollectorPausedDto)
async def pause_collector(_: Admin) -> CollectorPausedDto:
    await get_redis().set("collector:paused", "1")
    return CollectorPausedDto(paused=True)


@router.post("/collector/resume", response_model=CollectorPausedDto)
async def resume_collector(_: Admin) -> CollectorPausedDto:
    await get_redis().delete("collector:paused")
    return CollectorPausedDto(paused=False)


@router.get("/fake-tse", response_model=FakeTseStateDto)
async def fake_tse_state(_: Admin) -> FakeTseStateDto:
    return await control.fake_state()


@router.post("/fake-tse", response_model=FakeTseStateDto)
async def fake_tse_control(_: Admin, body: FakeTseControlCreate) -> FakeTseStateDto:
    return await control.fake_control(body)
