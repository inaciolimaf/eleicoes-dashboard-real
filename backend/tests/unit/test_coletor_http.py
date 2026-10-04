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


@respx.mock
async def test_jws_com_chave_errada_cai_para_o_json():
    """Se a chave/kid do TSE não bater, o coletor não pode parar de atualizar: usa o .json."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.collector.coletor import Coletor
    from app.core.config import Settings
    from app.tse import jws

    base = "http://tse.teste/oficial/x"
    token = jws.assinar(b'{"v": 1}', Ed25519PrivateKey.generate(), "kid-desconhecido")
    rota_jws = respx.get(f"{base}.jws").mock(return_value=httpx.Response(200, content=token.encode()))
    respx.get(f"{base}.json").mock(return_value=httpx.Response(200, content=b'{"v": 2}'))
    c = Coletor(Settings(tse_verificar_jws=True), None, None, Fetcher(max_rps=1000))  # type: ignore[arg-type]
    assert await c.obter(f"{base}.json", arquivar=False) == (200, b'{"v": 2}', False)
    assert c.fetcher.metricas.falhas_jws == 1
    # depois da falha, nem tenta mais o .jws
    await c.obter(f"{base}.json", arquivar=False)
    assert rota_jws.call_count == 1


@respx.mock
async def test_429_pausa_o_coletor():
    url = "http://tse.teste/oficial/c.json"
    respx.get(url).mock(return_value=httpx.Response(429))
    f = Fetcher(max_rps=1000)
    assert (await f.get(url, tentativas=1)).status == 429
    assert f.pausa_ate > time.monotonic() + 20
