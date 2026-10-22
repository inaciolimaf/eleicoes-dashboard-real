"""The user's favorites: add (or relabel), list and remove."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounts.models import Favorite, User
from app.modules.accounts.schemas import FavoriteCreate, FavoriteDto


async def list_favorites(session: AsyncSession, user: User) -> list[FavoriteDto]:
    rows = (await session.execute(select(Favorite).where(Favorite.user_id == user.id))).scalars()
    return [FavoriteDto(type=f.type, ref=f.ref, label=f.label) for f in rows]


async def add_favorite(session: AsyncSession, user: User, body: FavoriteCreate) -> FavoriteDto:
    existing = await session.get(Favorite, {"user_id": user.id, "type": body.type, "ref": body.ref})
    if existing is None:
        session.add(Favorite(user_id=user.id, type=body.type, ref=body.ref, label=body.label))
    else:
        existing.label = body.label
    await session.flush()
    return FavoriteDto(type=body.type, ref=body.ref, label=body.label)


async def remove_favorite(session: AsyncSession, user: User, favorite_type: str, ref: str) -> None:
    await session.execute(
        delete(Favorite).where(
            Favorite.user_id == user.id, Favorite.type == favorite_type, Favorite.ref == ref
        )
    )
