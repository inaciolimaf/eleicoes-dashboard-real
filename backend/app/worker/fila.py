"""Fila sobre Redis entre coletor e worker, com prioridade e coalescência.

- Duas listas: `fila:alta` (Brasil/UF, acompanhamento, municípios abertos no dashboard) e `fila:arquivos` (o resto).
  O worker sempre esvazia a alta antes da baixa: o total do estado não espera atrás de milhares de municípios.
- Mensagens com `chave` (um arquivo do TSE) ficam num hash; a lista guarda só a referência. Se o arquivo mudar de
  novo antes de ser processado, a versão nova substitui a antiga em vez de entrar no fim da fila.
- O corpo vai comprimido (zlib): o JSON do TSE encolhe ~10x, o que mantém a memória do Redis sob controle.
"""

from __future__ import annotations

import base64
import zlib

import orjson
from redis.asyncio import Redis

FILA_ALTA = "fila:alta"
FILA = "fila:arquivos"
PENDENTES = "fila:pendentes"
_REF = b"ref:"

# HGET + HDEL atômicos (HGETDEL só existe a partir do Redis 8)
_LUA_TIRAR = "local v = redis.call('HGET', KEYS[1], ARGV[1]) if v then redis.call('HDEL', KEYS[1], ARGV[1]) end return v"


def mensagem(tipo: str, corpo: bytes, **ctx: object) -> bytes:
    return orjson.dumps({"tipo": tipo, "z": base64.b64encode(zlib.compress(corpo, 6)).decode(), "ctx": ctx})


def ler(bruto: bytes) -> tuple[str, bytes, dict]:
    d = orjson.loads(bruto)
    corpo = zlib.decompress(base64.b64decode(d["z"])) if "z" in d else base64.b64decode(d["corpo"])  # "corpo": formato antigo
    return d["tipo"], corpo, d.get("ctx") or {}


async def enfileirar(redis: Redis, tipo: str, corpo: bytes, *, alta: bool = False, chave: str | None = None,
                     **ctx: object) -> None:
    lista = FILA_ALTA if alta else FILA
    msg = mensagem(tipo, corpo, **ctx)
    if chave is None:
        await redis.lpush(lista, msg)
        return
    # hset devolve 1 só se a chave não estava pendente: aí é preciso pôr a referência na fila
    if await redis.hset(PENDENTES, chave, msg):
        await redis.lpush(lista, _REF + chave.encode())


async def _resolver(redis: Redis, item: bytes) -> bytes | None:
    if not item.startswith(_REF):
        return item
    return await redis.eval(_LUA_TIRAR, 1, PENDENTES, item[len(_REF):].decode())


async def retirar(redis: Redis, timeout: float = 5) -> tuple[str, bytes, dict] | None:
    """Próxima mensagem (alta primeiro), ou None se a fila estiver vazia. `timeout=0` não bloqueia."""
    while True:
        if timeout == 0:
            item = await redis.rpop(FILA_ALTA) or await redis.rpop(FILA)
        else:
            r = await redis.brpop([FILA_ALTA, FILA], timeout=timeout)
            item = r[1] if r else None
        if item is None:
            return None
        bruto = await _resolver(redis, item)
        if bruto is not None:
            return ler(bruto)


async def tamanho(redis: Redis) -> int:
    return int(await redis.llen(FILA_ALTA)) + int(await redis.llen(FILA))


async def tamanho_baixa(redis: Redis) -> int:
    return int(await redis.llen(FILA))
