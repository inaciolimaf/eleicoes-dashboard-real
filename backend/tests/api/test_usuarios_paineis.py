"""Autenticação, painéis (personalização), compartilhamento, favoritos, alertas, preferências e admin."""

import httpx
import pytest_asyncio

from app.main import app

CONFIG = {"filtroGlobal": {"turno": 1, "cargo": 1, "nivel": "br", "id": "br", "tempo": "agora"},
          "widgets": [{"id": "w1", "tipo": "placar", "pos": {"x": 0, "y": 0, "w": 6, "h": 4}, "herda": True}]}


@pytest_asyncio.fixture
async def cli(banco_limpo):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://teste") as c:
        yield c


async def registrar(cli, email="ana@exemplo.com"):
    r = await cli.post("/api/v1/auth/registro", json={"email": email, "senha": "segredo123", "nome": "Ana"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["usuario"]


async def test_registro_login_e_primeiro_usuario_admin(cli):
    h, u = await registrar(cli)
    assert u["is_admin"] is True
    h2, u2 = await registrar(cli, "bia@exemplo.com")
    assert u2["is_admin"] is False
    assert (await cli.post("/api/v1/auth/registro", json={"email": "ana@exemplo.com", "senha": "segredo123",
                                                           "nome": "x"})).status_code == 409
    assert (await cli.post("/api/v1/auth/login", json={"email": "ana@exemplo.com", "senha": "errada"})).status_code == 401
    ok = await cli.post("/api/v1/auth/login", json={"email": "ANA@exemplo.com", "senha": "segredo123"})
    assert ok.status_code == 200
    assert (await cli.get("/api/v1/auth/me", headers=h)).json()["email"] == "ana@exemplo.com"
    assert (await cli.get("/api/v1/auth/me")).status_code == 401
    assert (await cli.get("/api/v1/admin/saude", headers=h2)).status_code == 403


async def test_paineis_crud_padrao_e_compartilhamento(cli):
    h, _ = await registrar(cli)
    p1 = (await cli.post("/api/v1/paineis", json={"nome": "Noite", "config": CONFIG, "padrao": True}, headers=h)).json()
    p2 = (await cli.post("/api/v1/paineis", json={"nome": "SP", "config": CONFIG, "padrao": True}, headers=h)).json()
    lista = (await cli.get("/api/v1/paineis", headers=h)).json()
    assert [p["nome"] for p in lista] == ["Noite", "SP"]
    assert [p["padrao"] for p in lista] == [False, True]
    novo = {**CONFIG, "widgets": CONFIG["widgets"] * 2}
    r = await cli.put(f"/api/v1/paineis/{p1['id']}", json={"nome": "Noite 2", "config": novo}, headers=h)
    assert r.json()["nome"] == "Noite 2" and len(r.json()["config"]["widgets"]) == 2
    assert (await cli.post("/api/v1/paineis", json={"nome": "x", "config": {"widgets": "nao"}}, headers=h)).status_code == 422
    sh = (await cli.post(f"/api/v1/paineis/{p2['id']}/compartilhar", json={"modo": "ao_vivo"}, headers=h)).json()
    pub = (await cli.get(f"/api/v1/compartilhados/{sh['token']}")).json()
    assert pub["painel"]["nome"] == "SP" and pub["modo"] == "ao_vivo"
    cong = await cli.post(f"/api/v1/paineis/{p2['id']}/compartilhar", json={"modo": "congelado",
                                                                            "tempo": "2026-10-04T22:00:00Z"}, headers=h)
    assert (await cli.get(f"/api/v1/compartilhados/{cong.json()['token']}")).json()["tempo"].startswith("2026-10-04T22:00")
    h2, _ = await registrar(cli, "bia@exemplo.com")
    assert (await cli.get(f"/api/v1/paineis/{p1['id']}", headers=h2)).status_code == 404
    assert (await cli.delete(f"/api/v1/paineis/{p1['id']}", headers=h)).status_code == 204
    assert len((await cli.get("/api/v1/paineis", headers=h)).json()) == 1
    assert (await cli.get("/api/v1/compartilhados/inexistente")).status_code == 404


async def test_favoritos_alertas_preferencias(cli):
    h, _ = await registrar(cli)
    await cli.post("/api/v1/favoritos", json={"tipo": "recorte", "ref": "sp71072", "rotulo": "São Paulo"}, headers=h)
    await cli.post("/api/v1/favoritos", json={"tipo": "recorte", "ref": "sp71072", "rotulo": "SP capital"}, headers=h)
    favs = (await cli.get("/api/v1/favoritos", headers=h)).json()
    assert favs == [{"tipo": "recorte", "ref": "sp71072", "rotulo": "SP capital"}]
    await cli.delete("/api/v1/favoritos/recorte/sp71072", headers=h)
    assert (await cli.get("/api/v1/favoritos", headers=h)).json() == []

    a = (await cli.post("/api/v1/alertas", json={"tipo": "virada", "params": {"cargo": 1, "nivel": "uf", "id": "mg"}},
                        headers=h)).json()
    assert a["ativo"] and a["disparado_em"] is None
    a2 = (await cli.put(f"/api/v1/alertas/{a['id']}", json={"tipo": "apuracao", "params": {"nivel": "br", "id": "br",
                                                                                            "limite": 50}, "ativo": False},
                        headers=h)).json()
    assert a2["tipo"] == "apuracao" and not a2["ativo"]
    assert (await cli.post("/api/v1/alertas", json={"tipo": "invalido"}, headers=h)).status_code == 422
    assert (await cli.delete(f"/api/v1/alertas/{a['id']}", headers=h)).status_code == 204

    pref = (await cli.get("/api/v1/preferencias", headers=h)).json()
    assert pref["tema"] == "escuro"
    pref = (await cli.put("/api/v1/preferencias", json={"tema": "claro", "cores_candidatos": {"1": "#fff"}, "x": 1},
                          headers=h)).json()
    assert pref["tema"] == "claro" and "x" not in pref
    assert (await cli.get("/api/v1/preferencias", headers=h)).json()["cores_candidatos"] == {"1": "#fff"}


async def test_admin_coletor(cli, redis_cliente):
    h, _ = await registrar(cli)
    assert (await cli.post("/api/v1/admin/coletor/pausar", headers=h)).json() == {"pausado": True}
    assert await redis_cliente.get("coletor:pausado")
    await cli.post("/api/v1/admin/coletor/retomar", headers=h)
    assert not await redis_cliente.get("coletor:pausado")
    saude = (await cli.get("/api/v1/admin/saude", headers=h)).json()
    assert saude["fila"] == 0 and "banco" in saude
