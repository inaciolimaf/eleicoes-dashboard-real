"""Redis queue between the collector and the worker, with priority and coalescing.

Message: `{"type": "result"|"tracking"|"ballot", "z": <base64 of zlib>, "context": {...}}`.

- Two lists: `queue:priority` (national/state totals, tracking, municipalities open in the dashboard) and
  `queue:files` (the rest). The worker always drains the priority list first, so a state total does not wait
  behind thousands of municipalities.
- Messages with a `key` (a TSE file) keep their body in a hash; the list holds only a reference. If the file
  changes again before it is processed, the new version replaces the old one instead of joining the queue end.
- The body is compressed (zlib): the TSE JSON shrinks about 10x, which keeps Redis memory under control.
"""

from __future__ import annotations

import base64
import zlib
from typing import Any, cast

import orjson
from redis.asyncio import Redis

QUEUE = "queue:files"
QUEUE_PRIORITY = "queue:priority"
PENDING = "queue:pending"
TYPE_RESULT = "result"
TYPE_TRACKING = "tracking"
TYPE_BALLOT = "ballot"
_REF = b"ref:"

# HGET + HDEL in one step (HGETDEL only exists from Redis 8)
_LUA_TAKE = (
    "local v = redis.call('HGET', KEYS[1], ARGV[1]) "
    "if v then redis.call('HDEL', KEYS[1], ARGV[1]) end "
    "return v"
)


def message(type_: str, body: bytes, **context: object) -> bytes:
    return orjson.dumps(
        {"type": type_, "z": base64.b64encode(zlib.compress(body, 6)).decode(), "context": context}
    )


def read(raw: bytes) -> tuple[str, bytes, dict[str, Any]]:
    d = orjson.loads(raw)
    # a message without "z" was written before compression (plain "body")
    body = zlib.decompress(base64.b64decode(d["z"])) if "z" in d else base64.b64decode(d["body"])
    return d["type"], body, d.get("context") or {}


async def enqueue(
    redis: Redis,
    type_: str,
    body: bytes,
    *,
    high_priority: bool = False,
    key: str | None = None,
    **context: object,
) -> None:
    target = QUEUE_PRIORITY if high_priority else QUEUE
    msg = message(type_, body, **context)
    if key is None:
        await redis.lpush(target, msg)
        return
    # hset returns 1 only when the key was not pending: then the reference must enter the queue
    if await redis.hset(PENDING, key, msg):
        await redis.lpush(target, _REF + key.encode())


async def _resolve(redis: Redis, item: bytes) -> bytes | None:
    if not item.startswith(_REF):
        return item
    return cast("bytes | None", await redis.eval(_LUA_TAKE, 1, PENDING, item[len(_REF) :].decode()))


async def dequeue(redis: Redis, timeout: float = 5) -> tuple[str, bytes, dict[str, Any]] | None:
    """Next message (priority first), or None when the queue is empty. `timeout=0` does not block."""
    while True:
        if timeout == 0:
            item = cast("bytes | None", await redis.rpop(QUEUE_PRIORITY) or await redis.rpop(QUEUE))
        else:
            popped = await redis.brpop([QUEUE_PRIORITY, QUEUE], timeout=timeout)
            item = cast("bytes | None", popped[1] if popped else None)
        if item is None:
            return None
        raw = await _resolve(redis, item)
        if raw is not None:
            return read(raw)


async def size(redis: Redis) -> int:
    return int(await redis.llen(QUEUE_PRIORITY)) + int(await redis.llen(QUEUE))


async def low_priority_size(redis: Redis) -> int:
    return int(await redis.llen(QUEUE))
