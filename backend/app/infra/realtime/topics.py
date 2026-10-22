"""Tópicos de tempo real e publicação via Redis pub/sub.

Formato dos tópicos (ver docs/refactoring-contract.md e `frontend/src/realtime/topics.ts`):
`results:{round}:{office}:{level}:{id}`, `children:{round}:{office}:{level}:{id}[:{child_level}]`,
`polling_places:{round}:{office}:{municipality}`, `events:{round}`, `progress:{round}`, `status`,
`user:{id}`.

O hub da API registra em `ws:topics` (sorted set, score = expiração) os tópicos que têm alguém
assistindo. O worker só monta payloads caros para tópicos ativos. Também serve de sinal para o
coletor priorizar recortes vigiados.
"""

from __future__ import annotations

import time

import orjson
from redis.asyncio import Redis

ACTIVE_KEY = "ws:topics"
PREFIX = "pub:"
ALWAYS_ACTIVE = ("events:", "status", "progress:", "user:")


def results(turno: int, cd: int, nivel: str, rid: str) -> str:
    return f"results:{turno}:{cd}:{nivel}:{rid}"


def children(turno: int, cd: int, nivel: str, rid: str, child_level: str | None = None) -> str:
    base = f"children:{turno}:{cd}:{nivel}:{rid}"
    return f"{base}:{child_level}" if child_level else base


def polling_places(turno: int, cd: int, municipio: str) -> str:
    return f"polling_places:{turno}:{cd}:{municipio}"


def events(turno: int) -> str:
    return f"events:{turno}"


def progress(turno: int) -> str:
    return f"progress:{turno}"


def user(uid: str) -> str:
    return f"user:{uid}"


async def register_active(redis: Redis, topics: list[str], ttl: float = 45.0) -> None:
    if not topics:
        return
    expira = time.time() + ttl
    await redis.zadd(ACTIVE_KEY, dict.fromkeys(topics, expira))


async def active(redis: Redis) -> set[str]:
    agora = time.time()
    await redis.zremrangebyscore(ACTIVE_KEY, 0, agora)
    return {t.decode() if isinstance(t, bytes) else t for t in await redis.zrange(ACTIVE_KEY, 0, -1)}


async def is_active(redis: Redis, topic: str) -> bool:
    if topic.startswith(ALWAYS_ACTIVE):
        return True
    score = await redis.zscore(ACTIVE_KEY, topic)
    return score is not None and score > time.time()


async def publish(redis: Redis, topic: str, type_: str, data: object) -> None:
    """Mensagem para o hub: `{"type", "topic", "data"}` (o `seq` é por conexão, o hub acrescenta)."""
    await redis.publish(PREFIX + topic, orjson.dumps({"type": type_, "topic": topic, "data": data}))
