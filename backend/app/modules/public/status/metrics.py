"""Reads of the JSON the collector and the worker keep in Redis (status and diagnostics both use them)."""

from typing import Any

import orjson
from redis.asyncio import Redis


async def read_metrics(redis: Redis) -> dict[str, Any]:
    """The collector's metrics, or an empty dict while the collector has not reported yet."""
    raw = await redis.get("collector:metrics")
    return orjson.loads(raw) if raw else {}


async def read_json(redis: Redis, key: str) -> dict[str, Any] | None:
    raw = await redis.get(key)
    return orjson.loads(raw) if raw else None
