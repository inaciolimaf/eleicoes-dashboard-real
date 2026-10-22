"""`/health` at the root (outside `/api/v1`): answers fast with the state of the database and Redis."""

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import literal, select

from app.core.db import get_sessionmaker
from app.core.redis import get_redis

router = APIRouter()
_TIMEOUT_SECONDS = 2.0


class HealthDto(BaseModel):
    status: str  # "ok" | "degraded"
    database: str  # "up" | "down"
    redis: str  # "up" | "down"


async def _database_ok() -> bool:
    try:
        async with asyncio.timeout(_TIMEOUT_SECONDS), get_sessionmaker()() as session:
            await session.execute(select(literal(1)))
        return True
    except Exception:
        return False


async def _redis_ok() -> bool:
    try:
        async with asyncio.timeout(_TIMEOUT_SECONDS):
            return bool(await get_redis().ping())
    except Exception:
        return False


@router.get("/health", response_model=HealthDto, tags=["health"])
async def health() -> JSONResponse:
    database, cache = await asyncio.gather(_database_ok(), _redis_ok())
    body = HealthDto(
        status="ok" if database and cache else "degraded",
        database="up" if database else "down",
        redis="up" if cache else "down",
    )
    return JSONResponse(body.model_dump(), status_code=200 if body.status == "ok" else 503)
