"""Real time: WebSocket, the registry of active topics and the fan-out of the worker's publications."""

import asyncio

import orjson
import pytest
from fastapi.testclient import TestClient
from redis import Redis as RedisSync

from app.core import redis as redis_mod
from app.core.config import get_settings
from app.core.security import create_token
from app.infra.realtime import topics
from app.infra.realtime.hub import Connection, Hub
from tests.integration.support import redis_url_or_skip

pytestmark = pytest.mark.integration


class FakeWebSocket:
    pass


async def test_hub_dispatches_only_to_subscribers(redis_cliente):
    hub = Hub(redis_cliente)
    a, b = Connection(FakeWebSocket()), Connection(FakeWebSocket())
    hub.connections |= {a, b}
    await hub.subscribe(a, ["results:1:1:country:br"])
    b.user_id = "u1"
    await hub.dispatch("results:1:1:country:br", {"type": "results", "data": 1})
    await hub.dispatch(topics.user("u1"), {"type": "alert", "data": 2})
    assert orjson.loads(a.queue.get_nowait())["seq"] == 1
    assert a.queue.empty() is True
    assert orjson.loads(b.queue.get_nowait())["type"] == "alert"
    assert await topics.is_active(redis_cliente, "results:1:1:country:br")
    assert not await topics.is_active(redis_cliente, "results:1:1:state:sp")
    assert await topics.is_active(redis_cliente, "events:1")
    assert "results:1:1:country:br" in await topics.active(redis_cliente)


def test_websocket_subscribes_and_receives_publication(redis_cliente, monkeypatch):
    # TestClient runs the app (with lifespan) in another thread/loop: it uses its own Redis client,
    # built from REDIS_URL, which the test environment points at nothing unless the test says so.
    url = redis_url_or_skip()
    monkeypatch.setenv("REDIS_URL", url)
    get_settings.cache_clear()
    redis_mod._redis = None
    pub = RedisSync.from_url(url)
    try:
        from app.core.main import app

        with TestClient(app) as client, client.websocket_connect("/api/v1/ws") as ws:
            ws.send_text(orjson.dumps({"op": "ping"}).decode())
            assert ws.receive_json()["type"] == "pong"
            ws.send_text(orjson.dumps({"op": "auth", "token": create_token("usuario-x")}).decode())
            assert ws.receive_json() == {"type": "auth", "ok": True, "seq": 2}
            ws.send_text(orjson.dumps({"op": "subscribe", "topics": ["results:1:1:state:sp"]}).decode())
            ws.send_text(orjson.dumps({"op": "ping"}).decode())
            assert ws.receive_json()["type"] == "pong"
            for _ in range(50):
                n = pub.publish(
                    "pub:results:1:1:state:sp",
                    orjson.dumps({"type": "results", "topic": "results:1:1:state:sp", "data": {"x": 1}}),
                )
                if n:
                    break
                asyncio.run(asyncio.sleep(0.05))
            msg = ws.receive_json()
            assert msg["type"] == "results" and msg["data"] == {"x": 1}
            pub.publish("pub:user:usuario-x", orjson.dumps({"type": "alert", "data": {"title": "t"}}))
            assert ws.receive_json()["type"] == "alert"
            ws.send_text("isto não é json")
            assert ws.receive_json()["type"] == "error"
    finally:
        pub.close()
        redis_mod.configure_redis(redis_cliente)


@pytest.mark.parametrize(
    "fn,args,esperado",
    [
        (topics.results, (1, 3, "state", "sp"), "results:1:3:state:sp"),
        (topics.children, (1, 1, "country", "br", "municipality"), "children:1:1:country:br:municipality"),
        (topics.polling_places, (1, 1, "sp71072"), "polling_places:1:1:sp71072"),
    ],
)
def test_topic_names(fn, args, esperado):
    assert fn(*args) == esperado
