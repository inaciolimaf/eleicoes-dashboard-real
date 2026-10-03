"""WebSocket /api/v1/ws (protocolo em docs/11-contrato-api.md)."""

import asyncio
import contextlib

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import ler_token
from app.realtime.hub import Conexao

router = APIRouter()


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    hub = ws.app.state.hub
    await ws.accept()
    c = Conexao(ws)
    hub.conexoes.add(c)

    async def emissor() -> None:
        while True:
            dados = await c.fila.get()
            await ws.send_text(dados.decode())

    tarefa = asyncio.create_task(emissor())
    try:
        while True:
            texto = await ws.receive_text()
            try:
                msg = orjson.loads(texto)
            except orjson.JSONDecodeError:
                await c.enviar({"tipo": "erro", "mensagem": "JSON inválido"})
                continue
            op = msg.get("op")
            if op == "sub":
                await hub.assinar(c, list(msg.get("topicos") or []))
            elif op == "unsub":
                c.topicos -= set(msg.get("topicos") or [])
            elif op == "auth":
                c.usuario_id = ler_token(str(msg.get("token") or ""))
                await c.enviar({"tipo": "auth", "ok": c.usuario_id is not None})
            elif op == "ping":
                await c.enviar({"tipo": "pong"})
            elif op == "resume":
                await c.enviar({"tipo": "resync"})
            else:
                await c.enviar({"tipo": "erro", "mensagem": f"op desconhecida: {op}"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.conexoes.discard(c)
        tarefa.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await tarefa
