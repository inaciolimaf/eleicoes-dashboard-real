"""WebSocket /api/v1/ws (protocolo em docs/refactoring-contract.md e frontend/src/realtime/socket.ts).

Cliente -> servidor: `{"op": "subscribe"|"unsubscribe", "topics": [...]}`, `{"op": "auth", "token"}`,
`{"op": "ping"}`, `{"op": "resume"}`. Servidor -> cliente: `{"type", "topic", "seq", "data"}`, ou
`{"type": "auth", "ok"}`, `{"type": "pong"}`, `{"type": "resync"}`, `{"type": "error", "message"}`.
"""

import asyncio
import contextlib

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import ler_token
from app.infra.realtime.hub import Connection

router = APIRouter()


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    hub = ws.app.state.hub
    await ws.accept()
    c = Connection(ws)
    hub.connections.add(c)

    async def emitter() -> None:
        while True:
            data = await c.queue.get()
            await ws.send_text(data.decode())

    task = asyncio.create_task(emitter())
    try:
        while True:
            texto = await ws.receive_text()
            try:
                msg = orjson.loads(texto)
            except orjson.JSONDecodeError:
                await c.send({"type": "error", "message": "JSON inválido"})
                continue
            op = msg.get("op")
            if op == "subscribe":
                await hub.subscribe(c, list(msg.get("topics") or []))
            elif op == "unsubscribe":
                c.topics -= set(msg.get("topics") or [])
            elif op == "auth":
                c.user_id = ler_token(str(msg.get("token") or ""))
                await c.send({"type": "auth", "ok": c.user_id is not None})
            elif op == "ping":
                await c.send({"type": "pong"})
            elif op == "resume":
                await c.send({"type": "resync"})
            else:
                await c.send({"type": "error", "message": f"op desconhecida: {op}"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.connections.discard(c)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
