"""Alert routes of the user (HTTP only)."""

from fastapi import APIRouter, Response

from app.core.deps import DbSession
from app.modules.accounts import CurrentUser
from app.modules.alerts.records import user_alerts
from app.modules.alerts.schemas import AlertCreate, AlertDto, AlertUpdate

router = APIRouter()


@router.get("/alerts", response_model=list[AlertDto], tags=["alerts"])
async def list_alerts(session: DbSession, user: CurrentUser) -> list[AlertDto]:
    return await user_alerts.list_alerts(session, user)


@router.post("/alerts", status_code=201, response_model=AlertDto, tags=["alerts"])
async def create_alert(session: DbSession, user: CurrentUser, body: AlertCreate) -> AlertDto:
    return await user_alerts.create_alert(session, user, body)


@router.put("/alerts/{alert_id}", response_model=AlertDto, tags=["alerts"])
async def update_alert(session: DbSession, user: CurrentUser, alert_id: str, body: AlertUpdate) -> AlertDto:
    return await user_alerts.update_alert(session, user, alert_id, body)


@router.delete("/alerts/{alert_id}", status_code=204, tags=["alerts"])
async def delete_alert(session: DbSession, user: CurrentUser, alert_id: str) -> Response:
    await user_alerts.delete_alert(session, user, alert_id)
    return Response(status_code=204)
