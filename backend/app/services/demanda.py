"""Coleta de seções sob demanda.

A API registra em `secoes:demanda` (sorted set, score = expiração) os locais de votação e seções que alguém abriu.
O coletor junta isso aos tópicos de tempo real ativos e aos alertas de "local apurado" e baixa só esses boletins.
"""

from __future__ import annotations

import time

from redis.asyncio import Redis

from app.realtime import topicos

CHAVE = "secoes:demanda"
NIVEIS = ("local", "secao")


async def registrar(redis: Redis, turno: int, nivel: str, rid: str, ttl: float = 120.0) -> None:
    if nivel in NIVEIS:
        await redis.zadd(CHAVE, {f"{turno}:{nivel}:{rid}": time.time() + ttl})


async def pedidos(redis: Redis) -> set[tuple[int, str, str]]:
    """(turno, nivel, id) pedidos pela API ou assistidos por WebSocket."""
    agora = time.time()
    await redis.zremrangebyscore(CHAVE, 0, agora)
    saida: set[tuple[int, str, str]] = set()
    for item in await redis.zrange(CHAVE, 0, -1):
        turno, nivel, rid = (item.decode() if isinstance(item, bytes) else item).split(":", 2)
        saida.add((int(turno), nivel, rid))
    for t in await topicos.ativos(redis):
        partes = t.split(":")
        # res:<turno>:<cargo>:<nivel>:<id> | filhos:<turno>:<cargo>:<nivel>:<id>[:<filhos>]
        if len(partes) >= 5 and partes[0] in ("res", "filhos") and partes[3] in NIVEIS and partes[1].isdigit():
            saida.add((int(partes[1]), partes[3], partes[4]))
    return saida
