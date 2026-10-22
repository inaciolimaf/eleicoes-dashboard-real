"""Alertas do usuario: CRUD. O disparo e feito pelo worker (evaluation)."""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

import app.modules.alerts.evaluation as alertas_srv
from app.core.deps import SessaoDep
from app.modules.accounts import User, UsuarioDep
from app.modules.alerts.models import Alert

router = APIRouter()


# ------------------------------------------------------------------ alertas


class AlertaEntrada(BaseModel):
    tipo: str = Field(pattern="^(pct_candidato|virada|apuracao|eleito|local_apurado)$")
    params: dict[str, Any] = {}
    ativo: bool = True


def alerta_json(a: Alert) -> dict:
    return {
        "id": str(a.id),
        "tipo": a.type,
        "params": a.params,
        "ativo": a.active,
        "disparado_em": a.triggered_at.isoformat() if a.triggered_at else None,
    }


async def _meu_alerta(session: SessaoDep, u: User, aid: str) -> Alert:
    try:
        a = await session.get(Alert, uuid.UUID(aid))
    except ValueError as exc:
        raise HTTPException(404) from exc
    if a is None or a.user_id != u.id:
        raise HTTPException(404, "alerta não encontrado")
    return a


@router.get("/alertas")
async def listar_alertas(session: SessaoDep, u: UsuarioDep) -> list[dict]:
    rows = (
        await session.execute(select(Alert).where(Alert.user_id == u.id).order_by(Alert.created_at))
    ).scalars()
    return [alerta_json(a) for a in rows]


@router.post("/alertas", status_code=201)
async def criar_alerta(session: SessaoDep, u: UsuarioDep, dados: AlertaEntrada) -> dict:
    a = Alert(user_id=u.id, type=dados.tipo, params=dados.params, active=dados.ativo)
    session.add(a)
    await session.commit()
    await session.refresh(a)
    alertas_srv.invalidar_cache()
    return alerta_json(a)


@router.put("/alertas/{aid}")
async def atualizar_alerta(session: SessaoDep, u: UsuarioDep, aid: str, dados: AlertaEntrada) -> dict:
    a = await _meu_alerta(session, u, aid)
    a.type, a.params, a.active, a.triggered_at = dados.tipo, dados.params, dados.ativo, None
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
