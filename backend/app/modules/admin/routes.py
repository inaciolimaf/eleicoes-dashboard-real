"""Administração: saúde do coletor/worker e controle do mock do TSE (só HTTP)."""

from fastapi import APIRouter

from app.core.deps import DbSession
from app.core.redis import get_redis
from app.modules.accounts import AdminDep
from app.modules.admin import fake, health
from app.modules.admin.schemas import (
    AdminHealthDto,
    CollectorPausedDto,
    FakeTseControlCreate,
    FakeTseStateDto,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/health", response_model=AdminHealthDto)
async def admin_health(session: DbSession, _: AdminDep) -> AdminHealthDto:
    return await health.admin_health(session)


@router.post("/collector/pause", response_model=CollectorPausedDto)
async def pause_collector(_: AdminDep) -> CollectorPausedDto:
    await get_redis().set("collector:paused", "1")
    return CollectorPausedDto(paused=True)


@router.post("/collector/resume", response_model=CollectorPausedDto)
async def resume_collector(_: AdminDep) -> CollectorPausedDto:
    await get_redis().delete("collector:paused")
    return CollectorPausedDto(paused=False)


@router.get("/fake-tse", response_model=FakeTseStateDto)
async def fake_tse_state(_: AdminDep) -> FakeTseStateDto:
    return await fake.fake_state()


@router.post("/fake-tse", response_model=FakeTseStateDto)
async def fake_tse_control(_: AdminDep, dados: FakeTseControlCreate) -> FakeTseStateDto:
    return await fake.fake_control(dados)
