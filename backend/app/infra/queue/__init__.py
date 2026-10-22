"""Fila simples sobre Redis (lista) entre coletor e worker."""

from __future__ import annotations

import base64

import orjson
from redis.asyncio import Redis

FILA = "fila:arquivos"


def mensagem(tipo: str, corpo: bytes, **ctx: object) -> bytes:
    return orjson.dumps({"tipo": tipo, "corpo": base64.b64encode(corpo).decode(), "ctx": ctx})


def ler(bruto: bytes) -> tuple[str, bytes, dict]:
    d = orjson.loads(bruto)
    return d["tipo"], base64.b64decode(d["corpo"]), d.get("ctx") or {}


async def enfileirar(redis: Redis, tipo: str, corpo: bytes, **ctx: object) -> None:
    await redis.lpush(FILA, mensagem(tipo, corpo, **ctx))


async def tamanho(redis: Redis) -> int:
    return int(await redis.llen(FILA))
