"""Collector -> worker queue: priority, coalescing of file versions and compression."""

import base64

import orjson
import pytest

from app.infra import queue

pytestmark = pytest.mark.integration


async def test_queue_prioritizes_high_and_coalesces_versions(redis_cliente):
    redis = redis_cliente
    await redis.delete(queue.QUEUE, queue.QUEUE_PRIORITY, queue.PENDING)
    await queue.enqueue(redis, "result", b"mun-v1", key="mun.json", n=1)
    await queue.enqueue(redis, "result", b"mun-v2", key="mun.json", n=2)  # replaces v1
    await queue.enqueue(redis, "ballot", b"bu", h="x")
    await queue.enqueue(redis, "result", b"uf", high_priority=True, key="uf.json")
    assert await queue.size(redis) == 3
    assert (await queue.dequeue(redis, timeout=0))[1] == b"uf"
    assert await queue.dequeue(redis, timeout=0) == ("result", b"mun-v2", {"n": 2})
    assert (await queue.dequeue(redis, timeout=0))[1] == b"bu"
    assert await queue.dequeue(redis, timeout=0) is None
    # once taken, a new version enters the queue again
    await queue.enqueue(redis, "result", b"mun-v3", key="mun.json")
    assert (await queue.dequeue(redis, timeout=1))[1] == b"mun-v3"


async def test_queue_compresses_and_reads_uncompressed_message(redis_cliente):
    body = b'{"cand": [' + b'{"n": 1, "v": 12345},' * 2000 + b"{}]}"
    msg = queue.message("result", body, x=1)
    assert len(msg) < len(body) / 5
    assert queue.read(msg) == ("result", body, {"x": 1})
    antigo = orjson.dumps({"type": "ballot", "body": base64.b64encode(b"bu").decode(), "context": {}})
    assert queue.read(antigo) == ("ballot", b"bu", {})
