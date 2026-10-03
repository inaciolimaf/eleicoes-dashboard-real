"""Hub de WebSocket: conexões, assinatura de tópicos e fan-out das mensagens publicadas no Redis."""

from __future__ import annotations

import asyncio
import contextlib
import logging

import orjson
from fastapi import WebSocket
from redis.asyncio import Redis

from app.realtime import topicos

log = logging.getLogger(__name__)


class Conexao:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.topicos: set[str] = set()
        self.seq = 0
        self.usuario_id: str | None = None
        self.fila: asyncio.Queue[bytes] = asyncio.Queue(maxsize=2000)

    async def enviar(self, msg: dict) -> None:
        self.seq += 1
        msg["seq"] = self.seq
        try:
            self.fila.put_nowait(orjson.dumps(msg))
        except asyncio.QueueFull:
            log.warning("fila de websocket cheia; descartando mensagem")


class Hub:
    def __init__(self, redis: Redis):
        self.redis = redis
        self.conexoes: set[Conexao] = set()
        self._tarefas: list[asyncio.Task] = []

    def iniciar(self) -> None:
        self._tarefas = [asyncio.create_task(self._escutar()), asyncio.create_task(self._heartbeat())]

    async def parar(self) -> None:
        for t in self._tarefas:
            t.cancel()
        for t in self._tarefas:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t

    def topicos_ativos(self) -> set[str]:
        out: set[str] = set()
        for c in self.conexoes:
            out |= c.topicos
        return out

    async def _heartbeat(self) -> None:
        while True:
            try:
                await topicos.registrar_ativos(self.redis, list(self.topicos_ativos()))
            except Exception:  # pragma: no cover - redis fora do ar
                log.exception("falha ao registrar tópicos ativos")
            await asyncio.sleep(15)

    async def _escutar(self) -> None:
        while True:
            try:
                pubsub = self.redis.pubsub()
                await pubsub.psubscribe(topicos.PREFIXO + "*")
                async for msg in pubsub.listen():
                    if msg.get("type") != "pmessage":
                        continue
                    canal = msg["channel"].decode() if isinstance(msg["channel"], bytes) else msg["channel"]
                    topico = canal[len(topicos.PREFIXO):]
                    await self.despachar(topico, orjson.loads(msg["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover
                log.exception("listener do redis caiu; reconectando")
                await asyncio.sleep(1)

    async def despachar(self, topico: str, mensagem: dict) -> None:
        for c in list(self.conexoes):
            if topico in c.topicos or (c.usuario_id and topico == topicos.usuario(c.usuario_id)):
                await c.enviar(dict(mensagem))

    async def assinar(self, c: Conexao, lista: list[str]) -> None:
        novos = [t for t in lista if isinstance(t, str) and len(t) < 120][:200]
        c.topicos |= set(novos)
        await topicos.registrar_ativos(self.redis, novos)
