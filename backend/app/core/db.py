from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import DateTime, MetaData, String, func
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings

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


class ValorNoBanco(TypeDecorator[str]):
    """Valor de enumeração guardado em inglês e usado em português no código.

    Transição: o banco guarda os valores em inglês (migração 0002); o código ainda fala os valores
    antigos (API, filtros e JSON de usuário). A tradução fica só aqui, uma vez por enumeração.
    Trocar o código para os valores em inglês remove esta camada.
    """

    impl = String
    cache_ok = True
    mapa: ClassVar[dict[str, str]] = {}  # valor do código -> valor no banco

    def __init__(self, length: int) -> None:
        super().__init__(length)

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        return None if value is None else type(self).mapa.get(value, value)

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        inverso = {v: k for k, v in type(self).mapa.items()}
        return inverso.get(value, value)


class NivelNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "br": "country",
        "uf": "state",
        "municipio": "municipality",
        "zona": "zone",
        "local": "polling_place",
        "secao": "section",
    }


class SituacaoNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "ELEITO": "ELECTED",
        "SEGUNDO_TURNO": "RUNOFF",
        "MATEMATICAMENTE_ELEITO": "MATHEMATICALLY_ELECTED",
        "LIDERANDO": "LEADING",
        "SUPLENTE": "SUBSTITUTE",
        "NAO_ELEITO": "NOT_ELECTED",
        "SUB_JUDICE": "SUB_JUDICE",
        "EM_APURACAO": "COUNTING",
    }


class ApuracaoLocalNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "nao_recebido": "not_received",
        "parcial": "partial",
        "apurado": "tallied",
    }


class TipoAlertaNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "pct_candidato": "candidate_pct",
        "apuracao": "tally_threshold",
        "virada": "lead_change",
        "eleito": "elected",
        "local_apurado": "polling_place_tallied",
    }


class TipoEventoNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "inicio": "start",
        "marco": "milestone",
        "virada": "lead_change",
        "eleito": "elected",
        "matematicamente_definido": "mathematically_decided",
        "segundo_turno": "runoff",
    }


class TipoFavoritoNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {
        "candidato": "candidate",
        "recorte": "geo_area",
        "local": "polling_place",
        "secao": "section",
    }


class ModoCompartilhamentoNoBanco(ValorNoBanco):
    mapa: ClassVar[dict[str, str]] = {"ao_vivo": "live", "congelado": "frozen"}


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


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
