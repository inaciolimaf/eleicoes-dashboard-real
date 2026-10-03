from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Evento(Base):
    __tablename__ = "evento"
    __table_args__ = (Index("ix_evento_turno_ocorrido", "turno", "ocorrido_em"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    turno: Mapped[int] = mapped_column(SmallInteger)
    tipo: Mapped[str] = mapped_column(String(32))
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cd_cargo: Mapped[int | None] = mapped_column(SmallInteger)
    nivel: Mapped[str | None] = mapped_column(String(10))
    recorte_id: Mapped[str | None] = mapped_column(String(24))
    titulo: Mapped[str] = mapped_column(String(200))
    descricao: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
