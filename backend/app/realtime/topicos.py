"""Tópicos de tempo real e publicação via Redis pub/sub.

O hub da API registra em `ws:topicos` (sorted set, score = expiração) os tópicos que têm alguém assistindo. O worker só
monta payloads caros para tópicos ativos. Também serve de sinal para o coletor priorizar recortes vigiados.
"""

from __future__ import annotations

import time

import orjson
from redis.asyncio import Redis

CHAVE_ATIVOS = "ws:topicos"
PREFIXO = "pub:"
SEMPRE_ATIVOS = ("eventos:", "status", "progresso:", "usuario:")


def res(turno: int, cd: int, nivel: str, rid: str) -> str:
    return f"res:{turno}:{cd}:{nivel}:{rid}"


def filhos(turno: int, cd: int, nivel: str, rid: str, nivel_filhos: str | None = None) -> str:
    base = f"filhos:{turno}:{cd}:{nivel}:{rid}"
    return f"{base}:{nivel_filhos}" if nivel_filhos else base


def locais(turno: int, cd: int, municipio: str) -> str:
    return f"locais:{turno}:{cd}:{municipio}"


def eventos(turno: int) -> str:
    return f"eventos:{turno}"


def progresso(turno: int) -> str:
    return f"progresso:{turno}"


def usuario(uid: str) -> str:
    return f"usuario:{uid}"


async def registrar_ativos(redis: Redis, topicos: list[str], ttl: float = 45.0) -> None:
    if not topicos:
        return
    expira = time.time() + ttl
    await redis.zadd(CHAVE_ATIVOS, {t: expira for t in topicos})


async def ativos(redis: Redis) -> set[str]:
    agora = time.time()
    await redis.zremrangebyscore(CHAVE_ATIVOS, 0, agora)
    return {t.decode() if isinstance(t, bytes) else t for t in await redis.zrange(CHAVE_ATIVOS, 0, -1)}


async def esta_ativo(redis: Redis, topico: str) -> bool:
    if topico.startswith(SEMPRE_ATIVOS):
        return True
    score = await redis.zscore(CHAVE_ATIVOS, topico)
    return score is not None and score > time.time()


async def publicar(redis: Redis, topico: str, tipo: str, dados: object) -> None:
    await redis.publish(PREFIXO + topico, orjson.dumps({"tipo": tipo, "topico": topico, "dados": dados}))
