"""Helpers shared by the job types: the context of a queue message and the ids of a ballot box."""

from __future__ import annotations

from datetime import datetime
from typing import NamedTuple

from app.infra.tse.ballot_box import DecodedBallotBox

LEVEL_COUNTRY_STATE = ("country", "state")


def parse_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class BallotIds(NamedTuple):
    """Ids the realtime topics and the diagnostics use for the places of one ballot box."""

    municipality: str
    section: str
    zone: str


def ballot_ids(state_code: str, report: DecodedBallotBox) -> BallotIds:
    municipality = f"{state_code}{report.municipality:05d}"
    zone = f"{municipality}-z{report.zone:04d}"
    return BallotIds(municipality, f"{zone}-s{report.section:04d}", zone)
