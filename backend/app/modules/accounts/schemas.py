"""DTOs da API de contas: entradas (XCreate, XUpdate) e respostas (XDto)."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserDto(BaseModel):
    id: str
    email: str
    name: str
    is_admin: bool


class RegisterCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    name: str = Field(min_length=1, max_length=120)


class LoginCreate(BaseModel):
    email: EmailStr
    password: str


class TokenDto(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    user: UserDto


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    config: dict[str, Any]
    is_default: bool = False
    position: int | None = None
    schema_version: int = 1

    @field_validator("config")
    @classmethod
    def validar_config(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(v.get("widgets"), list) or not isinstance(v.get("filtroGlobal"), dict):
            raise ValueError("config deve ter 'widgets' (lista) e 'filtroGlobal' (objeto)")
        return v


class DashboardUpdate(DashboardCreate):
    """Substituição completa do painel (PUT)."""


class DashboardDto(BaseModel):
    id: str
    name: str
    position: int
    is_default: bool
    schema_version: int
    config: dict[str, Any] = Field(description="Definição do painel (JSON guardado como está)")
    updated_at: str | None


class ShareCreate(BaseModel):
    mode: Literal["live", "frozen"]
    frozen_time: str | None = Field(None, description="Instante ISO 8601 (obrigatório no modo frozen)")


class ShareDto(BaseModel):
    token: str
    url: str


class SharedDashboardDto(BaseModel):
    dashboard: DashboardDto
    mode: Literal["live", "frozen"]
    frozen_time: str | None


FavoriteType = Literal["candidate", "geo_area", "polling_place", "section"]


class FavoriteCreate(BaseModel):
    type: FavoriteType
    ref: str = Field(min_length=1, max_length=40)
    label: str = ""


class FavoriteDto(BaseModel):
    type: FavoriteType
    ref: str
    label: str


class PreferencesDto(BaseModel):
    theme: str
    density: str
    animations: bool
    candidate_colors: dict[str, str]
    notifications: dict[str, Any]


class PreferencesUpdate(BaseModel):
    """Campos enviados são gravados; os demais ficam como estavam."""

    theme: str | None = None
    density: str | None = None
    animations: bool | None = None
    candidate_colors: dict[str, str] | None = None
    notifications: dict[str, Any] | None = None

    model_config = ConfigDict(extra="ignore")
