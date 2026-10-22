"""Collector HTTP client: rate limit, ETag/304, 404 memory, retries and the JWS fallback."""

import time

import httpx
import respx

from app.collector.fetcher import Fetcher, TokenBucket


async def test_token_bucket_does_not_exceed_the_limit():
    bucket = TokenBucket(rate=50, capacity=1)
    start = time.monotonic()
    for _ in range(26):
        await bucket.acquire()
    assert time.monotonic() - start >= 0.45  # 25 tokens at 50/s after the first


@respx.mock
async def test_etag_304_consumes_a_token_and_is_not_downloaded_again():
    url = "http://tse.teste/oficial/a.json"
    route = respx.get(url).mock(
        side_effect=[
            httpx.Response(200, content=b"{}", headers={"ETag": '"1"'}),
            httpx.Response(304),
        ]
    )
    fetcher = Fetcher(max_rps=1000)
    r1 = await fetcher.get(url)
    r2 = await fetcher.get(url)
    assert (r1.status, r1.body) == (200, b"{}")
    assert r2.status == 304 and r2.body is None
    assert route.calls[1].request.headers["If-None-Match"] == '"1"'
    assert fetcher.metrics.by_status == {200: 1, 304: 1}


@respx.mock
async def test_404_is_not_requested_again():
    url = "http://tse.teste/oficial/nao-existe.json"
    route = respx.get(url).mock(return_value=httpx.Response(404))
    fetcher = Fetcher(max_rps=1000)
    assert (await fetcher.get(url)).status == 404
    assert (await fetcher.get(url)).status == 404
    assert route.call_count == 1
    fetcher.clear_404()
    await fetcher.get(url)
    assert route.call_count == 2


@respx.mock
async def test_retries_on_5xx_error():
    url = "http://tse.teste/oficial/b.json"
    respx.get(url).mock(side_effect=[httpx.Response(503), httpx.Response(200, content=b"ok")])
    fetcher = Fetcher(max_rps=1000)
    fetcher.bucket.rate = 10000
    r = await fetcher.get(url)
    assert r.status == 200 and r.body == b"ok"


@respx.mock
async def test_jws_with_wrong_key_falls_back_to_the_json():
    """If the TSE key/kid does not match, the collector must not stop updating: it uses the .json."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.collector.collector import Collector
    from app.core.config import Settings
    from app.infra.tse import jws

    base = "http://tse.teste/oficial/x"
    token = jws.assinar(b'{"v": 1}', Ed25519PrivateKey.generate(), "kid-desconhecido")
    jws_route = respx.get(f"{base}.jws").mock(return_value=httpx.Response(200, content=token.encode()))
    respx.get(f"{base}.json").mock(return_value=httpx.Response(200, content=b'{"v": 2}'))
    collector = Collector(Settings(tse_verificar_jws=True), None, None, Fetcher(max_rps=1000))  # type: ignore[arg-type]
    assert await collector.fetch_file(f"{base}.json", archive=False) == (200, b'{"v": 2}', False)
    assert collector.fetcher.metrics.jws_failures == 1
    # after the failure, the .jws is not even tried again
    await collector.fetch_file(f"{base}.json", archive=False)
    assert jws_route.call_count == 1


@respx.mock
async def test_429_pauses_the_collector():
    url = "http://tse.teste/oficial/c.json"
    respx.get(url).mock(return_value=httpx.Response(429))
    fetcher = Fetcher(max_rps=1000)
    assert (await fetcher.get(url, attempts=1)).status == 429
    assert fetcher.pause_until > time.monotonic() + 20


async def test_token_bucket_high_priority_goes_first():
    import asyncio

    bucket = TokenBucket(rate=100, capacity=1)
    order: list[str] = []

    async def request(name: str, high_priority: bool) -> None:
        await bucket.acquire(high_priority)
        order.append(name)

    low = [asyncio.create_task(request(f"b{i}", False)) for i in range(5)]
    await asyncio.sleep(0)
    high = [asyncio.create_task(request(f"a{i}", True)) for i in range(3)]
    await asyncio.gather(*low, *high)
    # the first low-priority request may take the token already in the bucket; after that, high goes first
    assert order.index("a2") < order.index("b2")


@respx.mock
async def test_section_retries_the_ballot_report_if_it_failed():
    """A failed BU must not block the section: the auxiliary file is read again without an ETag (no 304)."""
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.collector.collector import Collector
    from app.core.config import Settings

    collector = Collector(Settings(tse_verificar_jws=False), None, None, Fetcher(max_rps=1000))  # type: ignore[arg-type]
    collector.urls = MagicMock()
    collector.urls.auxiliar_secao.return_value = "http://tse.teste/aux.json"
    collector.urls.arquivo_urna.return_value = "http://tse.teste/h/o.bu"
    aux = b'{"st": "Totalizada", "hashes": [{"hash": "h", "st": "Totalizado", "dr": "04/10/2026", "hr": "17:30:00", "nmarq": ["o.bu"]}]}'
    aux_route = respx.get("http://tse.teste/aux.json").mock(
        return_value=httpx.Response(200, content=aux, headers={"ETag": '"1"'})
    )
    respx.get("http://tse.teste/h/o.bu").mock(
        side_effect=[httpx.Response(404), httpx.Response(200, content=b"BU")]
    )
    with patch("app.infra.queue.enqueue", new=AsyncMock()) as enqueue:
        await collector.process_section(1, "ce", 1234, 64, 16, high_priority=True)
        assert enqueue.await_count == 0
        collector.fetcher.clear_404()
        await collector.process_section(1, "ce", 1234, 64, 16, high_priority=True)
    assert "If-None-Match" not in aux_route.calls[1].request.headers
    assert enqueue.await_count == 1 and enqueue.await_args.kwargs["high_priority"] is True
