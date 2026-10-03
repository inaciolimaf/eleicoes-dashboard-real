from sqlalchemy import ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


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

    cargos: Mapped[list["EleicaoCargo"]] = relationship(back_populates="eleicao", lazy="selectin",
                                                        order_by="EleicaoCargo.cd_cargo")


class EleicaoCargo(Base):
    __tablename__ = "eleicao_cargo"

    eleicao_id: Mapped[int] = mapped_column(ForeignKey("eleicao.id", ondelete="CASCADE"), primary_key=True)
    cd_cargo: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    sistema: Mapped[str] = mapped_column(String(16))
    abrangencia: Mapped[str] = mapped_column(String(4))
    vagas: Mapped[int | None] = mapped_column(Integer)

    eleicao: Mapped[Eleicao] = relationship(back_populates="cargos")
