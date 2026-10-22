"""Favoritos do usuário (candidatos, áreas geográficas e locais de votação)."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounts.models import Favorite, User
from app.modules.accounts.schemas import FavoriteCreate, FavoriteDto


async def list_favorites(session: AsyncSession, u: User) -> list[FavoriteDto]:
    rows = (await session.execute(select(Favorite).where(Favorite.user_id == u.id))).scalars()
    return [FavoriteDto(type=f.type, ref=f.ref, label=f.label) for f in rows]


async def add_favorite(session: AsyncSession, u: User, dados: FavoriteCreate) -> FavoriteDto:
    existente = await session.get(Favorite, {"user_id": u.id, "type": dados.type, "ref": dados.ref})
    if existente is None:
        session.add(Favorite(user_id=u.id, type=dados.type, ref=dados.ref, label=dados.label))
    else:
        existente.label = dados.label
    await session.flush()
    return FavoriteDto(type=dados.type, ref=dados.ref, label=dados.label)


async def remove_favorite(session: AsyncSession, u: User, tipo: str, ref: str) -> None:
    await session.execute(
        delete(Favorite).where(Favorite.user_id == u.id, Favorite.type == tipo, Favorite.ref == ref)
    )
