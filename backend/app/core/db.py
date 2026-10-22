import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings
from app.core.errors import AppError

CONVENCAO = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCAO)


def agora() -> datetime:
    return datetime.now(UTC)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = create_async_engine(
            get_settings().database_url, pool_size=10, max_overflow=20, pool_pre_ping=True
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


def configurar_engine(engine: AsyncEngine) -> None:
    """Usado nos testes para apontar para outro banco."""
    global _engine, _sessionmaker
    _engine = engine
    _sessionmaker = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def unit_of_work(
    factory: async_sessionmaker[AsyncSession] | None = None,
) -> AsyncIterator[AsyncSession]:
    """Uma transação: commit ao sair sem erro, rollback se a saída levantar exceção.

    Requisições usam `DbSession` (mesma regra); tarefas de fundo e a CLI usam esta função. Quem
    passa `factory` (o worker, os testes) escolhe de onde vem a sessão.
    """
    async with (factory or get_sessionmaker())() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def get_session(
    factory: Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)],
) -> AsyncIterator[AsyncSession]:
    """Unidade de trabalho da requisição (ver `DbSession` em deps.py: scope="function")."""
    async with unit_of_work(factory) as session:
        yield session


async def get_owned[M: Base](
    session: AsyncSession, model: type[M], key: uuid.UUID | str, user: Any, what: str
) -> M:
    """O registro do usuário ou 404: o mesmo 404 para "não existe" e "é de outro usuário"."""
    try:
        chave: Any = uuid.UUID(key) if isinstance(key, str) else key
    except ValueError:
        chave = None
    obj = await session.get(model, chave) if chave is not None else None
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise AppError(
            404,
            "Não encontrado",
            f"{what} não encontrado",
            f"{model.__tablename__}/not_found",
        )
    return obj
