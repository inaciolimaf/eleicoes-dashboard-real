"""Cliente HTTP do coletor: limite de taxa, ETag/304, memória de 404 e retentativa."""

import time

import httpx
import respx

from app.collector.fetcher import Fetcher, TokenBucket


async def test_token_bucket_nao_passa_do_teto():
    bucket = TokenBucket(taxa=50, capacidade=1)
    inicio = time.monotonic()
    for _ in range(26):
        await bucket.adquirir()
    assert time.monotonic() - inicio >= 0.45  # 25 tokens a 50/s após o primeiro


@respx.mock
async def test_etag_304_consome_token_e_nao_baixa_de_novo():
    url = "http://tse.teste/oficial/a.json"
    rota = respx.get(url).mock(side_effect=[
        httpx.Response(200, content=b"{}", headers={"ETag": '"1"'}),
        httpx.Response(304),
    ])
    f = Fetcher(max_rps=1000)
    r1 = await f.get(url)
    r2 = await f.get(url)
    assert (r1.status, r1.corpo) == (200, b"{}")
    assert r2.status == 304 and r2.corpo is None
    assert rota.calls[1].request.headers["If-None-Match"] == '"1"'
    assert f.metricas.por_status == {200: 1, 304: 1}


@respx.mock
async def test_404_nao_e_requisitado_de_novo():
    url = "http://tse.teste/oficial/nao-existe.json"
    rota = respx.get(url).mock(return_value=httpx.Response(404))
    f = Fetcher(max_rps=1000)
    assert (await f.get(url)).status == 404
    assert (await f.get(url)).status == 404
    assert rota.call_count == 1
    f.limpar_404()
    await f.get(url)
    assert rota.call_count == 2


@respx.mock
async def test_retentativa_em_erro_5xx():
    url = "http://tse.teste/oficial/b.json"
    respx.get(url).mock(side_effect=[httpx.Response(503), httpx.Response(200, content=b"ok")])
    f = Fetcher(max_rps=1000)
    f.bucket.taxa = 10000
    r = await f.get(url)
    assert r.status == 200 and r.corpo == b"ok"
