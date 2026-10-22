from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_round_occurred_at", "round", "occurred_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    round: Mapped[int] = mapped_column(SmallInteger)
    type: Mapped[str] = mapped_column(String(32))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    office_code: Mapped[int | None] = mapped_column(SmallInteger)
    level: Mapped[str | None] = mapped_column(String(16))
    geo_area_id: Mapped[str | None] = mapped_column(String(24))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
