"""Helpers shared by the job types: the context of a queue message and the ids of a ballot box."""

from __future__ import annotations

from datetime import datetime
from typing import NamedTuple

from app.infra.tse.bu import BoletimUrna

LEVEL_COUNTRY_STATE = ("country", "state")


def parse_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class BallotIds(NamedTuple):
    """Ids the realtime topics and the diagnostics use for the places of one ballot box."""

    municipality: str
    section: str
    zone: str


def ballot_ids(state_code: str, report: BoletimUrna) -> BallotIds:
    municipality = f"{state_code}{report.municipio:05d}"
    zone = f"{municipality}-z{report.zona:04d}"
    return BallotIds(municipality, f"{zone}-s{report.secao:04d}", zone)
