from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Boletim(Base):
    """Boletim de urna (uma seção totalizada), decodificado do arquivo .bu publicado pelo TSE."""

    __tablename__ = "boletim_urna"
    __table_args__ = (
        UniqueConstraint("turno", "secao_id"),
        Index("ix_boletim_local_tempo", "turno", "local_id", "totalizado_em"),
        Index("ix_boletim_municipio", "turno", "municipio_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    turno: Mapped[int] = mapped_column(SmallInteger)
    secao_id: Mapped[str] = mapped_column(String(24))
    local_id: Mapped[str | None] = mapped_column(String(24))
    zona_id: Mapped[str] = mapped_column(String(16), index=True)
    municipio_id: Mapped[str] = mapped_column(String(8))
    uf: Mapped[str] = mapped_column(String(2))
    hash: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32))
    totalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    emitido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capturado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    eleitores_aptos: Mapped[int] = mapped_column(Integer, default=0)
    comparecimento: Mapped[int] = mapped_column(Integer, default=0)
    assinatura_ok: Mapped[bool | None] = mapped_column(Boolean)
    url: Mapped[str | None] = mapped_column(String(400))
    # {"1": {"comp": 250, "b": 5, "n": 10, "nom": {"13": 130}, "leg": {"13": 4}}}
    votos: Mapped[dict] = mapped_column(JSONB, default=dict)


class ResultadoLocal(Base):
    """Agregado ao vivo de um local de votação ("colégio"), soma das seções com BU coletado."""

    __tablename__ = "resultado_local"
    __table_args__ = (Index("ix_resultado_local_municipio", "turno", "cd_cargo", "municipio_id"),)

    turno: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    cd_cargo: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    local_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    municipio_id: Mapped[str] = mapped_column(String(8))
    uf: Mapped[str] = mapped_column(String(2))
    secoes_total: Mapped[int] = mapped_column(Integer, default=0)
    secoes_apuradas: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="nao_recebido")
    comparecimento: Mapped[int] = mapped_column(Integer, default=0)
    votos_validos: Mapped[int] = mapped_column(Integer, default=0)
    brancos: Mapped[int] = mapped_column(Integer, default=0)
    nulos: Mapped[int] = mapped_column(Integer, default=0)
    lider_sqcand: Mapped[str | None] = mapped_column(String(20))
    lider_pct: Mapped[float] = mapped_column(Float, default=0)
    margem_pp: Mapped[float] = mapped_column(Float, default=0)
    votos: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"nom": {"13": 130}, "leg": {...}}
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
