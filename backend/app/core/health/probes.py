"""`/health` na raiz (fora de `/api/v1`): responde rápido com o estado do banco e do Redis."""

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import literal, select

from app.core.db import get_sessionmaker
from app.core.redis import get_redis

router = APIRouter()
_LIMITE_SEGUNDOS = 2.0


class HealthDto(BaseModel):
    status: str  # "ok" | "degraded"
    database: str  # "up" | "down"
    redis: str  # "up" | "down"


async def _banco() -> bool:
    try:
        async with asyncio.timeout(_LIMITE_SEGUNDOS), get_sessionmaker()() as session:
            await session.execute(select(literal(1)))
        return True
    except Exception:
        return False


async def _redis() -> bool:
    try:
        async with asyncio.timeout(_LIMITE_SEGUNDOS):
            return bool(await get_redis().ping())
    except Exception:
        return False


@router.get("/health", response_model=HealthDto, tags=["health"])
async def health() -> JSONResponse:
    banco, cache = await asyncio.gather(_banco(), _redis())
    corpo = HealthDto(
        status="ok" if banco and cache else "degraded",
        database="up" if banco else "down",
        redis="up" if cache else "down",
    )
    return JSONResponse(corpo.model_dump(), status_code=200 if corpo.status == "ok" else 503)
