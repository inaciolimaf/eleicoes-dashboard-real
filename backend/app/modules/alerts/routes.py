"""Alertas do usuario: CRUD. O disparo e feito pelo worker (evaluation)."""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

import app.modules.alerts.evaluation as alertas_srv
from app.core.deps import SessaoDep
from app.modules.accounts import Usuario, UsuarioDep
from app.modules.alerts.models import Alerta

router = APIRouter()


# ------------------------------------------------------------------ alertas


class AlertaEntrada(BaseModel):
    tipo: str = Field(pattern="^(pct_candidato|virada|apuracao|eleito|local_apurado)$")
    params: dict[str, Any] = {}
    ativo: bool = True


def alerta_json(a: Alerta) -> dict:
    return {
        "id": str(a.id),
        "tipo": a.tipo,
        "params": a.params,
        "ativo": a.ativo,
        "disparado_em": a.disparado_em.isoformat() if a.disparado_em else None,
    }


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
    rows = (
        await session.execute(select(Alerta).where(Alerta.usuario_id == u.id).order_by(Alerta.criado_em))
    ).scalars()
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
