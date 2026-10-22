"""Real-time topics and publication through Redis pub/sub.

Topic format (see `docs/system/processing.md` and `frontend/src/modules/realtime/topics.ts`):
`results:{round}:{office}:{level}:{id}`, `children:{round}:{office}:{level}:{id}[:{child_level}]`,
`polling_places:{round}:{office}:{municipality}`, `events:{round}`, `progress:{round}`, `status`,
`user:{id}`.

The API hub records in `ws:topics` (sorted set, score = expiry) the topics someone is watching. The
worker builds the expensive payloads only for active topics, and the collector uses the same set to
prioritize the watched geo areas.
"""

from __future__ import annotations

import time
from typing import cast

import orjson
from redis.asyncio import Redis

ACTIVE_KEY = "ws:topics"
PREFIX = "pub:"
ALWAYS_ACTIVE = ("events:", "status", "progress:", "user:")


def results(round_number: int, office_code: int, level: str, geo_id: str) -> str:
    return f"results:{round_number}:{office_code}:{level}:{geo_id}"


def children(
    round_number: int, office_code: int, level: str, geo_id: str, child_level: str | None = None
) -> str:
    base = f"children:{round_number}:{office_code}:{level}:{geo_id}"
    return f"{base}:{child_level}" if child_level else base


def polling_places(round_number: int, office_code: int, municipality: str) -> str:
    return f"polling_places:{round_number}:{office_code}:{municipality}"


def events(round_number: int) -> str:
    return f"events:{round_number}"


def progress(round_number: int) -> str:
    return f"progress:{round_number}"


def user(user_id: str) -> str:
    return f"user:{user_id}"


async def register_active(redis: Redis, topics: list[str], ttl: float = 45.0) -> None:
    if not topics:
        return
    expires = time.time() + ttl
    await redis.zadd(ACTIVE_KEY, dict.fromkeys(topics, expires))


async def active(redis: Redis) -> set[str]:
    await redis.zremrangebyscore(ACTIVE_KEY, 0, time.time())
    members = cast("list[bytes | str]", await redis.zrange(ACTIVE_KEY, 0, -1))
    return {member.decode() if isinstance(member, bytes) else member for member in members}


async def is_active(redis: Redis, topic: str) -> bool:
    if topic.startswith(ALWAYS_ACTIVE):
        return True
    score = await redis.zscore(ACTIVE_KEY, topic)
    return score is not None and score > time.time()


async def publish(redis: Redis, topic: str, type_: str, data: object) -> None:
    """Message for the hub: `{"type", "topic", "data"}` (the `seq` is per connection; the hub adds it)."""
    await redis.publish(PREFIX + topic, orjson.dumps({"type": type_, "topic": topic, "data": data}))
