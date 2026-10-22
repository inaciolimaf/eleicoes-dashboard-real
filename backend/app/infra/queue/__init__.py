"""Fila simples sobre Redis (lista) entre coletor e worker.

Mensagem: `{"type": "result"|"tracking"|"ballot", "body": <base64>, "context": {...}}`.
"""

from __future__ import annotations

import base64

import orjson
from redis.asyncio import Redis

QUEUE = "queue:files"
TYPE_RESULT = "result"
TYPE_TRACKING = "tracking"
TYPE_BALLOT = "ballot"


def message(type_: str, body: bytes, **context: object) -> bytes:
    return orjson.dumps({"type": type_, "body": base64.b64encode(body).decode(), "context": context})


def read(raw: bytes) -> tuple[str, bytes, dict]:
    d = orjson.loads(raw)
    return d["type"], base64.b64decode(d["body"]), d.get("context") or {}


async def enqueue(redis: Redis, type_: str, body: bytes, **context: object) -> None:
    await redis.lpush(QUEUE, message(type_, body, **context))


async def size(redis: Redis) -> int:
    return int(await redis.llen(QUEUE))
