"""The user's preferences: one JSON document per user, merged over the default values."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounts.models import Preference, User
from app.modules.accounts.schemas import PreferencesDto, PreferencesUpdate

#: Used until the user saves a preference. The keys are the stored (wire) names.
DEFAULT_PREFERENCES: dict[str, Any] = {
    "theme": "escuro",
    "density": "confortavel",
    "animations": True,
    "candidate_colors": {},
    "notifications": {"lead_change": True, "elected": True, "milestone": False},
}


def _to_dto(data: dict[str, Any]) -> PreferencesDto:
    return PreferencesDto(**{**DEFAULT_PREFERENCES, **data})


async def get_preferences(session: AsyncSession, user: User) -> PreferencesDto:
    stored = await session.get(Preference, user.id)
    return _to_dto(stored.data if stored else {})


async def save_preferences(session: AsyncSession, user: User, body: PreferencesUpdate) -> PreferencesDto:
    permitted = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    stored = await session.get(Preference, user.id)
    if stored is None:
        session.add(Preference(user_id=user.id, data=permitted))
        return _to_dto(permitted)
    stored.data = {**stored.data, **permitted}
    await session.flush()
    return _to_dto(stored.data)
