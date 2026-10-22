"""Alert DTOs of the user."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AlertType = Literal["candidate_pct", "lead_change", "tally_threshold", "elected", "polling_place_tallied"]


class AlertCreate(BaseModel):
    type: AlertType
    params: dict[str, Any] = Field(default_factory=dict)
    active: bool = True


class AlertUpdate(AlertCreate):
    """Substituição completa do alerta (PUT); zera o disparo anterior."""


class AlertDto(BaseModel):
    id: str
    type: AlertType
    params: dict[str, Any]
    active: bool
    triggered_at: datetime | None = Field(None, description="Quando o alerta disparou pela última vez")
