from datetime import datetime
from typing import Any

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


class Election(Base):
    __tablename__ = "elections"
    __table_args__ = (UniqueConstraint("tse_environment", "election_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tse_environment: Mapped[str] = mapped_column(String(16))
    cycle: Mapped[str] = mapped_column(String(16))
    election_event_code: Mapped[int] = mapped_column(Integer)
    election_code: Mapped[int] = mapped_column(Integer)
    runoff_election_code: Mapped[int | None] = mapped_column(Integer)
    round: Mapped[int] = mapped_column(SmallInteger)
    jurisdiction: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(200))
    date: Mapped[str] = mapped_column(String(10))

    offices: Mapped[list["ElectionOffice"]] = relationship(
        back_populates="election", lazy="selectin", order_by="ElectionOffice.office_code"
    )


class ElectionOffice(Base):
    __tablename__ = "election_offices"

    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"), primary_key=True)
    office_code: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    voting_system: Mapped[str] = mapped_column(String(16))
    coverage: Mapped[str] = mapped_column(String(4))
    seats: Mapped[int | None] = mapped_column(Integer)

    election: Mapped[Election] = relationship(back_populates="offices")


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        Index(
            "ix_candidates_office_state_ballot_number", "round", "office_code", "state_code", "ballot_number"
        ),
    )

    tse_candidate_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"))
    round: Mapped[int] = mapped_column(SmallInteger)
    office_code: Mapped[int] = mapped_column(SmallInteger)
    state_code: Mapped[str] = mapped_column(String(2))  # "br" for the President
    ballot_number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    ballot_name: Mapped[str] = mapped_column(String(120))
    party_abbreviation: Mapped[str] = mapped_column(String(20))
    party_number: Mapped[int] = mapped_column(Integer)
    alliance: Mapped[str] = mapped_column(String(160))
    color: Mapped[str] = mapped_column(String(9))
    vice_and_substitutes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    overall_status: Mapped[str] = mapped_column(String(32), default="COUNTING")
    elected: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
