"""Imports the models of every module so Alembic sees the complete metadata."""

from app.core.db import Base
from app.modules.accounts import Dashboard, Favorite, Preference, Share, User
from app.modules.alerts import Alert
from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.elections import Candidate, Election, ElectionOffice
from app.modules.events import Event
from app.modules.geography import (
    ElectoralZone,
    Municipality,
    PollingPlace,
    PollingSection,
    State,
)
from app.modules.results import CurrentProgress, CurrentResult, ProgressSnapshot, ResultSnapshot

__all__ = [
    "Alert",
    "BallotBoxReport",
    "Base",
    "Candidate",
    "CurrentProgress",
    "CurrentResult",
    "Dashboard",
    "Election",
    "ElectionOffice",
    "ElectoralZone",
    "Event",
    "Favorite",
    "Municipality",
    "PollingPlace",
    "PollingPlaceResult",
    "PollingSection",
    "Preference",
    "ProgressSnapshot",
    "ResultSnapshot",
    "Share",
    "State",
    "User",
]
