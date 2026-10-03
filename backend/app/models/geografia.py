from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UF(Base):
    __tablename__ = "uf"

    sigla: Mapped[str] = mapped_column(String(2), primary_key=True)
    nome: Mapped[str] = mapped_column(String(40))
    regiao: Mapped[str] = mapped_column(String(16))


class Municipio(Base):
    __tablename__ = "municipio"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)  # sp71072
    uf: Mapped[str] = mapped_column(ForeignKey("uf.sigla"), index=True)
    cd_tse: Mapped[int] = mapped_column(Integer)
    cd_ibge: Mapped[int | None] = mapped_column(Integer, index=True)
    nome: Mapped[str] = mapped_column(String(120))
    capital: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    eleitorado: Mapped[int | None] = mapped_column(Integer)


class Zona(Base):
    __tablename__ = "zona"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # sp71072-z0001
    municipio_id: Mapped[str] = mapped_column(ForeignKey("municipio.id", ondelete="CASCADE"), index=True)
    uf: Mapped[str] = mapped_column(String(2))
    numero: Mapped[int] = mapped_column(Integer)


class LocalVotacao(Base):
    __tablename__ = "local_votacao"
    __table_args__ = (Index("ix_local_votacao_lat_lon", "lat", "lon"),)

    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # sp71072-z0001-l1015
    municipio_id: Mapped[str] = mapped_column(ForeignKey("municipio.id", ondelete="CASCADE"), index=True)
    zona_id: Mapped[str] = mapped_column(String(16), index=True)
    uf: Mapped[str] = mapped_column(String(2), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    nome: Mapped[str] = mapped_column(String(200))
    endereco: Mapped[str | None] = mapped_column(String(250))
    bairro: Mapped[str | None] = mapped_column(String(120))
    cep: Mapped[str | None] = mapped_column(String(12))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    aproximado: Mapped[bool] = mapped_column(Boolean, default=False)
    eleitores_aptos: Mapped[int] = mapped_column(Integer, default=0)
    qtd_secoes: Mapped[int] = mapped_column(Integer, default=0)


class Secao(Base):
    __tablename__ = "secao"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # sp71072-z0001-s0120
    municipio_id: Mapped[str] = mapped_column(ForeignKey("municipio.id", ondelete="CASCADE"), index=True)
    zona_id: Mapped[str] = mapped_column(String(16), index=True)
    local_id: Mapped[str | None] = mapped_column(String(24), index=True)
    uf: Mapped[str] = mapped_column(String(2), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    eleitores_aptos: Mapped[int | None] = mapped_column(Integer)
    agregadora: Mapped[int | None] = mapped_column(Integer)
