import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps


class Usuario(Timestamps, Base):
    __tablename__ = "usuario"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    nome: Mapped[str] = mapped_column(String(120))
    senha_hash: Mapped[str] = mapped_column(String(200))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


class Preferencia(Base):
    __tablename__ = "preferencia"

    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True)
    dados: Mapped[dict] = mapped_column(JSONB, default=dict)


class Painel(Timestamps, Base):
    __tablename__ = "painel"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), index=True)
    nome: Mapped[str] = mapped_column(String(120))
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    padrao: Mapped[bool] = mapped_column(Boolean, default=False)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)


class Compartilhamento(Base):
    __tablename__ = "compartilhamento"

    token: Mapped[str] = mapped_column(String(40), primary_key=True)
    painel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("painel.id", ondelete="CASCADE"), index=True)
    modo: Mapped[str] = mapped_column(String(16))
    tempo: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Favorito(Base):
    __tablename__ = "favorito"

    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(16), primary_key=True)
    ref: Mapped[str] = mapped_column(String(40), primary_key=True)
    rotulo: Mapped[str] = mapped_column(String(160), default="")


class Alerta(Timestamps, Base):
    __tablename__ = "alerta"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), index=True)
    tipo: Mapped[str] = mapped_column(String(32))
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    disparado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
