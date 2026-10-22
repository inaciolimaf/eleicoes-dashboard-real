from datetime import datetime
from typing import Any

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

from app.core.db import Base


class ResultColumns:
    """Colunas comuns entre o snapshot (histórico) e o estado atual de um recorte."""

    election_id: Mapped[int] = mapped_column(Integer)
    round: Mapped[int] = mapped_column(SmallInteger)
    office_code: Mapped[int] = mapped_column(SmallInteger)
    level: Mapped[str] = mapped_column(String(16))  # country | state | municipality | zone
    geo_area_id: Mapped[str] = mapped_column(String(24))
    parent_id: Mapped[str] = mapped_column(String(24))
    state_code: Mapped[str] = mapped_column(String(2))
    generation_id: Mapped[int] = mapped_column(BigInteger)
    tallied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    jws_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(8), default="tse")
    source_file: Mapped[str | None] = mapped_column(String(300))

    electorate: Mapped[int] = mapped_column(Integer, default=0)
    tallied_electorate: Mapped[int] = mapped_column(Integer, default=0)
    sections_total: Mapped[int] = mapped_column(Integer, default=0)
    sections_tallied: Mapped[int] = mapped_column(Integer, default=0)
    pct_sections: Mapped[float] = mapped_column(Float, default=0)
    turnout: Mapped[int] = mapped_column(Integer, default=0)
    pct_turnout: Mapped[float] = mapped_column(Float, default=0)
    abstention: Mapped[int] = mapped_column(Integer, default=0)
    pct_abstention: Mapped[float] = mapped_column(Float, default=0)
    total_votes: Mapped[int] = mapped_column(Integer, default=0)
    valid_votes: Mapped[int] = mapped_column(Integer, default=0)
    pct_valid: Mapped[float] = mapped_column(Float, default=0)
    blank_votes: Mapped[int] = mapped_column(Integer, default=0)
    pct_blank: Mapped[float] = mapped_column(Float, default=0)
    null_votes: Mapped[int] = mapped_column(Integer, default=0)
    pct_null: Mapped[float] = mapped_column(Float, default=0)
    mathematically_decided: Mapped[bool] = mapped_column(Boolean, default=False)
    final_tally: Mapped[bool] = mapped_column(Boolean, default=False)

    leader_candidate_id: Mapped[str | None] = mapped_column(String(20))
    leader_votes: Mapped[int] = mapped_column(Integer, default=0)
    leader_pct: Mapped[float] = mapped_column(Float, default=0)
    second_candidate_id: Mapped[str | None] = mapped_column(String(20))
    second_votes: Mapped[int] = mapped_column(Integer, default=0)
    second_pct: Mapped[float] = mapped_column(Float, default=0)
    margin_pp: Mapped[float] = mapped_column(Float, default=0)
    leader_party: Mapped[str | None] = mapped_column(String(160))

    # [{"sq": "...", "v": 123, "p": 45.6, "e": true, "st": "Eleito", "d": "Válido"}]
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # [{"nome": "...", "partidos": [...], "v": 123, "vag": 3}]
    alliances: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)


class ResultSnapshot(ResultColumns, Base):
    __tablename__ = "result_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "round", "office_code", "level", "geo_area_id", "generation_id", name="uq_result_snapshots_key"
        ),
        Index("ix_result_snapshots_search", "round", "office_code", "level", "geo_area_id", "tallied_at"),
        Index("ix_result_snapshots_parent", "round", "office_code", "level", "parent_id", "tallied_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)


class CurrentResult(ResultColumns, Base):
    __tablename__ = "current_results"
    __table_args__ = (Index("ix_current_results_parent", "round", "office_code", "level", "parent_id"),)

    @declared_attr
    def round(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def office_code(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def level(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(16), primary_key=True)

    @declared_attr
    def geo_area_id(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(24), primary_key=True)


class ProgressColumns:
    round: Mapped[int] = mapped_column(SmallInteger)
    level: Mapped[str] = mapped_column(String(16))  # br | uf | municipio
    geo_area_id: Mapped[str] = mapped_column(String(24))
    state_code: Mapped[str] = mapped_column(String(2))
    generation_id: Mapped[int] = mapped_column(BigInteger)
    tallied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    progress_code: Mapped[str] = mapped_column(String(4), default="")
    sections_total: Mapped[int] = mapped_column(Integer, default=0)
    sections_tallied: Mapped[int] = mapped_column(Integer, default=0)
    pct_sections: Mapped[float] = mapped_column(Float, default=0)
    electorate: Mapped[int] = mapped_column(Integer, default=0)
    turnout: Mapped[int] = mapped_column(Integer, default=0)
    pct_turnout: Mapped[float] = mapped_column(Float, default=0)
    municipalities_completed: Mapped[int] = mapped_column(Integer, default=0)
    municipalities_partial: Mapped[int] = mapped_column(Integer, default=0)
    municipalities_not_received: Mapped[int] = mapped_column(Integer, default=0)


class ProgressSnapshot(ProgressColumns, Base):
    __tablename__ = "progress_snapshots"
    __table_args__ = (
        UniqueConstraint("round", "level", "geo_area_id", "generation_id", name="uq_progress_snapshots_key"),
        Index("ix_progress_snapshots_time", "round", "level", "geo_area_id", "tallied_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)


class CurrentProgress(ProgressColumns, Base):
    __tablename__ = "current_progress"

    @declared_attr
    def round(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(SmallInteger, primary_key=True)

    @declared_attr
    def level(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(16), primary_key=True)

    @declared_attr
    def geo_area_id(cls) -> Mapped[str]:  # noqa: N805
        return mapped_column(String(24), primary_key=True)
