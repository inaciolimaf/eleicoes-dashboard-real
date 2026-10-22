"""Autenticação, painéis, compartilhamento, favoritos, alertas e preferências."""

import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select, update

from app.core.deps import SessaoDep, parse_t
from app.core.security import criar_token, hash_senha, verificar_senha
from app.modules.accounts.deps import UsuarioDep
from app.modules.accounts.models import Dashboard, Favorite, Preference, Share, User

router = APIRouter()

# ------------------------------------------------------------------ auth


class Registro(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=6, max_length=200)
    nome: str = Field(min_length=1, max_length=120)


class Login(BaseModel):
    email: EmailStr
    senha: str


def usuario_json(u: User) -> dict:
    return {"id": str(u.id), "email": u.email, "nome": u.name, "is_admin": u.is_admin}


def token_json(u: User) -> dict:
    return {"access_token": criar_token(str(u.id)), "token_type": "bearer", "usuario": usuario_json(u)}


@router.post("/auth/registro", status_code=201)
async def registrar(session: SessaoDep, dados: Registro) -> dict:
    email = dados.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "e-mail já cadastrado")
    primeiro = (await session.execute(select(func.count()).select_from(User))).scalar_one() == 0
    u = User(email=email, name=dados.nome, password_hash=hash_senha(dados.senha), is_admin=primeiro)
    session.add(u)
    await session.commit()
    return token_json(u)


@router.post("/auth/login")
async def login(session: SessaoDep, dados: Login) -> dict:
    u = (await session.execute(select(User).where(User.email == dados.email.lower()))).scalar_one_or_none()
    if u is None or not verificar_senha(dados.senha, u.password_hash):
        raise HTTPException(401, "e-mail ou senha inválidos")
    return token_json(u)


@router.get("/auth/me")
async def me(u: UsuarioDep) -> dict:
    return usuario_json(u)


# ------------------------------------------------------------------ painéis


class PainelEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    config: dict[str, Any]
    padrao: bool = False
    ordem: int | None = None
    schema_version: int = 1

    @field_validator("config")
    @classmethod
    def validar_config(cls, v: dict) -> dict:
        if not isinstance(v.get("widgets"), list) or not isinstance(v.get("filtroGlobal"), dict):
            raise ValueError("config deve ter 'widgets' (lista) e 'filtroGlobal' (objeto)")
        return v


def painel_json(p: Dashboard) -> dict:
    return {
        "id": str(p.id),
        "nome": p.name,
        "ordem": p.position,
        "padrao": p.is_default,
        "schema_version": p.schema_version,
        "config": p.config,
        "atualizado_em": p.updated_at.isoformat() if p.updated_at else None,
    }


async def _meu_painel(session: SessaoDep, u: User, pid: str) -> Dashboard:
    try:
        p = await session.get(Dashboard, uuid.UUID(pid))
    except ValueError as exc:
        raise HTTPException(404) from exc
    if p is None or p.user_id != u.id:
        raise HTTPException(404, "painel não encontrado")
    return p


@router.get("/paineis")
async def listar_paineis(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (
        await session.execute(
            select(Dashboard)
            .where(Dashboard.user_id == u.id)
            .order_by(Dashboard.position, Dashboard.created_at)
        )
    ).scalars()
    return [painel_json(p) for p in rows]


@router.post("/paineis", status_code=201)
async def criar_painel(session: SessaoDep, u: UsuarioDep, dados: PainelEntrada) -> dict:
    ordem = dados.ordem
    if ordem is None:
        ordem = (
            await session.execute(
                select(func.count()).select_from(Dashboard).where(Dashboard.user_id == u.id)
            )
        ).scalar_one()
    if dados.padrao:
        await session.execute(update(Dashboard).where(Dashboard.user_id == u.id).values(is_default=False))
    p = Dashboard(
        user_id=u.id,
        name=dados.nome,
        config=dados.config,
        is_default=dados.padrao,
        position=ordem,
        schema_version=dados.schema_version,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return painel_json(p)


@router.get("/paineis/{pid}")
async def obter_painel(session: SessaoDep, u: UsuarioDep, pid: str) -> dict:
    return painel_json(await _meu_painel(session, u, pid))


@router.put("/paineis/{pid}")
async def atualizar_painel(session: SessaoDep, u: UsuarioDep, pid: str, dados: PainelEntrada) -> dict:
    p = await _meu_painel(session, u, pid)
    if dados.padrao and not p.is_default:
        await session.execute(update(Dashboard).where(Dashboard.user_id == u.id).values(is_default=False))
    p.name, p.config, p.is_default, p.schema_version = (
        dados.nome,
        dados.config,
        dados.padrao,
        dados.schema_version,
    )
    if dados.ordem is not None:
        p.position = dados.ordem
    await session.commit()
    await session.refresh(p)
    return painel_json(p)


@router.delete("/paineis/{pid}", status_code=204)
async def apagar_painel(session: SessaoDep, u: UsuarioDep, pid: str) -> Response:
    p = await _meu_painel(session, u, pid)
    await session.delete(p)
    await session.commit()
    return Response(status_code=204)


class CompartilharEntrada(BaseModel):
    modo: str = Field(pattern="^(ao_vivo|congelado)$")
    tempo: str | None = None


@router.post("/paineis/{pid}/compartilhar")
async def compartilhar(session: SessaoDep, u: UsuarioDep, pid: str, dados: CompartilharEntrada) -> dict:
    p = await _meu_painel(session, u, pid)
    tempo = parse_t(dados.tempo) if dados.modo == "congelado" else None
    if dados.modo == "congelado" and tempo is None:
        raise HTTPException(422, "modo congelado exige 'tempo'")
    token = secrets.token_urlsafe(16)
    session.add(
        Share(
            token=token, dashboard_id=p.id, mode=dados.modo, frozen_time=tempo, created_at=datetime.now(UTC)
        )
    )
    await session.commit()
    return {"token": token, "url": f"/p/{token}"}


@router.get("/compartilhados/{token}")
async def compartilhado(session: SessaoDep, token: str) -> dict:
    c = await session.get(Share, token)
    if c is None:
        raise HTTPException(404, "link inválido")
    p = await session.get(Dashboard, c.dashboard_id)
    if p is None:
        raise HTTPException(404, "painel removido")
    return {
        "painel": painel_json(p),
        "modo": c.mode,
        "tempo": c.frozen_time.isoformat() if c.frozen_time else None,
    }


# ------------------------------------------------------------------ favoritos


class FavoritoEntrada(BaseModel):
    tipo: str = Field(pattern="^(candidato|recorte|local|secao)$")
    ref: str = Field(min_length=1, max_length=40)
    rotulo: str = ""


@router.get("/favoritos")
async def listar_favoritos(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (await session.execute(select(Favorite).where(Favorite.user_id == u.id))).scalars()
    return [{"tipo": f.type, "ref": f.ref, "rotulo": f.label} for f in rows]


@router.post("/favoritos", status_code=201)
async def criar_favorito(session: SessaoDep, u: UsuarioDep, dados: FavoritoEntrada) -> dict:
    existente = await session.get(Favorite, {"user_id": u.id, "type": dados.tipo, "ref": dados.ref})
    if existente is None:
        session.add(Favorite(user_id=u.id, type=dados.tipo, ref=dados.ref, label=dados.rotulo))
    else:
        existente.label = dados.rotulo
    await session.commit()
    return dados.model_dump()


@router.delete("/favoritos/{tipo}/{ref}", status_code=204)
async def apagar_favorito(session: SessaoDep, u: UsuarioDep, tipo: str, ref: str) -> Response:
    await session.execute(
        delete(Favorite).where(Favorite.user_id == u.id, Favorite.type == tipo, Favorite.ref == ref)
    )
    await session.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ preferências


PREFERENCIAS_PADRAO = {
    "tema": "escuro",
    "densidade": "confortavel",
    "animacoes": True,
    "cores_candidatos": {},
    "notificacoes": {"virada": True, "eleito": True, "marco": False},
}


@router.get("/preferencias")
async def obter_preferencias(session: SessaoDep, u: UsuarioDep) -> dict:
    p = await session.get(Preference, u.id)
    return {**PREFERENCIAS_PADRAO, **(p.data if p else {})}


@router.put("/preferencias")
async def salvar_preferencias(session: SessaoDep, u: UsuarioDep, dados: dict[str, Any]) -> dict:
    permitidas = {k: v for k, v in dados.items() if k in PREFERENCIAS_PADRAO}
    p = await session.get(Preference, u.id)
    if p is None:
        session.add(Preference(user_id=u.id, data=permitidas))
    else:
        p.data = {**p.data, **permitidas}
    await session.commit()
    return {**PREFERENCIAS_PADRAO, **permitidas} if p is None else {**PREFERENCIAS_PADRAO, **p.data}
