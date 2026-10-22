"""Ballot reports: one BU per section, polling place aggregates and on-demand section requests."""

from app.modules.ballot_reports import demand
from app.modules.ballot_reports.models import Boletim, ResultadoLocal

__all__ = ["Boletim", "ResultadoLocal", "demand"]
