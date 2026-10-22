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

from app.core.db import Base


class BallotBoxReport(Base):
    """Boletim de urna (uma seção totalizada), decodificado do arquivo .bu publicado pelo TSE."""

    __tablename__ = "ballot_box_reports"
    __table_args__ = (
        UniqueConstraint("round", "polling_section_id"),
        Index("ix_ballot_box_reports_polling_place_tallied", "round", "polling_place_id", "tallied_at"),
        Index("ix_ballot_box_reports_municipality", "round", "municipality_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    round: Mapped[int] = mapped_column(SmallInteger)
    polling_section_id: Mapped[str] = mapped_column(String(24))
    polling_place_id: Mapped[str | None] = mapped_column(String(24))
    electoral_zone_id: Mapped[str] = mapped_column(String(16), index=True)
    municipality_id: Mapped[str] = mapped_column(String(8))
    state_code: Mapped[str] = mapped_column(String(2))
    hash: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32))
    tallied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    eligible_voters: Mapped[int] = mapped_column(Integer, default=0)
    turnout: Mapped[int] = mapped_column(Integer, default=0)
    signature_valid: Mapped[bool | None] = mapped_column(Boolean)
    url: Mapped[str | None] = mapped_column(String(400))
    # {"1": {"comp": 250, "b": 5, "n": 10, "nom": {"13": 130}, "leg": {"13": 4}}}
    votes: Mapped[dict] = mapped_column(JSONB, default=dict)


class PollingPlaceResult(Base):
    """Agregado ao vivo de um local de votação ("colégio"), soma das seções com BU coletado."""

    __tablename__ = "polling_place_results"
    __table_args__ = (
        Index("ix_polling_place_results_municipality", "round", "office_code", "municipality_id"),
    )

    round: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    office_code: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    polling_place_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    municipality_id: Mapped[str] = mapped_column(String(8))
    state_code: Mapped[str] = mapped_column(String(2))
    sections_total: Mapped[int] = mapped_column(Integer, default=0)
    sections_tallied: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="not_received")
    turnout: Mapped[int] = mapped_column(Integer, default=0)
    valid_votes: Mapped[int] = mapped_column(Integer, default=0)
    blank_votes: Mapped[int] = mapped_column(Integer, default=0)
    null_votes: Mapped[int] = mapped_column(Integer, default=0)
    leader_candidate_id: Mapped[str | None] = mapped_column(String(20))
    leader_pct: Mapped[float] = mapped_column(Float, default=0)
    margin_pp: Mapped[float] = mapped_column(Float, default=0)
    votes: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"nom": {"13": 130}, "leg": {...}}
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
