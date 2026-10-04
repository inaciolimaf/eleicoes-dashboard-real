"""Fila coletor -> worker: prioridade e coalescência."""

from app.worker import fila


async def test_fila_prioriza_alta_e_coalesce_versoes(redis_cliente):
    redis = redis_cliente
    await redis.delete(fila.FILA, fila.FILA_ALTA, fila.PENDENTES)
    await fila.enfileirar(redis, "resultado", b"mun-v1", chave="mun.json", n=1)
    await fila.enfileirar(redis, "resultado", b"mun-v2", chave="mun.json", n=2)  # substitui a v1
    await fila.enfileirar(redis, "boletim", b"bu", h="x")
    await fila.enfileirar(redis, "resultado", b"uf", alta=True, chave="uf.json")
    assert await fila.tamanho(redis) == 3
    assert (await fila.retirar(redis, timeout=0))[1] == b"uf"
    assert await fila.retirar(redis, timeout=0) == ("resultado", b"mun-v2", {"n": 2})
    assert (await fila.retirar(redis, timeout=0))[1] == b"bu"
    assert await fila.retirar(redis, timeout=0) is None
    # depois de retirado, uma nova versão volta a entrar na fila
    await fila.enfileirar(redis, "resultado", b"mun-v3", chave="mun.json")
    assert (await fila.retirar(redis, timeout=1))[1] == b"mun-v3"


async def test_fila_comprime_e_le_formato_antigo(redis_cliente):
    import base64

    import orjson

    corpo = b'{"cand": [' + b'{"n": 1, "v": 12345},' * 2000 + b'{}]}'
    msg = fila.mensagem("resultado", corpo, x=1)
    assert len(msg) < len(corpo) / 5
    assert fila.ler(msg) == ("resultado", corpo, {"x": 1})
    antigo = orjson.dumps({"tipo": "boletim", "corpo": base64.b64encode(b"bu").decode(), "ctx": {}})
    assert fila.ler(antigo) == ("boletim", b"bu", {})
