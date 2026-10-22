"""Rotas de alertas do usuário (só HTTP)."""

from fastapi import APIRouter, Response

from app.core.deps import DbSession
from app.modules.accounts import UsuarioDep
from app.modules.alerts import crud
from app.modules.alerts.schemas import AlertCreate, AlertDto, AlertUpdate

router = APIRouter()


@router.get("/alerts", response_model=list[AlertDto], tags=["alerts"])
async def list_alerts(session: DbSession, u: UsuarioDep) -> list[AlertDto]:
    return await crud.list_alerts(session, u)


@router.post("/alerts", status_code=201, response_model=AlertDto, tags=["alerts"])
async def create_alert(session: DbSession, u: UsuarioDep, dados: AlertCreate) -> AlertDto:
    return await crud.create_alert(session, u, dados)


@router.put("/alerts/{alert_id}", response_model=AlertDto, tags=["alerts"])
async def update_alert(session: DbSession, u: UsuarioDep, alert_id: str, dados: AlertUpdate) -> AlertDto:
    return await crud.update_alert(session, u, alert_id, dados)


@router.delete("/alerts/{alert_id}", status_code=204, tags=["alerts"])
async def delete_alert(session: DbSession, u: UsuarioDep, alert_id: str) -> Response:
    await crud.delete_alert(session, u, alert_id)
    return Response(status_code=204)
