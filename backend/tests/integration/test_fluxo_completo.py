"""Fluxo completo: mock do TSE (em processo) -> coletor -> fila -> worker -> banco -> API."""

import httpx
import pytest_asyncio
from sqlalchemy import func, select

import tse_fake.main as fake
from app.collector.coletor import Coletor
from app.collector.fetcher import Fetcher
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import app
from app.models import Boletim, Candidato, Evento, LocalVotacao, Municipio, ResultadoAtual, Secao, Snapshot
from app.services import resultados
from app.services.recortes import parse
from app.worker import fila
from app.worker.jobs import Processador
from tests.conftest import limpar_banco
from tse_fake.cenario import Cenario
from tse_fake.divulgacao import Divulgacao

UF_TESTE = "ac"


async def drenar_fila(redis, proc: Processador) -> int:
    n = 0
    while True:
        item = await redis.rpop(fila.FILA)
        if item is None:
            return n
        await proc.processar(*fila.ler(item))
        n += 1


async def coletar_ate(coletor: Coletor, proc: Processador, redis, minutos: float, ufs=(UF_TESTE, "df")) -> None:
    fake.estado.relogio.ajustar(ir_para=minutos * 60, pausado=True)
    await coletor.ciclo_acompanhamento()
    await coletor.ciclo_principal()
    # processa só os municípios das UFs de teste (o Brasil inteiro deixaria o teste lento)
    pendentes = []
    while not coletor.fila_mun.empty():
        _, _, turno, mid = coletor.fila_mun.get_nowait()
        coletor.pendentes_mun.discard((turno, mid))
        if mid[:2] in ufs:
            pendentes.append((turno, mid))
    for turno, mid in pendentes:
        coletor.ultima_coleta_mun.pop((turno, mid), None)
        await coletor.processar_municipio(turno, mid)
    while not coletor.fila_sec.empty():
        _, _, turno, uf, cd_mun, zona, secao = coletor.fila_sec.get_nowait()
        coletor.pendentes_sec.discard(f"{uf}{cd_mun:05d}-z{zona:04d}-s{secao:04d}")
        await coletor.processar_secao(turno, uf, cd_mun, zona, secao)
    await drenar_fila(redis, proc)


@pytest_asyncio.fixture(scope="module")
async def ambiente(engine, redis_cliente):
    await limpar_banco(engine)
    await redis_cliente.flushdb()
    fake.estado.cenario = Cenario(semente=5, escala=0.05)
    fake.estado.div = Divulgacao(fake.estado.cenario)
    fake.estado.relogio = fake.Relogio(1.0, -120)
    fake.estado.cache = fake.OrderedDict()
    cliente = httpx.AsyncClient(transport=httpx.ASGITransport(app=fake.app))
    s = get_settings()
    s.intervalo_min_municipio = 0
    s.modo_secoes = "todas"  # o fluxo completo varre as seções; o modo sob demanda tem teste próprio
    coletor = Coletor(s, get_sessionmaker(), redis_cliente, Fetcher(10000, 16, cliente=cliente))
    proc = Processador(get_sessionmaker(), redis_cliente)
    assert await coletor.atualizar_catalogo()
    await coletor.ciclo_principal()
    await drenar_fila(redis_cliente, proc)
    yield coletor, proc
    await cliente.aclose()


@pytest_asyncio.fixture(scope="module")
async def api():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://teste") as cli:
        yield cli


async def test_catalogo_municipios_e_locais_carregados(ambiente):
    async with get_sessionmaker()() as s:
        assert (await s.execute(select(func.count()).select_from(Municipio))).scalar_one() > 5000
        assert (await s.execute(select(func.count()).select_from(LocalVotacao))).scalar_one() > 1000
        sp = (await s.execute(select(Municipio).where(Municipio.cd_ibge == 3550308))).scalar_one()
        assert sp.capital and sp.nome == "São Paulo" and sp.lat is not None


async def test_antes_das_17h_resultados_zerados(ambiente):
    async with get_sessionmaker()() as s:
        linha = await resultados.linha_tse(s, 1, 1, "br", "br", None)
        assert linha is not None and linha["pct_secoes"] == 0 and linha["votos_validos"] == 0


async def test_apuracao_parcial_e_snapshots(ambiente, redis_cliente):
    coletor, proc = ambiente
    await coletar_ate(coletor, proc, redis_cliente, 40)
    await coletar_ate(coletor, proc, redis_cliente, 75)
    async with get_sessionmaker()() as s:
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        assert not br["sem_dados"] and 0 < br["totais"]["pct_secoes"] < 100
        assert br["jws_verificado"] is True
        assert br["totais"]["votos_validos"] == sum(c["votos"] for c in br["candidatos"])
        assert br["candidatos"][0]["situacao"] in ("LIDERANDO", "MATEMATICAMENTE_ELEITO")
        n_snap = (await s.execute(select(func.count()).select_from(Snapshot).where(
            Snapshot.nivel == "br", Snapshot.cd_cargo == 1))).scalar_one()
        assert n_snap >= 3
        muns = (await s.execute(select(func.count()).select_from(ResultadoAtual).where(
            ResultadoAtual.nivel == "municipio", ResultadoAtual.uf == UF_TESTE))).scalar_one()
        assert muns > 0
        assert (await s.execute(select(func.count()).select_from(Boletim))).scalar_one() > 0


async def test_maquina_do_tempo(ambiente):
    async with get_sessionmaker()() as s:
        agora = await resultados.montar_resultado(s, 1, 1, parse("br"))
        linha = await resultados.linha_do_tempo(s, 1)
        from datetime import datetime

        meio = datetime.fromisoformat(linha["inicio"]) + (datetime.fromisoformat(linha["fim"]) - datetime.fromisoformat(linha["inicio"])) / 2
        antes = await resultados.montar_resultado(s, 1, 1, parse("br"), meio)
        assert antes["totais"]["pct_secoes"] < agora["totais"]["pct_secoes"]
        serie = await resultados.serie(s, 1, 1, parse("br"), None, None)
        pcts = [p["pct_secoes"] for p in serie["pontos"]]
        assert pcts == sorted(pcts) and len(pcts) >= 3


async def test_local_de_votacao_e_secao_por_boletim(ambiente):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(Boletim).limit(1))).scalar_one()
        local = await resultados.montar_resultado(s, 1, 1, parse(b.local_id))
        assert local["fonte"] == "soma_bu" and local["cobertura"]["secoes_coletadas"] >= 1
        assert local["candidatos"] and local["candidatos"][0]["nome_urna"]
        secao = await resultados.detalhe_secao(s, 1, b.secao_id)
        assert secao["status"] == "apurado" and secao["cargos"][0]["cd"] == 1
        pres = secao["cargos"][0]
        assert pres["votos_validos"] + pres["brancos"] + pres["nulos"] == pres["comparecimento"]
        mapa = await resultados.locais_mapa(s, 1, 1, None, b.municipio_id, None, None)
        assert any(i["status"] in ("parcial", "apurado") for i in mapa["itens"])
        detalhe = await resultados.detalhe_local(s, 1, b.local_id)
        assert any(sec["status"] == "apurado" for sec in detalhe["secoes"])


def _secoes_na_fila(coletor: Coletor) -> set[str]:
    itens = []
    while not coletor.fila_sec.empty():
        itens.append(coletor.fila_sec.get_nowait())
    for item in itens:
        coletor.fila_sec.put_nowait(item)
    return {f"{uf}{mun:05d}-z{zona:04d}-s{sec:04d}" for _, _, _, uf, mun, zona, sec in itens}


async def test_secoes_sob_demanda(ambiente, api, redis_cliente):
    coletor, proc = ambiente
    s = get_settings()
    s.modo_secoes = "sob_demanda"
    try:
        while not coletor.fila_sec.empty():
            coletor.fila_sec.get_nowait()
        coletor.pendentes_sec.clear()
        coletor.secoes_feitas.clear()
        coletor.tentativa_sec.clear()
        async with get_sessionmaker()() as sess:
            feito = (await sess.execute(select(Boletim).where(Boletim.local_id.is_not(None)).limit(1))).scalar_one()
            do_local = set((await sess.execute(select(Secao.id).where(Secao.local_id == feito.local_id))).scalars())
            com_bu = set((await sess.execute(select(Boletim.secao_id).where(Boletim.secao_id.in_(do_local)))).scalars())

        # abrir só o município não baixa seção nenhuma
        await api.get("/api/v1/resultados", params={"cargo": 1, "nivel": "municipio", "id": feito.municipio_id})
        await coletor.ciclo_sob_demanda()
        assert coletor.fila_sec.empty()

        # abrir o local baixa só as seções dele que ainda não têm boletim no banco
        assert (await api.get(f"/api/v1/locais/{feito.local_id}")).status_code == 200
        await coletor.ciclo_sob_demanda()
        assert _secoes_na_fila(coletor) == do_local - com_bu
        assert feito.secao_id not in _secoes_na_fila(coletor)

        # abrir uma seção avulsa (sem boletim) também enfileira; repetir o ciclo não duplica
        async with get_sessionmaker()() as sess:
            avulsa = (await sess.execute(select(Secao.id).where(
                Secao.id.not_in(select(Boletim.secao_id)), Secao.municipio_id != feito.municipio_id).limit(1))).scalar_one()
        await api.get(f"/api/v1/secoes/{avulsa}")
        await coletor.ciclo_sob_demanda()
        antes = coletor.fila_sec.qsize()
        await coletor.ciclo_sob_demanda()
        assert avulsa in _secoes_na_fila(coletor) and coletor.fila_sec.qsize() == antes

        while not coletor.fila_sec.empty():
            _, _, turno, uf, mun, zona, sec = coletor.fila_sec.get_nowait()
            coletor.pendentes_sec.discard(f"{uf}{mun:05d}-z{zona:04d}-s{sec:04d}")
            await coletor.processar_secao(turno, uf, mun, zona, sec)
        await drenar_fila(redis_cliente, proc)
    finally:
        s.modo_secoes = "todas"
        await redis_cliente.delete("secoes:demanda")


async def test_filhos_para_mapas(ambiente):
    async with get_sessionmaker()() as s:
        ufs = await resultados.filhos(s, 1, 1, parse("br"), None)
        assert ufs["nivel_filhos"] == "uf" and len(ufs["itens"]) == 27
        assert sum(c["vitorias"] for c in ufs["candidatos"]) == sum(1 for i in ufs["itens"] if i["lider"])
        muns = await resultados.filhos(s, 1, 3, parse(UF_TESTE), None)
        com_dados = [i for i in muns["itens"] if i["lider"]]
        assert com_dados and all(i["cd_ibge"] for i in muns["itens"])
        sq = com_dados[0]["lider"]["sqcand"]
        com_valores = await resultados.filhos(s, 1, 3, parse(UF_TESTE), None, candidatos=[sq])
        assert any(i["valores"].get(sq, 0) > 0 for i in com_valores["itens"])


async def test_final_eleitos_e_eventos(ambiente, redis_cliente):
    coletor, proc = ambiente
    await coletar_ate(coletor, proc, redis_cliente, 400)
    async with get_sessionmaker()() as s:
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        assert br["totalizacao_final"] and br["totais"]["pct_secoes"] == 100
        topo = br["candidatos"][0]
        assert topo["situacao"] in ("ELEITO", "SEGUNDO_TURNO")
        dep = await resultados.montar_resultado(s, 1, 6, parse(UF_TESTE))
        eleitos = [c for c in dep["candidatos"] if c["situacao"] == "ELEITO"]
        assert len(eleitos) == 8 and sum(a["vagas"] or 0 for a in dep["agremiacoes"]) == 8
        assert (await s.execute(select(func.count()).select_from(Candidato).where(Candidato.eleito.is_(True)))).scalar_one() >= 8
        tipos = {e.tipo for e in (await s.execute(select(Evento))).scalars()}
        assert {"inicio", "marco"} <= tipos and ({"eleito", "segundo_turno"} & tipos)


# ------------------------------------------------------------------ API HTTP sobre os mesmos dados


async def test_api_resultados_e_mapas(ambiente, api):
    r = await api.get("/api/v1/resultados", params={"cargo": 1, "nivel": "br", "id": "br"})
    assert r.status_code == 200
    d = r.json()
    assert d["totais"]["votos_validos"] > 0 and {"situacao", "situacao_geral", "eleito", "cor"} <= set(d["candidatos"][0])
    r = await api.get("/api/v1/recortes/filhos", params={"cargo": 1, "nivel": "br", "id": "br", "filhos": "municipio"})
    assert r.status_code == 200 and len(r.json()["itens"]) > 5000
    r = await api.get("/api/v1/mapas/locais", params={"cargo": 1, "uf": UF_TESTE})
    assert r.status_code == 200 and r.json()["itens"][0]["status"] in ("nao_recebido", "parcial", "apurado")
    r = await api.get("/api/v1/mapas/locais", params={"cargo": 1, "bbox": "-80,-40,-30,10", "limite": 10})
    assert r.json()["truncado"] is True
    assert (await api.get("/api/v1/resultados", params={"nivel": "uf", "id": "xx9"})).status_code == 422


async def test_api_progresso_eventos_tempo_busca_export(ambiente, api):
    p = (await api.get("/api/v1/progresso")).json()
    assert p["br"]["pct_secoes"] == 100 and len(p["itens"]) == 27
    ev = (await api.get("/api/v1/eventos", params={"limite": 5})).json()
    assert ev and {"tipo", "titulo", "ocorrido_em"} <= set(ev[0])
    lt = (await api.get("/api/v1/linha-do-tempo")).json()
    assert lt["inicio"] < lt["fim"]
    meio = (await api.get("/api/v1/resultados", params={"cargo": 1, "t": lt["inicio"]})).json()
    assert meio["totais"]["pct_secoes"] < 100
    busca = (await api.get("/api/v1/busca", params={"q": "sao paulo"})).json()
    assert any(i["tipo"] == "municipio" and i["titulo"] == "São Paulo" for i in busca["itens"])
    csv = await api.get("/api/v1/export", params={"recurso": "filhos", "cargo": 3, "nivel": "uf", "id": UF_TESTE})
    assert csv.status_code == 200 and "lider_nome" in csv.text.splitlines()[0]
    cands = (await api.get("/api/v1/candidatos", params={"cargo": 1})).json()
    det = (await api.get(f"/api/v1/candidatos/{cands[0]['sqcand']}")).json()
    assert det["resultado"]["votos"] > 0
    foto = await api.get(f"/api/v1/fotos/{cands[0]['sqcand']}")
    assert foto.status_code in (200, 404)
    st = (await api.get("/api/v1/status")).json()
    assert st["ambiente"] == "fake" and st["pct_secoes_br"] == 100


async def test_api_zona_local_secao_e_serie(ambiente, api):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(Boletim).limit(1))).scalar_one()
    zona = await api.get("/api/v1/recortes/filhos", params={"cargo": 1, "nivel": "zona", "id": b.zona_id})
    assert zona.status_code == 200 and zona.json()["nivel_filhos"] == "local"
    assert any(i["status"] != "nao_recebido" for i in zona.json()["itens"])
    secs = await api.get("/api/v1/recortes/filhos", params={"cargo": 1, "nivel": "local", "id": b.local_id})
    assert secs.json()["nivel_filhos"] == "secao" and secs.json()["itens"]
    mun = await api.get("/api/v1/recortes/filhos", params={"cargo": 1, "nivel": "municipio", "id": b.municipio_id})
    assert mun.json()["nivel_filhos"] == "zona"
    loc = await api.get(f"/api/v1/locais/{b.local_id}")
    assert loc.status_code == 200 and loc.json()["secoes"]
    assert (await api.get("/api/v1/locais/xx00000-z0001-l0001")).status_code == 404
    sec = await api.get(f"/api/v1/secoes/{b.secao_id}")
    assert sec.status_code == 200 and sec.json()["hash"]
    assert (await api.get("/api/v1/secoes/invalido")).status_code == 422
    assert (await api.get("/api/v1/secoes/ac99999-z0001-s0001")).status_code == 404
    res_sec = await api.get("/api/v1/resultados", params={"cargo": 1, "nivel": "secao", "id": b.secao_id})
    assert res_sec.json()["fonte"] == "soma_bu"
    res_zona = await api.get("/api/v1/resultados", params={"cargo": 1, "nivel": "zona", "id": b.zona_id})
    assert not res_zona.json()["sem_dados"]
    serie = await api.get("/api/v1/resultados/serie", params={"cargo": 1, "nivel": "uf", "id": UF_TESTE, "max_pontos": 10})
    assert serie.status_code == 200 and len(serie.json()["pontos"]) <= 11
    lt = (await api.get("/api/v1/linha-do-tempo")).json()
    locs_t = await api.get("/api/v1/mapas/locais", params={"cargo": 1, "municipio": b.municipio_id, "t": lt["fim"]})
    assert any(i["status"] != "nao_recebido" for i in locs_t.json()["itens"])
    assert (await api.get("/api/v1/mapas/locais", params={"bbox": "x"})).status_code == 422
    filhos_t = await api.get("/api/v1/recortes/filhos", params={"cargo": 1, "nivel": "uf", "id": UF_TESTE, "t": lt["fim"]})
    assert filhos_t.status_code == 200
    prog_t = await api.get("/api/v1/progresso", params={"t": lt["fim"]})
    assert prog_t.json()["br"]["pct_secoes"] > 0
    json_exp = await api.get("/api/v1/export", params={"recurso": "resultados", "formato": "json"})
    assert json_exp.headers["content-disposition"].endswith('.json"')
    assert (await api.get("/api/v1/export", params={"recurso": "x"})).status_code == 422
    busca = (await api.get("/api/v1/busca", params={"q": "zona 1"})).json()
    assert any(i["tipo"] == "zona" for i in busca["itens"])
    cands = (await api.get("/api/v1/candidatos", params={"cargo": 3, "uf": UF_TESTE})).json()
    assert cands and all(c["uf"] == UF_TESTE for c in cands)
    assert (await api.get("/api/v1/candidatos/000")).status_code == 404
    assert (await api.get("/api/v1/eleicoes")).json()[0]["cargos"]


async def test_alertas_disparam_no_worker(ambiente, redis_cliente):
    from app.models import Alerta, Usuario
    from app.services import alertas

    coletor, proc = ambiente
    async with get_sessionmaker()() as s:
        u = Usuario(email="alerta@x.com", nome="A", senha_hash="x")
        s.add(u)
        await s.commit()
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        sq = br["candidatos"][0]["sqcand"]
        s.add_all([
            Alerta(usuario_id=u.id, tipo="pct_candidato", params={"cargo": 1, "nivel": "br", "id": "br", "sqcand": sq, "limite": 1}),
            Alerta(usuario_id=u.id, tipo="apuracao", params={"nivel": "uf", "id": UF_TESTE, "limite": 1}),
        ])
        await s.commit()
    alertas.invalidar_cache()
    linha = {"cd_cargo": 1, "nivel": "br", "recorte_id": "br", "pct_secoes": 100,
             "candidatos": [{"sq": sq, "p": 40.0}]}
    async with get_sessionmaker()() as s:
        await proc._alertas_resultado(s, linha, [])
    async with get_sessionmaker()() as s:
        disparados = (await s.execute(select(Alerta).where(Alerta.disparado_em.is_not(None)))).scalars().all()
        assert [a.tipo for a in disparados] == ["pct_candidato"]
    a = Alerta(tipo="virada", params={"cargo": 1, "nivel": "uf", "id": "mg"})
    ev = {"tipo": "virada", "cd_cargo": 1, "nivel": "uf", "recorte_id": "mg", "titulo": "t", "descricao": "d"}
    assert alertas.avaliar_resultado(a, {"cd_cargo": 3, "nivel": "x", "recorte_id": "y"}, [ev]) == ("t", "d")
    e = Alerta(tipo="eleito", params={"sqcand": "1"})
    assert alertas.avaliar_resultado(e, {"cd_cargo": 3, "nivel": "x", "recorte_id": "y"},
                                     [{"tipo": "eleito", "payload": {"sqcand": "1"}, "titulo": "a", "descricao": "b"}])
    loc = Alerta(tipo="local_apurado", params={"local_id": "x"})
    assert alertas.avaliar_local(loc, "x", "apurado") and not alertas.avaliar_local(loc, "x", "parcial")
