"""On-demand section collection.

The API registers in `sections:demand` (a sorted set, score = expiry time) the polling places and
sections somebody opened. The collector adds them to the live real-time topics and to the "polling
place tallied" alerts, and downloads only those ballot box reports.
"""

from __future__ import annotations

import time

from redis.asyncio import Redis

from app.infra.realtime import topics

#: Redis sorted set of the requested items: `<round>:<level>:<id>`, scored by expiry time.
DEMAND_KEY = "sections:demand"
#: The levels that can be requested on demand (the others are always collected).
LEVELS = ("polling_place", "section")


async def register(redis: Redis, election_round: int, level: str, geo_id: str, ttl: float = 120.0) -> None:
    if level in LEVELS:
        await redis.zadd(DEMAND_KEY, {f"{election_round}:{level}:{geo_id}": time.time() + ttl})


async def pending(redis: Redis) -> set[tuple[int, str, str]]:
    """(round, level, id) requested through the API or watched by a WebSocket client."""
    now = time.time()
    await redis.zremrangebyscore(DEMAND_KEY, 0, now)
    result: set[tuple[int, str, str]] = set()
    for item in await redis.zrange(DEMAND_KEY, 0, -1):
        raw = item.decode() if isinstance(item, bytes) else str(item)
        election_round, level, geo_id = raw.split(":", 2)
        result.add((int(election_round), level, geo_id))
    for topic in await topics.active(redis):
        parts = topic.split(":")
        # results:<round>:<office>:<level>:<id> | children:<round>:<office>:<level>:<id>[:<child_level>]
        if (
            len(parts) >= 5
            and parts[0] in ("results", "children")
            and parts[3] in LEVELS
            and parts[1].isdigit()
        ):
            result.add((int(parts[1]), parts[3], parts[4]))
    return result
