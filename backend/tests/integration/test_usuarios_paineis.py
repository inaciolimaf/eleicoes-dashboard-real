"""Autenticação, painéis (personalização), compartilhamento, favoritos, alertas, preferências e admin."""

import httpx
import pytest_asyncio
from sqlalchemy import func, select

from app.core import db as db_mod
from app.core.main import app
from app.modules.accounts import User
from app.modules.accounts.auth import login_limit

CONFIG = {
    "filtroGlobal": {"turno": 1, "cargo": 1, "nivel": "br", "id": "br", "tempo": "agora"},
    "widgets": [{"id": "w1", "tipo": "placar", "pos": {"x": 0, "y": 0, "w": 6, "h": 4}, "herda": True}],
}


@pytest_asyncio.fixture
async def cli(banco_limpo):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://teste") as c:
        yield c


async def registrar(cli, email="ana@exemplo.com"):
    r = await cli.post(
        "/api/v1/auth/register", json={"email": email, "password": "segredo123", "name": "Ana"}
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


async def test_registro_login_e_primeiro_usuario_admin(cli):
    h, u = await registrar(cli)
    assert u["is_admin"] is True
    h2, u2 = await registrar(cli, "bia@exemplo.com")
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


async def test_paineis_crud_padrao_e_compartilhamento(cli):
    h, _ = await registrar(cli)
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
    lista = (await cli.get("/api/v1/dashboards", headers=h)).json()
    assert [p["name"] for p in lista] == ["Noite", "SP"]
    assert [p["is_default"] for p in lista] == [False, True]
    novo = {**CONFIG, "widgets": CONFIG["widgets"] * 2}
    r = await cli.put(f"/api/v1/dashboards/{p1['id']}", json={"name": "Noite 2", "config": novo}, headers=h)
    assert r.json()["name"] == "Noite 2" and len(r.json()["config"]["widgets"]) == 2
    invalido = await cli.post(
        "/api/v1/dashboards", json={"name": "x", "config": {"widgets": "nao"}}, headers=h
    )
    assert invalido.status_code == 422
    assert invalido.headers["content-type"].startswith("application/problem+json")
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
    sem_tempo = await cli.post(f"/api/v1/dashboards/{p2['id']}/shares", json={"mode": "frozen"}, headers=h)
    assert sem_tempo.status_code == 422 and sem_tempo.json()["detail"]
    h2, _ = await registrar(cli, "bia@exemplo.com")
    assert (await cli.get(f"/api/v1/dashboards/{p1['id']}", headers=h2)).status_code == 404
    assert (await cli.delete(f"/api/v1/dashboards/{p1['id']}", headers=h)).status_code == 204
    assert len((await cli.get("/api/v1/dashboards", headers=h)).json()) == 1
    assert (await cli.get("/api/v1/shared/inexistente")).status_code == 404


async def test_favoritos_alertas_preferencias(cli):
    h, _ = await registrar(cli)
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


async def test_admin_coletor(cli, redis_cliente):
    h, _ = await registrar(cli)
    assert (await cli.post("/api/v1/admin/collector/pause", headers=h)).json() == {"paused": True}
    assert await redis_cliente.get("collector:paused")
    await cli.post("/api/v1/admin/collector/resume", headers=h)
    assert not await redis_cliente.get("collector:paused")
    saude = (await cli.get("/api/v1/admin/health", headers=h)).json()
    assert saude["queue"] == 0 and "database" in saude


async def test_erro_404_e_422_em_problem_json(cli):
    """Todo erro sai no mesmo formato RFC 9457, com `detail` explicando o que fazer."""
    r404 = await cli.get("/api/v1/candidates/9999999")
    assert r404.status_code == 404
    assert r404.headers["content-type"].startswith("application/problem+json")
    corpo = r404.json()
    assert corpo["status"] == 404 and corpo["type"] == "candidates/not_found" and corpo["detail"]
    r422 = await cli.get("/api/v1/results", params={"level": "bogus"})
    assert r422.status_code == 422
    assert r422.headers["content-type"].startswith("application/problem+json")
    assert r422.json()["detail"]
    r_valid = await cli.post("/api/v1/alerts", json={"type": "invalido"}, headers={})
    assert r_valid.status_code == 401 or r_valid.status_code == 422
    assert r_valid.headers["content-type"].startswith("application/problem+json")


async def test_health_na_raiz(cli):
    r = await cli.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "up", "redis": "up"}
    assert (await cli.get("/api/v1/health")).status_code == 404


async def test_unidade_de_trabalho_desfaz_quem_levanta_depois_de_gravar(engine, session):
    """Uma função que grava e levanta exceção não deixa nada no banco."""
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


async def test_falha_no_commit_vira_500_e_nao_200(banco_limpo):
    """Com `scope="function"` o commit roda antes da resposta: se falha, o cliente recebe 500."""
    from contextlib import asynccontextmanager

    from app.core.main import app as principal

    real = db_mod.get_sessionmaker()

    def fabrica_que_falha():
        @asynccontextmanager
        async def abrir():
            async with real() as s:

                async def commit_falha() -> None:
                    raise RuntimeError("commit falhou de propósito")

                s.commit = commit_falha  # type: ignore[method-assign]
                yield s

        return abrir()

    principal.dependency_overrides[db_mod.get_sessionmaker] = fabrica_que_falha
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


async def test_limite_de_tentativas_bloqueia_a_sexta_mesmo_com_senha_certa(cli):
    await registrar(cli)
    for _ in range(5):
        errada = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
        assert errada.status_code == 401
    bloqueada = await cli.post(
        "/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"}
    )
    assert bloqueada.status_code == 429
    assert bloqueada.headers["content-type"].startswith("application/problem+json")
    assert int(bloqueada.headers["retry-after"]) > 0
    assert bloqueada.json()["type"] == "auth/too_many_attempts"
    assert "Aguarde" in bloqueada.json()["detail"]


async def test_login_certo_zera_o_contador_do_email(cli, redis_cliente):
    await registrar(cli)
    for _ in range(4):
        await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
    ok = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"})
    assert ok.status_code == 200
    assert await redis_cliente.zcard("login:failures:email:ana@exemplo.com") == 0


async def test_depois_da_janela_o_login_volta_a_funcionar(cli, monkeypatch):
    agora = [1_000_000.0]
    monkeypatch.setattr(login_limit, "clock", lambda: agora[0])
    await registrar(cli)
    for _ in range(5):
        await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "errada"})
    bloqueada = await cli.post(
        "/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"}
    )
    assert bloqueada.status_code == 429
    assert bloqueada.headers["retry-after"] == "900"
    agora[0] += 15 * 60 + 1
    ok = await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "password": "segredo123"})
    assert ok.status_code == 200
