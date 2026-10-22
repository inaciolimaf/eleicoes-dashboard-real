"""Authentication, dashboards (painéis), sharing, favorites, alerts, preferences and admin."""

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.core import db as db_mod
from app.core.main import app
from app.modules.accounts import User
from app.modules.accounts.auth import login_limit

pytestmark = pytest.mark.integration

CONFIG = {
    "filtroGlobal": {"turno": 1, "cargo": 1, "nivel": "br", "id": "br", "tempo": "agora"},
    "widgets": [{"id": "w1", "tipo": "placar", "pos": {"x": 0, "y": 0, "w": 6, "h": 4}, "herda": True}],
}


@pytest_asyncio.fixture
async def cli(clean_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://teste") as c:
        yield c


async def sign_up(cli, email="ana@exemplo.com"):
    r = await cli.post(
        "/api/v1/auth/register", json={"email": email, "password": "segredo123", "name": "Ana"}
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


async def test_register_login_and_first_user_is_admin(cli):
    h, u = await sign_up(cli)
    assert u["is_admin"] is True
    h2, u2 = await sign_up(cli, "bia@exemplo.com")
    assert u2["is_admin"] is False
    dup = await cli.post(
        "/api/v1/auth/register", json={"email": "ana@exemplo.com", "password": "segredo123", "name": "x"}
    )
    assert dup.status_code == 409
    assert dup.json()["type"] == "auth/email_taken"
    errada = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
    assert errada.status_code == 401
    ok = await cli.post("/api/v1/auth/login", json={"email": "ANA@exemplo.com", "password": "segredo123"})
    assert ok.status_code == 200
    assert (await cli.get("/api/v1/auth/me", headers=h)).json()["email"] == "ana@exemplo.com"
    assert (await cli.get("/api/v1/auth/me")).status_code == 401
    assert (await cli.get("/api/v1/admin/health", headers=h2)).status_code == 403


async def test_dashboards_crud_default_and_sharing(cli):
    h, _ = await sign_up(cli)
    p1 = (
        await cli.post(
            "/api/v1/dashboards", json={"name": "Noite", "config": CONFIG, "is_default": True}, headers=h
        )
    ).json()
    p2 = (
        await cli.post(
            "/api/v1/dashboards", json={"name": "SP", "config": CONFIG, "is_default": True}, headers=h
        )
    ).json()
    items = (await cli.get("/api/v1/dashboards", headers=h)).json()
    assert [p["name"] for p in items] == ["Noite", "SP"]
    assert [p["is_default"] for p in items] == [False, True]
    novo = {**CONFIG, "widgets": CONFIG["widgets"] * 2}
    r = await cli.put(f"/api/v1/dashboards/{p1['id']}", json={"name": "Noite 2", "config": novo}, headers=h)
    assert r.json()["name"] == "Noite 2" and len(r.json()["config"]["widgets"]) == 2
    invalid = await cli.post(
        "/api/v1/dashboards", json={"name": "x", "config": {"widgets": "nao"}}, headers=h
    )
    assert invalid.status_code == 422
    assert invalid.headers["content-type"].startswith("application/problem+json")
    sh = (await cli.post(f"/api/v1/dashboards/{p2['id']}/shares", json={"mode": "live"}, headers=h)).json()
    pub = (await cli.get(f"/api/v1/shared/{sh['token']}")).json()
    assert pub["dashboard"]["name"] == "SP" and pub["mode"] == "live"
    cong = await cli.post(
        f"/api/v1/dashboards/{p2['id']}/shares",
        json={"mode": "frozen", "frozen_time": "2026-10-04T22:00:00Z"},
        headers=h,
    )
    assert (
        (await cli.get(f"/api/v1/shared/{cong.json()['token']}"))
        .json()["frozen_time"]
        .startswith("2026-10-04T22:00")
    )
    no_time = await cli.post(f"/api/v1/dashboards/{p2['id']}/shares", json={"mode": "frozen"}, headers=h)
    assert no_time.status_code == 422 and no_time.json()["detail"]
    h2, _ = await sign_up(cli, "bia@exemplo.com")
    assert (await cli.get(f"/api/v1/dashboards/{p1['id']}", headers=h2)).status_code == 404
    assert (await cli.delete(f"/api/v1/dashboards/{p1['id']}", headers=h)).status_code == 204
    assert len((await cli.get("/api/v1/dashboards", headers=h)).json()) == 1
    assert (await cli.get("/api/v1/shared/inexistente")).status_code == 404


async def test_favorites_alerts_preferences(cli):
    h, _ = await sign_up(cli)
    await cli.post(
        "/api/v1/favorites", json={"type": "geo_area", "ref": "sp71072", "label": "São Paulo"}, headers=h
    )
    await cli.post(
        "/api/v1/favorites", json={"type": "geo_area", "ref": "sp71072", "label": "SP capital"}, headers=h
    )
    favs = (await cli.get("/api/v1/favorites", headers=h)).json()
    assert favs == [{"type": "geo_area", "ref": "sp71072", "label": "SP capital"}]
    await cli.delete("/api/v1/favorites/geo_area/sp71072", headers=h)
    assert (await cli.get("/api/v1/favorites", headers=h)).json() == []

    a = (
        await cli.post(
            "/api/v1/alerts",
            json={
                "type": "lead_change",
                "params": {"office_code": 1, "level": "state", "geo_area_id": "mg"},
            },
            headers=h,
        )
    ).json()
    assert a["active"] and a["triggered_at"] is None
    a2 = (
        await cli.put(
            f"/api/v1/alerts/{a['id']}",
            json={
                "type": "tally_threshold",
                "params": {"level": "country", "geo_area_id": "br", "threshold": 50},
                "active": False,
            },
            headers=h,
        )
    ).json()
    assert a2["type"] == "tally_threshold" and not a2["active"]
    assert (await cli.post("/api/v1/alerts", json={"type": "invalido"}, headers=h)).status_code == 422
    assert (await cli.delete(f"/api/v1/alerts/{a['id']}", headers=h)).status_code == 204

    pref = (await cli.get("/api/v1/preferences", headers=h)).json()
    assert pref["theme"] == "escuro"
    pref = (
        await cli.put(
            "/api/v1/preferences",
            json={"theme": "claro", "candidate_colors": {"1": "#fff"}},
            headers=h,
        )
    ).json()
    assert pref["theme"] == "claro"
    assert (await cli.get("/api/v1/preferences", headers=h)).json()["candidate_colors"] == {"1": "#fff"}


async def test_admin_collector(cli, redis_cliente):
    h, _ = await sign_up(cli)
    assert (await cli.post("/api/v1/admin/collector/pause", headers=h)).json() == {"paused": True}
    assert await redis_cliente.get("collector:paused")
    await cli.post("/api/v1/admin/collector/resume", headers=h)
    assert not await redis_cliente.get("collector:paused")
    saude = (await cli.get("/api/v1/admin/health", headers=h)).json()
    assert saude["queue"] == 0 and "database" in saude


async def test_404_and_422_as_problem_json(cli):
    """Every error comes in the same RFC 9457 format, with `detail` explaining what to do."""
    r404 = await cli.get("/api/v1/candidates/9999999")
    assert r404.status_code == 404
    assert r404.headers["content-type"].startswith("application/problem+json")
    body = r404.json()
    assert body["status"] == 404 and body["type"] == "candidates/not_found" and body["detail"]
    r422 = await cli.get("/api/v1/results", params={"level": "bogus"})
    assert r422.status_code == 422
    assert r422.headers["content-type"].startswith("application/problem+json")
    assert r422.json()["detail"]
    r_valid = await cli.post("/api/v1/alerts", json={"type": "invalido"}, headers={})
    assert r_valid.status_code == 401 or r_valid.status_code == 422
    assert r_valid.headers["content-type"].startswith("application/problem+json")


async def test_health_at_root(cli):
    r = await cli.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "up", "redis": "up"}
    assert (await cli.get("/api/v1/health")).status_code == 404


async def test_unit_of_work_undoes_what_raises_after_writing(engine, session):
    """A function that writes and raises leaves nothing in the database."""
    from app.core.errors import AppError

    sm = db_mod.get_sessionmaker()
    try:
        async with db_mod.unit_of_work(sm) as s:
            s.add(User(email="fantasma@exemplo.com", name="x", password_hash="x"))
            await s.flush()
            raise AppError(409, "Conflito", "desfeito de propósito", "test/rollback")
    except AppError:
        pass
    total = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    assert total == 0


async def test_commit_failure_becomes_500_not_200(clean_db):
    """With `scope="function"` the commit runs before the response: if it fails, the client gets 500."""
    from contextlib import asynccontextmanager

    from app.core.main import app as principal

    real = db_mod.get_sessionmaker()

    def factory_that_fails():
        @asynccontextmanager
        async def abrir():
            async with real() as s:

                async def commit_failed() -> None:
                    raise RuntimeError("commit falhou de propósito")

                s.commit = commit_failed  # type: ignore[method-assign]
                yield s

        return abrir()

    principal.dependency_overrides[db_mod.get_sessionmaker] = factory_that_fails
    try:
        transporte = httpx.ASGITransport(app=principal, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as cli:
            r = await cli.post(
                "/api/v1/auth/register",
                json={"email": "falha@exemplo.com", "password": "segredo123", "name": "F"},
            )
        assert r.status_code == 500
    finally:
        principal.dependency_overrides.clear()


async def test_attempt_limit_blocks_the_sixth_even_with_right_password(cli):
    await sign_up(cli)
    for _ in range(5):
        errada = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
        assert errada.status_code == 401
    blocked = await cli.post(
        "/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"}
    )
    assert blocked.status_code == 429
    assert blocked.headers["content-type"].startswith("application/problem+json")
    assert int(blocked.headers["retry-after"]) > 0
    assert blocked.json()["type"] == "auth/too_many_attempts"
    assert "Aguarde" in blocked.json()["detail"]


async def test_successful_login_clears_the_email_counter(cli, redis_cliente):
    await sign_up(cli)
    for _ in range(4):
        await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
    ok = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"})
    assert ok.status_code == 200
    assert await redis_cliente.zcard("login:failures:email:ana@exemplo.com") == 0


async def test_login_works_again_after_the_window(cli, monkeypatch):
    now = [1_000_000.0]
    monkeypatch.setattr(login_limit, "clock", lambda: now[0])
    await sign_up(cli)
    for _ in range(5):
        await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
    blocked = await cli.post(
        "/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"}
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "900"
    now[0] += 15 * 60 + 1
    ok = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"})
    assert ok.status_code == 200
