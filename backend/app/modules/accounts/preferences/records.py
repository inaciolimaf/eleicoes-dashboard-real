"""Preferências do usuário (um JSON por usuário, com valores padrão)."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounts.models import Preference, User
from app.modules.accounts.schemas import PreferencesDto, PreferencesUpdate

PREFERENCIAS_PADRAO: dict[str, Any] = {
    "theme": "escuro",
    "density": "confortavel",
    "animations": True,
    "candidate_colors": {},
    "notifications": {"lead_change": True, "elected": True, "milestone": False},
}


def _dto(dados: dict[str, Any]) -> PreferencesDto:
    return PreferencesDto(**{**PREFERENCIAS_PADRAO, **dados})


async def get_preferences(session: AsyncSession, u: User) -> PreferencesDto:
    p = await session.get(Preference, u.id)
    return _dto(p.data if p else {})


async def save_preferences(session: AsyncSession, u: User, dados: PreferencesUpdate) -> PreferencesDto:
    permitidas = {k: v for k, v in dados.model_dump(exclude_unset=True).items() if v is not None}
    p = await session.get(Preference, u.id)
    if p is None:
        session.add(Preference(user_id=u.id, data=permitidas))
        return _dto(permitidas)
    p.data = {**p.data, **permitidas}
    await session.flush()
    return _dto(p.data)
