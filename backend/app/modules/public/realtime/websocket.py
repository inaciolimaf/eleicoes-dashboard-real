"""WebSocket /api/v1/ws (protocol in docs/refactoring-contract.md and frontend/src/realtime/socket.ts).

Client -> server: `{"op": "subscribe"|"unsubscribe", "topics": [...]}`, `{"op": "auth", "token"}`,
`{"op": "ping"}`, `{"op": "resume"}`. Server -> client: `{"type", "topic", "seq", "data"}`, or
`{"type": "auth", "ok"}`, `{"type": "pong"}`, `{"type": "resync"}`, `{"type": "error", "message"}`.
"""

import asyncio
import contextlib

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import read_token
from app.infra.realtime.hub import Connection, Hub

router = APIRouter()


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    hub: Hub = ws.app.state.hub
    await ws.accept()
    connection = Connection(ws)
    hub.connections.add(connection)
    emitter = asyncio.create_task(_emit(ws, connection))
    try:
        while True:
            await _handle(hub, connection, await ws.receive_text())
    except WebSocketDisconnect:
        pass
    finally:
        hub.connections.discard(connection)
        emitter.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await emitter


async def _emit(ws: WebSocket, connection: Connection) -> None:
    """Sends what the hub queues for this connection, one message at a time."""
    while True:
        data = await connection.queue.get()
        await ws.send_text(data.decode())


async def _handle(hub: Hub, connection: Connection, text: str) -> None:
    try:
        msg = orjson.loads(text)
    except orjson.JSONDecodeError:
        await connection.send({"type": "error", "message": "JSON inválido"})
        return
    op = msg.get("op")
    if op == "subscribe":
        await hub.subscribe(connection, list(msg.get("topics") or []))
    elif op == "unsubscribe":
        connection.topics -= set(msg.get("topics") or [])
    elif op == "auth":
        connection.user_id = read_token(str(msg.get("token") or ""))
        await connection.send({"type": "auth", "ok": connection.user_id is not None})
    elif op == "ping":
        await connection.send({"type": "pong"})
    elif op == "resume":
        await connection.send({"type": "resync"})
    else:
        await connection.send({"type": "error", "message": f"op desconhecida: {op}"})
