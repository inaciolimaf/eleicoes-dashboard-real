from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Candidato(Base):
    __tablename__ = "candidato"
    __table_args__ = (Index("ix_candidato_cargo_uf_numero", "turno", "cd_cargo", "uf", "numero"),)

    sqcand: Mapped[str] = mapped_column(String(20), primary_key=True)
    eleicao_id: Mapped[int] = mapped_column(ForeignKey("eleicao.id", ondelete="CASCADE"))
    turno: Mapped[int] = mapped_column(SmallInteger)
    cd_cargo: Mapped[int] = mapped_column(SmallInteger)
    uf: Mapped[str] = mapped_column(String(2))  # "br" para Presidente
    numero: Mapped[int] = mapped_column(Integer)
    nome: Mapped[str] = mapped_column(String(160))
    nome_urna: Mapped[str] = mapped_column(String(120))
    partido_sigla: Mapped[str] = mapped_column(String(20))
    partido_numero: Mapped[int] = mapped_column(Integer)
    agremiacao: Mapped[str] = mapped_column(String(160))
    cor: Mapped[str] = mapped_column(String(9))
    vices: Mapped[list] = mapped_column(JSONB, default=list)
    situacao_geral: Mapped[str] = mapped_column(String(32), default="EM_APURACAO")
    eleito: Mapped[bool] = mapped_column(Boolean, default=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                    onupdate=func.now())
