"""Hub de WebSocket: conexões, assinatura de tópicos e fan-out das mensagens publicadas no Redis."""

from __future__ import annotations

import asyncio
import contextlib
import logging

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

    async def send(self, msg: dict) -> None:
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
        self._tasks: list[asyncio.Task] = []

    def start(self) -> None:
        self._tasks = [asyncio.create_task(self._listen()), asyncio.create_task(self._heartbeat())]

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t

    def active_topics(self) -> set[str]:
        out: set[str] = set()
        for c in self.connections:
            out |= c.topics
        return out

    async def _heartbeat(self) -> None:
        while True:
            try:
                await topics.register_active(self.redis, list(self.active_topics()))
            except Exception:  # pragma: no cover - redis fora do ar
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
                    canal = msg["channel"].decode() if isinstance(msg["channel"], bytes) else msg["channel"]
                    topic = canal[len(topics.PREFIX) :]
                    await self.dispatch(topic, orjson.loads(msg["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover
                log.exception("listener do redis caiu; reconectando")
                await asyncio.sleep(1)

    async def dispatch(self, topic: str, message: dict) -> None:
        for c in list(self.connections):
            if topic in c.topics or (c.user_id and topic == topics.user(c.user_id)):
                await c.send(dict(message))

    async def subscribe(self, c: Connection, lista: list[str]) -> None:
        novos = [t for t in lista if isinstance(t, str) and len(t) < 120][:200]
        c.topics |= set(novos)
        await topics.register_active(self.redis, novos)
