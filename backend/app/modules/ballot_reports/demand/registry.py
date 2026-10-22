"""Coleta de seções sob demanda.

A API registra em `sections:demand` (sorted set, score = expiração) os locais de votação e seções que
alguém abriu. O coletor junta isso aos tópicos de tempo real ativos e aos alertas de "local apurado" e
baixa só esses boletins.
"""

from __future__ import annotations

import time

from redis.asyncio import Redis

from app.infra.realtime import topics

CHAVE = "sections:demand"
LEVELS = ("polling_place", "section")


async def registrar(redis: Redis, turno: int, nivel: str, rid: str, ttl: float = 120.0) -> None:
    if nivel in LEVELS:
        await redis.zadd(CHAVE, {f"{turno}:{nivel}:{rid}": time.time() + ttl})


async def pending(redis: Redis) -> set[tuple[int, str, str]]:
    """(round, level, id) pedidos pela API ou assistidos por WebSocket."""
    agora = time.time()
    await redis.zremrangebyscore(CHAVE, 0, agora)
    saida: set[tuple[int, str, str]] = set()
    for item in await redis.zrange(CHAVE, 0, -1):
        turno, nivel, rid = (item.decode() if isinstance(item, bytes) else item).split(":", 2)
        saida.add((int(turno), nivel, rid))
    for t in await topics.active(redis):
        partes = t.split(":")
        # results:<round>:<office>:<level>:<id> | children:<round>:<office>:<level>:<id>[:<child_level>]
        if (
            len(partes) >= 5
            and partes[0] in ("results", "children")
            and partes[3] in LEVELS
            and partes[1].isdigit()
        ):
            saida.add((int(partes[1]), partes[3], partes[4]))
    return saida
