"""Fluxo completo: mock do TSE (em processo) -> coletor -> fila -> worker -> banco -> API."""

import httpx
import pytest_asyncio
from sqlalchemy import func, select

import tse_fake.main as fake
from app.collector.collector import Coletor
from app.collector.fetcher import Fetcher
from app.core.config import get_settings
from app.core.db import get_sessionmaker, unit_of_work
from app.core.main import app
from app.infra import queue
from app.modules.ballot_reports import BallotBoxReport
from app.modules.elections import Candidate
from app.modules.events import Event
from app.modules.geography import Municipality, PollingPlace, PollingSection, parse
from app.modules.results import CurrentResult, ResultSnapshot
from app.modules.results import queries as resultados
from app.worker.jobs import Processor, result
from app.worker.jobs.publishing import Outbox
from tests.conftest import limpar_banco
from tse_fake.cenario import Cenario
from tse_fake.divulgacao import Divulgacao

UF_TESTE = "ac"


async def drenar_fila(redis, proc: Processor) -> int:
    n = 0
    while True:
        item = await queue.dequeue(redis, timeout=0)
        if item is None:
            return n
        await proc.process(*item)
        n += 1


async def coletar_ate(coletor: Coletor, proc: Processor, redis, minutos: float, ufs=(UF_TESTE, "df")) -> None:
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
    s = get_settings().model_copy(
        update={
            "intervalo_min_municipio": 0,
            # o fluxo completo varre as seções; o modo sob demanda tem teste próprio
            "modo_secoes": "todas",
        }
    )
    coletor = Coletor(s, get_sessionmaker(), redis_cliente, Fetcher(10000, 16, cliente=cliente))
    proc = Processor(get_sessionmaker(), redis_cliente)
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
        assert (await s.execute(select(func.count()).select_from(Municipality))).scalar_one() > 5000
        assert (await s.execute(select(func.count()).select_from(PollingPlace))).scalar_one() > 1000
        sp = (await s.execute(select(Municipality).where(Municipality.ibge_code == 3550308))).scalar_one()
        assert sp.is_capital and sp.name == "São Paulo" and sp.lat is not None


async def test_antes_das_17h_resultados_zerados(ambiente):
    async with get_sessionmaker()() as s:
        linha = await resultados.linha_tse(s, 1, 1, "country", "br", None)
        assert linha is not None and linha["pct_sections"] == 0 and linha["valid_votes"] == 0


async def test_apuracao_parcial_e_snapshots(ambiente, redis_cliente):
    coletor, proc = ambiente
    await coletar_ate(coletor, proc, redis_cliente, 40)
    await coletar_ate(coletor, proc, redis_cliente, 75)
    async with get_sessionmaker()() as s:
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        assert not br["no_data"] and 0 < br["totals"]["pct_sections"] < 100
        assert br["jws_verified"] is True
        assert br["totals"]["valid_votes"] == sum(c["votes"] for c in br["candidates"])
        assert br["candidates"][0]["status"] in ("LEADING", "MATHEMATICALLY_ELECTED")
        n_snap = (
            await s.execute(
                select(func.count())
                .select_from(ResultSnapshot)
                .where(ResultSnapshot.level == "country", ResultSnapshot.office_code == 1)
            )
        ).scalar_one()
        assert n_snap >= 3
        muns = (
            await s.execute(
                select(func.count())
                .select_from(CurrentResult)
                .where(CurrentResult.level == "municipality", CurrentResult.state_code == UF_TESTE)
            )
        ).scalar_one()
        assert muns > 0
        assert (await s.execute(select(func.count()).select_from(BallotBoxReport))).scalar_one() > 0


async def test_maquina_do_tempo(ambiente):
    async with get_sessionmaker()() as s:
        agora = await resultados.montar_resultado(s, 1, 1, parse("br"))
        linha = await resultados.linha_do_tempo(s, 1)
        from datetime import datetime

        meio = (
            datetime.fromisoformat(linha["start"])
            + (datetime.fromisoformat(linha["end"]) - datetime.fromisoformat(linha["start"])) / 2
        )
        antes = await resultados.montar_resultado(s, 1, 1, parse("br"), meio)
        assert antes["totals"]["pct_sections"] < agora["totals"]["pct_sections"]
        serie = await resultados.serie(s, 1, 1, parse("br"), None, None)
        pcts = [p["pct_sections"] for p in serie["points"]]
        assert pcts == sorted(pcts) and len(pcts) >= 3


async def test_local_de_votacao_e_secao_por_boletim(ambiente):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(BallotBoxReport).limit(1))).scalar_one()
        local = await resultados.montar_resultado(s, 1, 1, parse(b.polling_place_id))
        assert local["source"] == "soma_bu" and local["coverage"]["collected_sections"] >= 1
        assert local["candidates"] and local["candidates"][0]["ballot_name"]
        secao = await resultados.detalhe_secao(s, 1, b.polling_section_id)
        assert secao["status"] == "tallied" and secao["offices"][0]["office_code"] == 1
        pres = secao["offices"][0]
        assert pres["valid_votes"] + pres["blank_votes"] + pres["null_votes"] == pres["turnout"]
        mapa = await resultados.locais_mapa(
            s, 1, 1, resultados.ConsultaMapa(municipio=b.municipality_id), None
        )
        assert any(i["status"] in ("partial", "tallied") for i in mapa["items"])
        detalhe = await resultados.detalhe_local(s, 1, b.polling_place_id)
        assert any(sec["status"] == "tallied" for sec in detalhe["sections"])


def _secoes_na_fila(coletor: Coletor) -> set[str]:
    itens = []
    while not coletor.fila_sec.empty():
        itens.append(coletor.fila_sec.get_nowait())
    for item in itens:
        coletor.fila_sec.put_nowait(item)
    return {f"{uf}{mun:05d}-z{zona:04d}-s{sec:04d}" for _, _, _, uf, mun, zona, sec in itens}


async def test_secoes_sob_demanda(ambiente, api, redis_cliente):
    coletor, proc = ambiente
    # A configuração é imutável: o coletor recebe uma cópia com o modo sob demanda.
    s_original = coletor.s
    coletor.s = get_settings().model_copy(update={"modo_secoes": "sob_demanda"})
    try:
        while not coletor.fila_sec.empty():
            coletor.fila_sec.get_nowait()
        coletor.pendentes_sec.clear()
        coletor.secoes_feitas.clear()
        coletor.tentativa_sec.clear()
        async with get_sessionmaker()() as sess:
            feito = (
                await sess.execute(
                    select(BallotBoxReport).where(BallotBoxReport.polling_place_id.is_not(None)).limit(1)
                )
            ).scalar_one()
            do_local = set(
                (
                    await sess.execute(
                        select(PollingSection.id).where(
                            PollingSection.polling_place_id == feito.polling_place_id
                        )
                    )
                ).scalars()
            )
            com_bu = set(
                (
                    await sess.execute(
                        select(BallotBoxReport.polling_section_id).where(
                            BallotBoxReport.polling_section_id.in_(do_local)
                        )
                    )
                ).scalars()
            )

        # abrir só o município não baixa seção nenhuma
        await api.get(
            "/api/v1/results", params={"office": 1, "level": "municipality", "id": feito.municipality_id}
        )
        await coletor.ciclo_sob_demanda()
        assert coletor.fila_sec.empty()

        # abrir o local baixa só as seções dele que ainda não têm boletim no banco
        assert (await api.get(f"/api/v1/polling-places/{feito.polling_place_id}")).status_code == 200
        await coletor.ciclo_sob_demanda()
        assert _secoes_na_fila(coletor) == do_local - com_bu
        assert feito.polling_section_id not in _secoes_na_fila(coletor)

        # abrir uma seção avulsa (sem boletim) também enfileira; repetir o ciclo não duplica
        async with get_sessionmaker()() as sess:
            avulsa = (
                await sess.execute(
                    select(PollingSection.id)
                    .where(
                        PollingSection.id.not_in(select(BallotBoxReport.polling_section_id)),
                        PollingSection.municipality_id != feito.municipality_id,
                    )
                    .limit(1)
                )
            ).scalar_one()
        await api.get(f"/api/v1/polling-sections/{avulsa}")
        await coletor.ciclo_sob_demanda()
        antes = coletor.fila_sec.qsize()
        await coletor.ciclo_sob_demanda()
        assert avulsa in _secoes_na_fila(coletor) and coletor.fila_sec.qsize() == antes

        while not coletor.fila_sec.empty():
            _, _, turno, uf, mun, zona, sec = coletor.fila_sec.get_nowait()
            coletor.pendentes_sec.discard(f"{uf}{mun:05d}-z{zona:04d}-s{sec:04d}")
            await coletor.processar_secao(turno, uf, mun, zona, sec)
        await drenar_fila(redis_cliente, proc)

        # diagnostics of the polling place: what the collector and the worker did with each section
        d = (await api.get(f"/api/v1/diagnostics/polling-places/{feito.polling_place_id}")).json()
        assert d["polling_place_in_db"] and d["municipality_in_db"] and d["request_registered"]
        por_id = {x["id"]: x for x in d["sections"]}
        assert set(por_id) == do_local
        for sid in do_local - com_bu:
            assert por_id[sid]["collector"]["aux_status"] in (200, 404)
            if por_id[sid]["collector"].get("step") == "BU enviado ao worker":
                assert por_id[sid]["worker"]["ok"] and por_id[sid]["ballot_in_db"]
    finally:
        coletor.s = s_original
        await redis_cliente.delete("sections:demand")


async def test_filhos_para_mapas(ambiente):
    async with get_sessionmaker()() as s:
        ufs = await resultados.filhos(s, 1, 1, parse("br"), None)
        assert ufs["child_level"] == "state" and len(ufs["items"]) == 27
        assert sum(c["wins"] for c in ufs["candidates"]) == sum(1 for i in ufs["items"] if i["leader"])
        muns = await resultados.filhos(s, 1, 3, parse(UF_TESTE), None)
        com_dados = [i for i in muns["items"] if i["leader"]]
        assert com_dados and all(i["ibge_code"] for i in muns["items"])
        sq = com_dados[0]["leader"]["tse_candidate_id"]
        com_valores = await resultados.filhos(s, 1, 3, parse(UF_TESTE), None, candidatos=[sq])
        assert any(i["values"].get(sq, 0) > 0 for i in com_valores["items"])


async def test_final_eleitos_e_eventos(ambiente, redis_cliente):
    coletor, proc = ambiente
    await coletar_ate(coletor, proc, redis_cliente, 400)
    async with get_sessionmaker()() as s:
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        assert br["final_tally"] and br["totals"]["pct_sections"] == 100
        topo = br["candidates"][0]
        assert topo["status"] in ("ELECTED", "RUNOFF")
        dep = await resultados.montar_resultado(s, 1, 6, parse(UF_TESTE))
        eleitos = [c for c in dep["candidates"] if c["status"] == "ELECTED"]
        assert len(eleitos) == 8 and sum(a["seats"] or 0 for a in dep["alliances"]) == 8
        assert (
            await s.execute(select(func.count()).select_from(Candidate).where(Candidate.elected.is_(True)))
        ).scalar_one() >= 8
        tipos = {e.type for e in (await s.execute(select(Event))).scalars()}
        assert {"start", "milestone"} <= tipos and ({"elected", "runoff"} & tipos)


# ------------------------------------------------------------------ API HTTP sobre os mesmos dados


async def test_api_resultados_e_mapas(ambiente, api):
    r = await api.get("/api/v1/results", params={"office": 1, "level": "country", "id": "br"})
    assert r.status_code == 200
    d = r.json()
    assert d["totals"]["valid_votes"] > 0 and {"status", "overall_status", "elected", "color"} <= set(
        d["candidates"][0]
    )
    r = await api.get(
        "/api/v1/geo-areas/children",
        params={"office": 1, "level": "country", "id": "br", "child_level": "municipality"},
    )
    assert r.status_code == 200 and len(r.json()["items"]) > 5000
    r = await api.get("/api/v1/maps/polling-places", params={"office": 1, "state_code": UF_TESTE})
    assert r.status_code == 200 and r.json()["items"][0]["status"] in ("not_received", "partial", "tallied")
    r = await api.get(
        "/api/v1/maps/polling-places", params={"office": 1, "bbox": "-80,-40,-30,10", "limit": 10}
    )
    assert r.json()["truncated"] is True
    assert (await api.get("/api/v1/results", params={"level": "state", "id": "xx9"})).status_code == 422


async def test_api_progresso_eventos_tempo_busca_export(ambiente, api):
    p = (await api.get("/api/v1/progress")).json()
    assert p["country"]["pct_sections"] == 100 and len(p["items"]) == 27
    ev = (await api.get("/api/v1/events", params={"limit": 5})).json()
    assert ev and {"type", "title", "occurred_at"} <= set(ev[0])
    lt = (await api.get("/api/v1/timeline")).json()
    assert lt["start"] < lt["end"]
    meio = (await api.get("/api/v1/results", params={"office": 1, "at": lt["start"]})).json()
    assert meio["totals"]["pct_sections"] < 100
    busca = (await api.get("/api/v1/search", params={"q": "sao paulo"})).json()
    assert any(i["type"] == "municipality" and i["title"] == "São Paulo" for i in busca["items"])
    csv = await api.get(
        "/api/v1/exports", params={"resource": "children", "office": 3, "level": "state", "id": UF_TESTE}
    )
    assert csv.status_code == 200 and "lider_nome" in csv.text.splitlines()[0]
    cands = (await api.get("/api/v1/candidates", params={"office": 1})).json()
    det = (await api.get(f"/api/v1/candidates/{cands[0]['tse_candidate_id']}")).json()
    assert det["result"]["votes"] > 0
    foto = await api.get(f"/api/v1/candidates/{cands[0]['tse_candidate_id']}/photo")
    assert foto.status_code in (200, 404)
    st = (await api.get("/api/v1/status")).json()
    assert st["tse_environment"] == "fake" and st["pct_sections_br"] == 100


async def test_api_zona_local_secao_e_serie(ambiente, api):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(BallotBoxReport).limit(1))).scalar_one()
    zona = await api.get(
        "/api/v1/geo-areas/children", params={"office": 1, "level": "zone", "id": b.electoral_zone_id}
    )
    assert zona.status_code == 200 and zona.json()["child_level"] == "polling_place"
    assert any(i["status"] != "not_received" for i in zona.json()["items"])
    secs = await api.get(
        "/api/v1/geo-areas/children", params={"office": 1, "level": "polling_place", "id": b.polling_place_id}
    )
    assert secs.json()["child_level"] == "section" and secs.json()["items"]
    mun = await api.get(
        "/api/v1/geo-areas/children", params={"office": 1, "level": "municipality", "id": b.municipality_id}
    )
    assert mun.json()["child_level"] == "zone"
    loc = await api.get(f"/api/v1/polling-places/{b.polling_place_id}")
    assert loc.status_code == 200 and loc.json()["sections"]
    assert (await api.get("/api/v1/polling-places/xx00000-z0001-l0001")).status_code == 404
    sec = await api.get(f"/api/v1/polling-sections/{b.polling_section_id}")
    assert sec.status_code == 200 and sec.json()["hash"]
    assert (await api.get("/api/v1/polling-sections/invalido")).status_code == 422
    assert (await api.get("/api/v1/polling-sections/ac99999-z0001-s0001")).status_code == 404
    res_sec = await api.get(
        "/api/v1/results", params={"office": 1, "level": "section", "id": b.polling_section_id}
    )
    assert res_sec.json()["source"] == "soma_bu"
    res_zona = await api.get(
        "/api/v1/results", params={"office": 1, "level": "zone", "id": b.electoral_zone_id}
    )
    assert not res_zona.json()["no_data"]
    serie = await api.get(
        "/api/v1/results/series", params={"office": 1, "level": "state", "id": UF_TESTE, "max_points": 10}
    )
    assert serie.status_code == 200 and len(serie.json()["points"]) <= 11
    lt = (await api.get("/api/v1/timeline")).json()
    locs_t = await api.get(
        "/api/v1/maps/polling-places",
        params={"office": 1, "municipality": b.municipality_id, "at": lt["end"]},
    )
    assert any(i["status"] != "not_received" for i in locs_t.json()["items"])
    assert (await api.get("/api/v1/maps/polling-places", params={"bbox": "x"})).status_code == 422
    filhos_t = await api.get(
        "/api/v1/geo-areas/children", params={"office": 1, "level": "state", "id": UF_TESTE, "at": lt["end"]}
    )
    assert filhos_t.status_code == 200
    prog_t = await api.get("/api/v1/progress", params={"at": lt["end"]})
    assert prog_t.json()["country"]["pct_sections"] > 0
    json_exp = await api.get("/api/v1/exports", params={"resource": "results", "format": "json"})
    assert json_exp.headers["content-disposition"].endswith('.json"')
    assert (await api.get("/api/v1/exports", params={"resource": "x"})).status_code == 422
    busca = (await api.get("/api/v1/search", params={"q": "zona 1"})).json()
    assert any(i["type"] == "zone" for i in busca["items"])
    cands = (await api.get("/api/v1/candidates", params={"office": 3, "state_code": UF_TESTE})).json()
    assert cands and all(c["state_code"] == UF_TESTE for c in cands)
    assert (await api.get("/api/v1/candidates/000")).status_code == 404
    assert (await api.get("/api/v1/elections")).json()[0]["offices"]


async def test_alertas_disparam_no_worker(ambiente, redis_cliente):
    from app.modules.accounts import User
    from app.modules.alerts import Alert
    from app.modules.alerts import evaluation as alertas

    _coletor, _proc = ambiente
    async with get_sessionmaker()() as s:
        u = User(email="alerta@x.com", name="A", password_hash="x")
        s.add(u)
        await s.commit()
        br = await resultados.montar_resultado(s, 1, 1, parse("br"))
        sq = br["candidates"][0]["tse_candidate_id"]
        s.add_all(
            [
                Alert(
                    user_id=u.id,
                    type="candidate_pct",
                    params={
                        "office_code": 1,
                        "level": "country",
                        "geo_area_id": "br",
                        "tse_candidate_id": sq,
                        "threshold": 1,
                    },
                ),
                Alert(
                    user_id=u.id,
                    type="tally_threshold",
                    params={"level": "state", "geo_area_id": UF_TESTE, "threshold": 1},
                ),
            ]
        )
        await s.commit()
    alertas.invalidar_cache()
    linha = {
        "office_code": 1,
        "level": "country",
        "geo_area_id": "br",
        "pct_sections": 100,
        "candidates": [{"sq": sq, "p": 40.0}],
    }
    async with unit_of_work(get_sessionmaker()) as s:
        await result._alerts_result(s, Outbox(), linha, [])
    async with get_sessionmaker()() as s:
        disparados = (await s.execute(select(Alert).where(Alert.triggered_at.is_not(None)))).scalars().all()
        assert [a.type for a in disparados] == ["candidate_pct"]
    a = Alert(type="lead_change", params={"office_code": 1, "level": "state", "geo_area_id": "mg"})
    ev = {
        "type": "lead_change",
        "office_code": 1,
        "level": "state",
        "geo_area_id": "mg",
        "title": "t",
        "description": "d",
    }
    assert alertas.avaliar_resultado(a, {"office_code": 3, "level": "x", "geo_area_id": "y"}, [ev]) == (
        "t",
        "d",
    )
    e = Alert(type="elected", params={"tse_candidate_id": "1"})
    assert alertas.avaliar_resultado(
        e,
        {"office_code": 3, "level": "x", "geo_area_id": "y"},
        [{"type": "elected", "payload": {"tse_candidate_id": "1"}, "title": "a", "description": "b"}],
    )
    loc = Alert(type="polling_place_tallied", params={"polling_place_id": "x"})
    assert alertas.avaliar_local(loc, "x", "tallied") and not alertas.avaliar_local(loc, "x", "partial")
