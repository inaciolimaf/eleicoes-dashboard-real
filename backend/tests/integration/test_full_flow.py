"""Full flow: TSE mock (in process) -> collector -> queue -> worker -> database -> API."""

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func, select

import tse_fake.main as fake
from app.collector.collector import Collector
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
from app.modules.results import queries as results_queries
from app.worker.jobs import Processor, result
from app.worker.jobs.publishing import Outbox
from tests.integration.support import clean_database
from tse_fake.publication import Publication
from tse_fake.scenario import Scenario

pytestmark = pytest.mark.integration

TEST_STATE = "ac"


async def drain_queue(redis, proc: Processor) -> int:
    n = 0
    while True:
        item = await queue.dequeue(redis, timeout=0)
        if item is None:
            return n
        await proc.process(*item)
        n += 1


async def collect_until(
    collector: Collector, proc: Processor, redis, minutos: float, states=(TEST_STATE, "df")
) -> None:
    fake.state.clock.adjust(go_to=minutos * 60, paused=True)
    await collector.tracking_cycle()
    await collector.primary_cycle()
    # processes only the municipalities of the test states (the whole of Brazil would make the test slow)
    pending = []
    while not collector.municipality_queue.empty():
        _, _, round_number, mid = collector.municipality_queue.get_nowait()
        collector.pending_municipalities.discard((round_number, mid))
        if mid[:2] in states:
            pending.append((round_number, mid))
    for round_number, mid in pending:
        collector.last_municipality_collection.pop((round_number, mid), None)
        await collector.process_municipality(round_number, mid)
    while not collector.section_queue.empty():
        _, _, round_number, state_code, municipality_code, zone, section = (
            collector.section_queue.get_nowait()
        )
        collector.pending_sections.discard(f"{state_code}{municipality_code:05d}-z{zone:04d}-s{section:04d}")
        await collector.process_section(round_number, state_code, municipality_code, zone, section)
    await drain_queue(redis, proc)


@pytest_asyncio.fixture(scope="module")
async def ambiente(engine, redis_cliente):
    await clean_database(engine)
    await redis_cliente.flushdb()
    fake.state.scenario = Scenario(seed=5, scale=0.05)
    fake.state.publication = Publication(fake.state.scenario)
    fake.state.clock = fake.Clock(1.0, -120)
    fake.state.cache = fake.OrderedDict()
    cliente = httpx.AsyncClient(transport=httpx.ASGITransport(app=fake.app))
    s = get_settings().model_copy(
        update={
            "interval_min_municipality": 0,
            # the full flow sweeps the sections; the on-demand mode has its own test
            "section_mode": "todas",
        }
    )
    collector = Collector(s, get_sessionmaker(), redis_cliente, Fetcher(10000, 16, client=cliente))
    proc = Processor(get_sessionmaker(), redis_cliente)
    assert await collector.refresh_catalog()
    await collector.primary_cycle()
    await drain_queue(redis_cliente, proc)
    yield collector, proc
    await cliente.aclose()


@pytest_asyncio.fixture(scope="module")
async def api():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://teste") as cli:
        yield cli


async def test_catalog_municipalities_and_places_loaded(ambiente):
    async with get_sessionmaker()() as s:
        assert (await s.execute(select(func.count()).select_from(Municipality))).scalar_one() > 5000
        assert (await s.execute(select(func.count()).select_from(PollingPlace))).scalar_one() > 1000
        sp = (await s.execute(select(Municipality).where(Municipality.ibge_code == 3550308))).scalar_one()
        assert sp.is_capital and sp.name == "São Paulo" and sp.lat is not None


async def test_before_17h_results_are_zero(ambiente):
    async with get_sessionmaker()() as s:
        line = await results_queries.tse_line(s, 1, 1, "country", "br", None)
        assert line is not None and line["pct_sections"] == 0 and line["valid_votes"] == 0


async def test_partial_tally_and_snapshots(ambiente, redis_cliente):
    collector, proc = ambiente
    await collect_until(collector, proc, redis_cliente, 40)
    await collect_until(collector, proc, redis_cliente, 75)
    async with get_sessionmaker()() as s:
        br = await results_queries.build_result(s, 1, 1, parse("br"))
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
                .where(CurrentResult.level == "municipality", CurrentResult.state_code == TEST_STATE)
            )
        ).scalar_one()
        assert muns > 0
        assert (await s.execute(select(func.count()).select_from(BallotBoxReport))).scalar_one() > 0


async def test_simulated_clock(ambiente):
    async with get_sessionmaker()() as s:
        now = await results_queries.build_result(s, 1, 1, parse("br"))
        line = await results_queries.timeline(s, 1)
        from datetime import datetime

        meio = (
            datetime.fromisoformat(line["start"])
            + (datetime.fromisoformat(line["end"]) - datetime.fromisoformat(line["start"])) / 2
        )
        before = await results_queries.build_result(s, 1, 1, parse("br"), meio)
        assert before["totals"]["pct_sections"] < now["totals"]["pct_sections"]
        series = await results_queries.series(s, 1, 1, parse("br"), None, None)
        pcts = [p["pct_sections"] for p in series["points"]]
        assert pcts == sorted(pcts) and len(pcts) >= 3


async def test_polling_place_and_section_from_ballot_report(ambiente):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(BallotBoxReport).limit(1))).scalar_one()
        local_result = await results_queries.build_result(s, 1, 1, parse(b.polling_place_id))
        assert local_result["source"] == "soma_bu" and local_result["coverage"]["collected_sections"] >= 1
        assert local_result["candidates"] and local_result["candidates"][0]["ballot_name"]
        section = await results_queries.section_detail(s, 1, b.polling_section_id)
        assert section["status"] == "tallied" and section["offices"][0]["office_code"] == 1
        pres = section["offices"][0]
        assert pres["valid_votes"] + pres["blank_votes"] + pres["null_votes"] == pres["turnout"]
        markers = await results_queries.polling_place_map(
            s, 1, 1, results_queries.MapQuery(municipality=b.municipality_id), None
        )
        assert any(i["status"] in ("partial", "tallied") for i in markers["items"])
        detail = await results_queries.polling_place_detail(s, 1, b.polling_place_id)
        assert any(sec["status"] == "tallied" for sec in detail["sections"])


def _sections_in_queue(collector: Collector) -> set[str]:
    itens = []
    while not collector.section_queue.empty():
        itens.append(collector.section_queue.get_nowait())
    for item in itens:
        collector.section_queue.put_nowait(item)
    return {f"{state_code}{mun:05d}-z{zone:04d}-s{sec:04d}" for _, _, _, state_code, mun, zone, sec in itens}


async def test_sections_on_demand(ambiente, api, redis_cliente):
    collector, proc = ambiente
    # The configuration is immutable: the collector gets a copy with the on-demand mode.
    s_original = collector.settings
    collector.settings = get_settings().model_copy(update={"section_mode": "sob_demanda"})
    try:
        while not collector.section_queue.empty():
            collector.section_queue.get_nowait()
        collector.pending_sections.clear()
        collector.sections_done.clear()
        collector.section_attempts.clear()
        async with get_sessionmaker()() as sess:
            done = (
                await sess.execute(
                    select(BallotBoxReport).where(BallotBoxReport.polling_place_id.is_not(None)).limit(1)
                )
            ).scalar_one()
            local_sections = set(
                (
                    await sess.execute(
                        select(PollingSection.id).where(
                            PollingSection.polling_place_id == done.polling_place_id
                        )
                    )
                ).scalars()
            )
            com_bu = set(
                (
                    await sess.execute(
                        select(BallotBoxReport.polling_section_id).where(
                            BallotBoxReport.polling_section_id.in_(local_sections)
                        )
                    )
                ).scalars()
            )

        # opening only the municipality downloads no section
        await api.get(
            "/api/v1/results", params={"office": 1, "level": "municipality", "id": done.municipality_id}
        )
        await collector.on_demand_cycle()
        assert collector.section_queue.empty()

        # opening the polling place downloads only its sections that have no ballot report in the database yet
        assert (await api.get(f"/api/v1/polling-places/{done.polling_place_id}")).status_code == 200
        await collector.on_demand_cycle()
        assert _sections_in_queue(collector) == local_sections - com_bu
        assert done.polling_section_id not in _sections_in_queue(collector)

        # opening a loose section (without a ballot report) also enqueues; repeating the cycle does not duplicate
        async with get_sessionmaker()() as sess:
            avulsa = (
                await sess.execute(
                    select(PollingSection.id)
                    .where(
                        PollingSection.id.not_in(select(BallotBoxReport.polling_section_id)),
                        PollingSection.municipality_id != done.municipality_id,
                    )
                    .limit(1)
                )
            ).scalar_one()
        await api.get(f"/api/v1/polling-sections/{avulsa}")
        await collector.on_demand_cycle()
        before = collector.section_queue.qsize()
        await collector.on_demand_cycle()
        assert avulsa in _sections_in_queue(collector) and collector.section_queue.qsize() == before

        while not collector.section_queue.empty():
            _, _, round_number, state_code, mun, zone, sec = collector.section_queue.get_nowait()
            collector.pending_sections.discard(f"{state_code}{mun:05d}-z{zone:04d}-s{sec:04d}")
            await collector.process_section(round_number, state_code, mun, zone, sec)
        await drain_queue(redis_cliente, proc)

        # diagnostics of the polling place: what the collector and the worker did with each section
        d = (await api.get(f"/api/v1/diagnostics/polling-places/{done.polling_place_id}")).json()
        assert d["polling_place_in_db"] and d["municipality_in_db"] and d["request_registered"]
        by_id = {x["id"]: x for x in d["sections"]}
        assert set(by_id) == local_sections
        for sid in local_sections - com_bu:
            assert by_id[sid]["collector"]["aux_status"] in (200, 404)
            if by_id[sid]["collector"].get("step") == "BU enviado ao worker":
                assert by_id[sid]["worker"]["ok"] and by_id[sid]["ballot_in_db"]
    finally:
        collector.settings = s_original
        await redis_cliente.delete("sections:demand")


async def test_children_for_maps(ambiente):
    async with get_sessionmaker()() as s:
        states = await results_queries.children(s, 1, 1, parse("br"), None)
        assert states["child_level"] == "state" and len(states["items"]) == 27
        assert sum(c["wins"] for c in states["candidates"]) == sum(1 for i in states["items"] if i["leader"])
        muns = await results_queries.children(s, 1, 3, parse(TEST_STATE), None)
        with_data = [i for i in muns["items"] if i["leader"]]
        assert with_data and all(i["ibge_code"] for i in muns["items"])
        sq = with_data[0]["leader"]["tse_candidate_id"]
        with_values = await results_queries.children(s, 1, 3, parse(TEST_STATE), None, candidates=[sq])
        assert any(i["values"].get(sq, 0) > 0 for i in with_values["items"])


async def test_final_elected_and_events(ambiente, redis_cliente):
    collector, proc = ambiente
    await collect_until(collector, proc, redis_cliente, 400)
    async with get_sessionmaker()() as s:
        br = await results_queries.build_result(s, 1, 1, parse("br"))
        assert br["final_tally"] and br["totals"]["pct_sections"] == 100
        topo = br["candidates"][0]
        assert topo["status"] in ("ELECTED", "RUNOFF")
        dep = await results_queries.build_result(s, 1, 6, parse(TEST_STATE))
        eleitos = [c for c in dep["candidates"] if c["status"] == "ELECTED"]
        assert len(eleitos) == 8 and sum(a["seats"] or 0 for a in dep["alliances"]) == 8
        assert (
            await s.execute(select(func.count()).select_from(Candidate).where(Candidate.elected.is_(True)))
        ).scalar_one() >= 8
        types = {e.type for e in (await s.execute(select(Event))).scalars()}
        assert {"start", "milestone"} <= types and ({"elected", "runoff"} & types)


# ------------------------------------------------------------------ HTTP API over the same data


async def test_api_results_and_maps(ambiente, api):
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
    r = await api.get("/api/v1/maps/polling-places", params={"office": 1, "state_code": TEST_STATE})
    assert r.status_code == 200 and r.json()["items"][0]["status"] in ("not_received", "partial", "tallied")
    r = await api.get(
        "/api/v1/maps/polling-places", params={"office": 1, "bbox": "-80,-40,-30,10", "limit": 10}
    )
    assert r.json()["truncated"] is True
    assert (await api.get("/api/v1/results", params={"level": "state", "id": "xx9"})).status_code == 422


async def test_api_progress_events_timeline_search_export(ambiente, api):
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
        "/api/v1/exports", params={"resource": "children", "office": 3, "level": "state", "id": TEST_STATE}
    )
    assert csv.status_code == 200 and "lider_nome" in csv.text.splitlines()[0]
    cands = (await api.get("/api/v1/candidates", params={"office": 1})).json()
    det = (await api.get(f"/api/v1/candidates/{cands[0]['tse_candidate_id']}")).json()
    assert det["result"]["votes"] > 0
    foto = await api.get(f"/api/v1/candidates/{cands[0]['tse_candidate_id']}/photo")
    assert foto.status_code in (200, 404)
    st = (await api.get("/api/v1/status")).json()
    assert st["tse_environment"] == "fake" and st["pct_sections_br"] == 100


async def test_api_zone_polling_place_section_and_series(ambiente, api):
    async with get_sessionmaker()() as s:
        b = (await s.execute(select(BallotBoxReport).limit(1))).scalar_one()
    zone = await api.get(
        "/api/v1/geo-areas/children", params={"office": 1, "level": "zone", "id": b.electoral_zone_id}
    )
    assert zone.status_code == 200 and zone.json()["child_level"] == "polling_place"
    assert any(i["status"] != "not_received" for i in zone.json()["items"])
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
    res_zone = await api.get(
        "/api/v1/results", params={"office": 1, "level": "zone", "id": b.electoral_zone_id}
    )
    assert not res_zone.json()["no_data"]
    series = await api.get(
        "/api/v1/results/series", params={"office": 1, "level": "state", "id": TEST_STATE, "max_points": 10}
    )
    assert series.status_code == 200 and len(series.json()["points"]) <= 11
    lt = (await api.get("/api/v1/timeline")).json()
    locs_t = await api.get(
        "/api/v1/maps/polling-places",
        params={"office": 1, "municipality": b.municipality_id, "at": lt["end"]},
    )
    assert any(i["status"] != "not_received" for i in locs_t.json()["items"])
    assert (await api.get("/api/v1/maps/polling-places", params={"bbox": "x"})).status_code == 422
    children_t = await api.get(
        "/api/v1/geo-areas/children",
        params={"office": 1, "level": "state", "id": TEST_STATE, "at": lt["end"]},
    )
    assert children_t.status_code == 200
    prog_t = await api.get("/api/v1/progress", params={"at": lt["end"]})
    assert prog_t.json()["country"]["pct_sections"] > 0
    json_exp = await api.get("/api/v1/exports", params={"resource": "results", "format": "json"})
    assert json_exp.headers["content-disposition"].endswith('.json"')
    assert (await api.get("/api/v1/exports", params={"resource": "x"})).status_code == 422
    busca = (await api.get("/api/v1/search", params={"q": "zona 1"})).json()
    assert any(i["type"] == "zone" for i in busca["items"])
    cands = (await api.get("/api/v1/candidates", params={"office": 3, "state_code": TEST_STATE})).json()
    assert cands and all(c["state_code"] == TEST_STATE for c in cands)
    assert (await api.get("/api/v1/candidates/000")).status_code == 404
    assert (await api.get("/api/v1/elections")).json()[0]["offices"]


async def test_alerts_fire_in_worker(ambiente, redis_cliente):
    from app.modules.accounts import User
    from app.modules.alerts import Alert
    from app.modules.alerts import evaluation as alerts

    _collector, _proc = ambiente
    async with get_sessionmaker()() as s:
        u = User(email="alerta@x.com", name="A", password_hash="x")
        s.add(u)
        await s.commit()
        br = await results_queries.build_result(s, 1, 1, parse("br"))
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
                    params={"level": "state", "geo_area_id": TEST_STATE, "threshold": 1},
                ),
            ]
        )
        await s.commit()
    alerts.invalidate_cache()
    line = {
        "office_code": 1,
        "level": "country",
        "geo_area_id": "br",
        "pct_sections": 100,
        "candidates": [{"sq": sq, "p": 40.0}],
    }
    async with unit_of_work(get_sessionmaker()) as s:
        await result._alerts_result(s, Outbox(), line, [])
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
    assert alerts.evaluate_result(a, {"office_code": 3, "level": "x", "geo_area_id": "y"}, [ev]) == (
        "t",
        "d",
    )
    e = Alert(type="elected", params={"tse_candidate_id": "1"})
    assert alerts.evaluate_result(
        e,
        {"office_code": 3, "level": "x", "geo_area_id": "y"},
        [{"type": "elected", "payload": {"tse_candidate_id": "1"}, "title": "a", "description": "b"}],
    )
    loc = Alert(type="polling_place_tallied", params={"polling_place_id": "x"})
    assert alerts.evaluate_polling_place(loc, "x", "tallied") and not alerts.evaluate_polling_place(
        loc, "x", "partial"
    )
