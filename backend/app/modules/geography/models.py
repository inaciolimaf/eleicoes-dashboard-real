from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class State(Base):
    __tablename__ = "states"

    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    region: Mapped[str] = mapped_column(String(16))


class Municipality(Base):
    __tablename__ = "municipalities"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)  # sp71072
    state_code: Mapped[str] = mapped_column(ForeignKey("states.code"), index=True)
    tse_code: Mapped[int] = mapped_column(Integer)
    ibge_code: Mapped[int | None] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(120))
    is_capital: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    electorate: Mapped[int | None] = mapped_column(Integer)


class ElectoralZone(Base):
    __tablename__ = "electoral_zones"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # sp71072-z0001
    municipality_id: Mapped[str] = mapped_column(
        ForeignKey("municipalities.id", ondelete="CASCADE"), index=True
    )
    state_code: Mapped[str] = mapped_column(String(2))
    number: Mapped[int] = mapped_column(Integer)


class PollingPlace(Base):
    __tablename__ = "polling_places"
    __table_args__ = (Index("ix_polling_places_lat_lon", "lat", "lon"),)

    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # sp71072-z0001-l1015
    municipality_id: Mapped[str] = mapped_column(
        ForeignKey("municipalities.id", ondelete="CASCADE"), index=True
    )
    electoral_zone_id: Mapped[str] = mapped_column(String(16), index=True)
    state_code: Mapped[str] = mapped_column(String(2), index=True)
    number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(250))
    neighborhood: Mapped[str | None] = mapped_column(String(120))
    zip_code: Mapped[str | None] = mapped_column(String(12))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    is_approximate: Mapped[bool] = mapped_column(Boolean, default=False)
    eligible_voters: Mapped[int] = mapped_column(Integer, default=0)
    section_count: Mapped[int] = mapped_column(Integer, default=0)


class PollingSection(Base):
    __tablename__ = "polling_sections"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # sp71072-z0001-s0120
    municipality_id: Mapped[str] = mapped_column(
        ForeignKey("municipalities.id", ondelete="CASCADE"), index=True
    )
    electoral_zone_id: Mapped[str] = mapped_column(String(16), index=True)
    polling_place_id: Mapped[str | None] = mapped_column(String(24), index=True)
    state_code: Mapped[str] = mapped_column(String(2), index=True)
    number: Mapped[int] = mapped_column(Integer)
    eligible_voters: Mapped[int | None] = mapped_column(Integer)
    aggregator_section: Mapped[int | None] = mapped_column(Integer)
