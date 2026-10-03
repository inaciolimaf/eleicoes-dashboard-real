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
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.models.base import Base


class ColunasResultado:
    """Colunas comuns entre o snapshot (histórico) e o estado atual de um recorte."""

    eleicao_id: Mapped[int] = mapped_column(Integer)
    turno: Mapped[int] = mapped_column(SmallInteger)
    cd_cargo: Mapped[int] = mapped_column(SmallInteger)
    nivel: Mapped[str] = mapped_column(String(10))  # br | uf | municipio | zona
    recorte_id: Mapped[str] = mapped_column(String(24))
    pai_id: Mapped[str] = mapped_column(String(24))
    uf: Mapped[str] = mapped_column(String(2))
    idg: Mapped[int] = mapped_column(BigInteger)
    totalizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capturado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    jws_verificado: Mapped[bool] = mapped_column(Boolean, default=False)
    fonte: Mapped[str] = mapped_column(String(8), default="tse")
    arquivo: Mapped[str | None] = mapped_column(String(300))

    eleitorado: Mapped[int] = mapped_column(Integer, default=0)
    eleitorado_apurado: Mapped[int] = mapped_column(Integer, default=0)
    secoes_total: Mapped[int] = mapped_column(Integer, default=0)
    secoes_totalizadas: Mapped[int] = mapped_column(Integer, default=0)
    pct_secoes: Mapped[float] = mapped_column(Float, default=0)
    comparecimento: Mapped[int] = mapped_column(Integer, default=0)
    pct_comparecimento: Mapped[float] = mapped_column(Float, default=0)
    abstencao: Mapped[int] = mapped_column(Integer, default=0)
    pct_abstencao: Mapped[float] = mapped_column(Float, default=0)
    votos_total: Mapped[int] = mapped_column(Integer, default=0)
    votos_validos: Mapped[int] = mapped_column(Integer, default=0)
    pct_validos: Mapped[float] = mapped_column(Float, default=0)
    brancos: Mapped[int] = mapped_column(Integer, default=0)
    pct_brancos: Mapped[float] = mapped_column(Float, default=0)
    nulos: Mapped[int] = mapped_column(Integer, default=0)
    pct_nulos: Mapped[float] = mapped_column(Float, default=0)
    matematicamente_definido: Mapped[bool] = mapped_column(Boolean, default=False)
    totalizacao_final: Mapped[bool] = mapped_column(Boolean, default=False)

    lider_sqcand: Mapped[str | None] = mapped_column(String(20))
    lider_votos: Mapped[int] = mapped_column(Integer, default=0)
    lider_pct: Mapped[float] = mapped_column(Float, default=0)
    segundo_sqcand: Mapped[str | None] = mapped_column(String(20))
    segundo_votos: Mapped[int] = mapped_column(Integer, default=0)
    segundo_pct: Mapped[float] = mapped_column(Float, default=0)
    margem_pp: Mapped[float] = mapped_column(Float, default=0)
    partido_lider: Mapped[str | None] = mapped_column(String(160))

    # [{"sq": "...", "v": 123, "p": 45.6, "e": true, "st": "Eleito", "d": "Válido"}]
    candidatos: Mapped[list] = mapped_column(JSONB, default=list)
    # [{"nome": "...", "partidos": [...], "v": 123, "vag": 3}]
    agremiacoes: Mapped[list] = mapped_column(JSONB, default=list)


class Snapshot(ColunasResultado, Base):
    __tablename__ = "snapshot_resultado"
    __table_args__ = (
        UniqueConstraint("turno", "cd_cargo", "nivel", "recorte_id", "idg"),
        Index("ix_snapshot_busca_tempo", "turno", "cd_cargo", "nivel", "recorte_id", "totalizado_em"),
        Index("ix_snapshot_pai_tempo", "turno", "cd_cargo", "nivel", "pai_id", "totalizado_em"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)


class ResultadoAtual(ColunasResultado, Base):
    __tablename__ = "resultado_atual"
    __table_args__ = (Index("ix_resultado_atual_pai", "turno", "cd_cargo", "nivel", "pai_id"),)

    @declared_attr
    def turno(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def cd_cargo(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def nivel(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(10), primary_key=True)

    @declared_attr
    def recorte_id(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(24), primary_key=True)


class ColunasProgresso:
    turno: Mapped[int] = mapped_column(SmallInteger)
    nivel: Mapped[str] = mapped_column(String(10))  # br | uf | municipio
    recorte_id: Mapped[str] = mapped_column(String(24))
    uf: Mapped[str] = mapped_column(String(2))
    idg: Mapped[int] = mapped_column(BigInteger)
    totalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capturado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    andamento: Mapped[str] = mapped_column(String(4), default="")
    secoes_total: Mapped[int] = mapped_column(Integer, default=0)
    secoes_totalizadas: Mapped[int] = mapped_column(Integer, default=0)
    pct_secoes: Mapped[float] = mapped_column(Float, default=0)
    eleitorado: Mapped[int] = mapped_column(Integer, default=0)
    comparecimento: Mapped[int] = mapped_column(Integer, default=0)
    pct_comparecimento: Mapped[float] = mapped_column(Float, default=0)
    municipios_finalizados: Mapped[int] = mapped_column(Integer, default=0)
    municipios_parciais: Mapped[int] = mapped_column(Integer, default=0)
    municipios_nao_recebidos: Mapped[int] = mapped_column(Integer, default=0)


class ProgressoSnapshot(ColunasProgresso, Base):
    __tablename__ = "snapshot_progresso"
    __table_args__ = (
        UniqueConstraint("turno", "nivel", "recorte_id", "idg"),
        Index("ix_snapshot_progresso_tempo", "turno", "nivel", "recorte_id", "totalizado_em"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)


class ProgressoAtual(ColunasProgresso, Base):
    __tablename__ = "progresso_atual"

    @declared_attr
    def turno(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def nivel(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(10), primary_key=True)

    @declared_attr
    def recorte_id(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(24), primary_key=True)
