"""Autenticação, painéis, compartilhamento, favoritos, alertas e preferências."""

import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select, update

from app.api.deps import SessaoDep, UsuarioDep, parse_t
from app.core.security import criar_token, hash_senha, verificar_senha
from app.models import Alerta, Compartilhamento, Favorito, Painel, Preferencia, Usuario
from app.services import alertas as alertas_srv

router = APIRouter()

# ------------------------------------------------------------------ auth


class Registro(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=6, max_length=200)
    nome: str = Field(min_length=1, max_length=120)


class Login(BaseModel):
    email: EmailStr
    senha: str


def usuario_json(u: Usuario) -> dict:
    return {"id": str(u.id), "email": u.email, "nome": u.nome, "is_admin": u.is_admin}


def token_json(u: Usuario) -> dict:
    return {"access_token": criar_token(str(u.id)), "token_type": "bearer", "usuario": usuario_json(u)}


@router.post("/auth/registro", status_code=201)
async def registrar(session: SessaoDep, dados: Registro) -> dict:
    email = dados.email.lower()
    if (await session.execute(select(Usuario).where(Usuario.email == email))).scalar_one_or_none():
        raise HTTPException(409, "e-mail já cadastrado")
    primeiro = (await session.execute(select(func.count()).select_from(Usuario))).scalar_one() == 0
    u = Usuario(email=email, nome=dados.nome, senha_hash=hash_senha(dados.senha), is_admin=primeiro)
    session.add(u)
    await session.commit()
    return token_json(u)


@router.post("/auth/login")
async def login(session: SessaoDep, dados: Login) -> dict:
    u = (await session.execute(select(Usuario).where(Usuario.email == dados.email.lower()))).scalar_one_or_none()
    if u is None or not verificar_senha(dados.senha, u.senha_hash):
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


def painel_json(p: Painel) -> dict:
    return {"id": str(p.id), "nome": p.nome, "ordem": p.ordem, "padrao": p.padrao, "schema_version": p.schema_version,
            "config": p.config, "atualizado_em": p.atualizado_em.isoformat() if p.atualizado_em else None}


async def _meu_painel(session: SessaoDep, u: Usuario, pid: str) -> Painel:
    try:
        p = await session.get(Painel, uuid.UUID(pid))
    except ValueError as exc:
        raise HTTPException(404) from exc
    if p is None or p.usuario_id != u.id:
        raise HTTPException(404, "painel não encontrado")
    return p


@router.get("/paineis")
async def listar_paineis(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (await session.execute(select(Painel).where(Painel.usuario_id == u.id).order_by(Painel.ordem, Painel.criado_em))).scalars()
    return [painel_json(p) for p in rows]


@router.post("/paineis", status_code=201)
async def criar_painel(session: SessaoDep, u: UsuarioDep, dados: PainelEntrada) -> dict:
    ordem = dados.ordem
    if ordem is None:
        ordem = (await session.execute(select(func.count()).select_from(Painel).where(Painel.usuario_id == u.id))).scalar_one()
    if dados.padrao:
        await session.execute(update(Painel).where(Painel.usuario_id == u.id).values(padrao=False))
    p = Painel(usuario_id=u.id, nome=dados.nome, config=dados.config, padrao=dados.padrao, ordem=ordem,
               schema_version=dados.schema_version)
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
    if dados.padrao and not p.padrao:
        await session.execute(update(Painel).where(Painel.usuario_id == u.id).values(padrao=False))
    p.nome, p.config, p.padrao, p.schema_version = dados.nome, dados.config, dados.padrao, dados.schema_version
    if dados.ordem is not None:
        p.ordem = dados.ordem
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
    session.add(Compartilhamento(token=token, painel_id=p.id, modo=dados.modo, tempo=tempo, criado_em=datetime.now(UTC)))
    await session.commit()
    return {"token": token, "url": f"/p/{token}"}


@router.get("/compartilhados/{token}")
async def compartilhado(session: SessaoDep, token: str) -> dict:
    c = await session.get(Compartilhamento, token)
    if c is None:
        raise HTTPException(404, "link inválido")
    p = await session.get(Painel, c.painel_id)
    if p is None:
        raise HTTPException(404, "painel removido")
    return {"painel": painel_json(p), "modo": c.modo, "tempo": c.tempo.isoformat() if c.tempo else None}


# ------------------------------------------------------------------ favoritos


class FavoritoEntrada(BaseModel):
    tipo: str = Field(pattern="^(candidato|recorte|local|secao)$")
    ref: str = Field(min_length=1, max_length=40)
    rotulo: str = ""


@router.get("/favoritos")
async def listar_favoritos(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (await session.execute(select(Favorito).where(Favorito.usuario_id == u.id))).scalars()
    return [{"tipo": f.tipo, "ref": f.ref, "rotulo": f.rotulo} for f in rows]


@router.post("/favoritos", status_code=201)
async def criar_favorito(session: SessaoDep, u: UsuarioDep, dados: FavoritoEntrada) -> dict:
    existente = await session.get(Favorito, {"usuario_id": u.id, "tipo": dados.tipo, "ref": dados.ref})
    if existente is None:
        session.add(Favorito(usuario_id=u.id, tipo=dados.tipo, ref=dados.ref, rotulo=dados.rotulo))
    else:
        existente.rotulo = dados.rotulo
    await session.commit()
    return dados.model_dump()


@router.delete("/favoritos/{tipo}/{ref}", status_code=204)
async def apagar_favorito(session: SessaoDep, u: UsuarioDep, tipo: str, ref: str) -> Response:
    await session.execute(delete(Favorito).where(Favorito.usuario_id == u.id, Favorito.tipo == tipo, Favorito.ref == ref))
    await session.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ alertas


class AlertaEntrada(BaseModel):
    tipo: str = Field(pattern="^(pct_candidato|virada|apuracao|eleito|local_apurado)$")
    params: dict[str, Any] = {}
    ativo: bool = True


def alerta_json(a: Alerta) -> dict:
    return {"id": str(a.id), "tipo": a.tipo, "params": a.params, "ativo": a.ativo,
            "disparado_em": a.disparado_em.isoformat() if a.disparado_em else None}


async def _meu_alerta(session: SessaoDep, u: Usuario, aid: str) -> Alerta:
    try:
        a = await session.get(Alerta, uuid.UUID(aid))
    except ValueError as exc:
        raise HTTPException(404) from exc
    if a is None or a.usuario_id != u.id:
        raise HTTPException(404, "alerta não encontrado")
    return a


@router.get("/alertas")
async def listar_alertas(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (await session.execute(select(Alerta).where(Alerta.usuario_id == u.id).order_by(Alerta.criado_em))).scalars()
    return [alerta_json(a) for a in rows]


@router.post("/alertas", status_code=201)
async def criar_alerta(session: SessaoDep, u: UsuarioDep, dados: AlertaEntrada) -> dict:
    a = Alerta(usuario_id=u.id, tipo=dados.tipo, params=dados.params, ativo=dados.ativo)
    session.add(a)
    await session.commit()
    await session.refresh(a)
    alertas_srv.invalidar_cache()
    return alerta_json(a)


@router.put("/alertas/{aid}")
async def atualizar_alerta(session: SessaoDep, u: UsuarioDep, aid: str, dados: AlertaEntrada) -> dict:
    a = await _meu_alerta(session, u, aid)
    a.tipo, a.params, a.ativo, a.disparado_em = dados.tipo, dados.params, dados.ativo, None
    await session.commit()
    await session.refresh(a)
    alertas_srv.invalidar_cache()
    return alerta_json(a)


@router.delete("/alertas/{aid}", status_code=204)
async def apagar_alerta(session: SessaoDep, u: UsuarioDep, aid: str) -> Response:
    a = await _meu_alerta(session, u, aid)
    await session.delete(a)
    await session.commit()
    alertas_srv.invalidar_cache()
    return Response(status_code=204)


# ------------------------------------------------------------------ preferências


PREFERENCIAS_PADRAO = {"tema": "escuro", "densidade": "confortavel", "animacoes": True, "cores_candidatos": {},
                       "notificacoes": {"virada": True, "eleito": True, "marco": False}}


@router.get("/preferencias")
async def obter_preferencias(session: SessaoDep, u: UsuarioDep) -> dict:
    p = await session.get(Preferencia, u.id)
    return {**PREFERENCIAS_PADRAO, **(p.dados if p else {})}


@router.put("/preferencias")
async def salvar_preferencias(session: SessaoDep, u: UsuarioDep, dados: dict[str, Any]) -> dict:
    permitidas = {k: v for k, v in dados.items() if k in PREFERENCIAS_PADRAO}
    p = await session.get(Preferencia, u.id)
    if p is None:
        session.add(Preferencia(usuario_id=u.id, dados=permitidas))
    else:
        p.dados = {**p.dados, **permitidas}
    await session.commit()
    return {**PREFERENCIAS_PADRAO, **permitidas} if p is None else {**PREFERENCIAS_PADRAO, **p.dados}
