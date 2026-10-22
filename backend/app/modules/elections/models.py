from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Eleicao(Base):
    __tablename__ = "eleicao"
    __table_args__ = (UniqueConstraint("ambiente", "cd_eleicao"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ambiente: Mapped[str] = mapped_column(String(16))
    ciclo: Mapped[str] = mapped_column(String(16))
    cd_pleito: Mapped[int] = mapped_column(Integer)
    cd_eleicao: Mapped[int] = mapped_column(Integer)
    cd_eleicao_t2: Mapped[int | None] = mapped_column(Integer)
    turno: Mapped[int] = mapped_column(SmallInteger)
    tipo: Mapped[str] = mapped_column(String(16))
    nome: Mapped[str] = mapped_column(String(200))
    data: Mapped[str] = mapped_column(String(10))

    cargos: Mapped[list["EleicaoCargo"]] = relationship(
        back_populates="eleicao", lazy="selectin", order_by="EleicaoCargo.cd_cargo"
    )


class EleicaoCargo(Base):
    __tablename__ = "eleicao_cargo"

    eleicao_id: Mapped[int] = mapped_column(ForeignKey("eleicao.id", ondelete="CASCADE"), primary_key=True)
    cd_cargo: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    sistema: Mapped[str] = mapped_column(String(16))
    abrangencia: Mapped[str] = mapped_column(String(4))
    vagas: Mapped[int | None] = mapped_column(Integer)

    eleicao: Mapped[Eleicao] = relationship(back_populates="cargos")


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
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
