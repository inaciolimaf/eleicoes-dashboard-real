"""Administração: saúde do coletor/worker e controle do mock do TSE."""

from typing import Any

import httpx
import orjson
from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.deps import AdminDep, SessaoDep
from app.core.config import get_settings
from app.core.redis import get_redis
from app.models import Boletim, Evento, LocalVotacao, Snapshot
from app.worker import fila

router = APIRouter(prefix="/admin")


@router.get("/saude")
async def saude(session: SessaoDep, _: AdminDep) -> dict:
    redis = get_redis()
    m = await redis.get("coletor:metricas")
    worker = {k.decode(): int(v) for k, v in (await redis.hgetall("worker:metricas")).items()}
    contagens = {
        "snapshots": (await session.execute(select(func.count()).select_from(Snapshot))).scalar_one(),
        "boletins": (await session.execute(select(func.count()).select_from(Boletim))).scalar_one(),
        "locais": (await session.execute(select(func.count()).select_from(LocalVotacao))).scalar_one(),
        "eventos": (await session.execute(select(func.count()).select_from(Evento))).scalar_one(),
    }
    return {"coletor": orjson.loads(m) if m else None, "worker": worker, "fila": await fila.tamanho(redis),
            "banco": contagens, "ambiente": get_settings().tse_ambiente}


@router.post("/coletor/pausar")
async def pausar(_: AdminDep) -> dict:
    await get_redis().set("coletor:pausado", "1")
    return {"pausado": True}


@router.post("/coletor/retomar")
async def retomar(_: AdminDep) -> dict:
    await get_redis().delete("coletor:pausado")
    return {"pausado": False}


async def _fake(metodo: str, caminho: str, corpo: dict | None = None) -> dict:
    s = get_settings()
    if s.tse_ambiente != "fake":
        raise HTTPException(409, "controle disponível só no ambiente fake")
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.request(metodo, f"{s.tse_fake_controle_url.rstrip('/')}/{caminho}", json=corpo)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "mock do TSE indisponível") from exc
    return r.json()


@router.get("/fake")
async def fake_estado(_: AdminDep) -> dict:
    return await _fake("GET", "estado")


@router.post("/fake")
async def fake_controle(_: AdminDep, dados: dict[str, Any]) -> dict:
    return await _fake("POST", "controle", dados)
