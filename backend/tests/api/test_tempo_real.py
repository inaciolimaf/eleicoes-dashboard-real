"""Tempo real: WebSocket, registro de tópicos ativos e fan-out das publicações do worker."""

import asyncio
import os

import orjson
import pytest
from fastapi.testclient import TestClient
from redis import Redis as RedisSync

from app.core import redis as redis_mod
from app.core.security import criar_token
from app.realtime import topicos
from app.realtime.hub import Conexao, Hub


class WsFalso:
    pass


async def test_hub_despacha_so_para_assinantes(redis_cliente):
    hub = Hub(redis_cliente)
    a, b = Conexao(WsFalso()), Conexao(WsFalso())
    hub.conexoes |= {a, b}
    await hub.assinar(a, ["res:1:1:br:br"])
    b.usuario_id = "u1"
    await hub.despachar("res:1:1:br:br", {"tipo": "res", "dados": 1})
    await hub.despachar(topicos.usuario("u1"), {"tipo": "alerta", "dados": 2})
    assert orjson.loads(a.fila.get_nowait())["seq"] == 1
    assert a.fila.empty() is True
    assert orjson.loads(b.fila.get_nowait())["tipo"] == "alerta"
    assert await topicos.esta_ativo(redis_cliente, "res:1:1:br:br")
    assert not await topicos.esta_ativo(redis_cliente, "res:1:1:uf:sp")
    assert await topicos.esta_ativo(redis_cliente, "eventos:1")
    assert "res:1:1:br:br" in await topicos.ativos(redis_cliente)


def test_websocket_assina_e_recebe_publicacao(redis_cliente):
    # TestClient roda o app (com lifespan) em outra thread/loop: usa um cliente Redis próprio
    redis_mod._redis = None
    url = os.environ["TEST_REDIS_URL"]
    pub = RedisSync.from_url(url)
    try:
        from app.main import app

        with TestClient(app) as cliente, cliente.websocket_connect("/api/v1/ws") as ws:
            ws.send_text(orjson.dumps({"op": "ping"}).decode())
            assert ws.receive_json()["tipo"] == "pong"
            ws.send_text(orjson.dumps({"op": "auth", "token": criar_token("usuario-x")}).decode())
            assert ws.receive_json() == {"tipo": "auth", "ok": True, "seq": 2}
            ws.send_text(orjson.dumps({"op": "sub", "topicos": ["res:1:1:uf:sp"]}).decode())
            ws.send_text(orjson.dumps({"op": "ping"}).decode())
            assert ws.receive_json()["tipo"] == "pong"
            for _ in range(50):
                n = pub.publish("pub:res:1:1:uf:sp", orjson.dumps({"tipo": "res", "topico": "res:1:1:uf:sp", "dados": {"x": 1}}))
                if n:
                    break
                asyncio.run(asyncio.sleep(0.05))
            msg = ws.receive_json()
            assert msg["tipo"] == "res" and msg["dados"] == {"x": 1}
            pub.publish("pub:usuario:usuario-x", orjson.dumps({"tipo": "alerta", "dados": {"titulo": "t"}}))
            assert ws.receive_json()["tipo"] == "alerta"
            ws.send_text("isto não é json")
            assert ws.receive_json()["tipo"] == "erro"
    finally:
        pub.close()
        redis_mod.configurar_redis(redis_cliente)


@pytest.mark.parametrize("fn,args,esperado", [
    (topicos.res, (1, 3, "uf", "sp"), "res:1:3:uf:sp"),
    (topicos.filhos, (1, 1, "br", "br", "municipio"), "filhos:1:1:br:br:municipio"),
    (topicos.locais, (1, 1, "sp71072"), "locais:1:1:sp71072"),
])
def test_nomes_de_topicos(fn, args, esperado):
    assert fn(*args) == esperado
