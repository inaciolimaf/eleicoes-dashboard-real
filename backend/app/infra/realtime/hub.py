"""WebSocket hub: connections, topic subscriptions and fan-out of the messages published on Redis."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

import orjson
from fastapi import WebSocket
from redis.asyncio import Redis

from app.infra.realtime import topics

log = logging.getLogger(__name__)


class Connection:
    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.topics: set[str] = set()
        self.seq = 0
        self.user_id: str | None = None
        self.queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=2000)

    async def send(self, msg: dict[str, Any]) -> None:
        self.seq += 1
        msg["seq"] = self.seq
        try:
            self.queue.put_nowait(orjson.dumps(msg))
        except asyncio.QueueFull:
            log.warning("fila de websocket cheia; descartando mensagem")


class Hub:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self.connections: set[Connection] = set()
        self._tasks: list[asyncio.Task[None]] = []

    def start(self) -> None:
        self._tasks = [asyncio.create_task(self._listen()), asyncio.create_task(self._heartbeat())]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    def active_topics(self) -> set[str]:
        out: set[str] = set()
        for c in self.connections:
            out |= c.topics
        return out

    async def _heartbeat(self) -> None:
        """Keeps this hub's topics marked as active in Redis, so the worker and the collector see them."""
        while True:
            try:
                await topics.register_active(self.redis, list(self.active_topics()))
            except Exception:  # pragma: no cover - redis is down
                log.exception("falha ao registrar tópicos ativos")
            await asyncio.sleep(15)

    async def _listen(self) -> None:
        while True:
            try:
                pubsub = self.redis.pubsub()
                await pubsub.psubscribe(topics.PREFIX + "*")
                async for msg in pubsub.listen():
                    if msg.get("type") != "pmessage":
                        continue
                    raw_channel = msg["channel"]
                    channel = raw_channel.decode() if isinstance(raw_channel, bytes) else raw_channel
                    await self.dispatch(channel[len(topics.PREFIX) :], orjson.loads(msg["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover
                log.exception("listener do redis caiu; reconectando")
                await asyncio.sleep(1)

    async def dispatch(self, topic: str, message: dict[str, Any]) -> None:
        for c in list(self.connections):
            if topic in c.topics or (c.user_id and topic == topics.user(c.user_id)):
                await c.send(dict(message))

    async def subscribe(self, c: Connection, requested: list[str]) -> None:
        new = [t for t in requested if isinstance(t, str) and len(t) < 120][:200]
        c.topics |= set(new)
        await topics.register_active(self.redis, new)
