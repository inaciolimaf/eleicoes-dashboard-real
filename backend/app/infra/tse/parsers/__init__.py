"""Tolerant parsers of the TSE dissemination files, one module per file kind.

Every field arrives as a string; here it becomes int/float/datetime. Missing fields become 0/None.
"""

from app.infra.tse.parsers.auxiliary import AuxiliarySectionTSE, UrnFileTSE, parse_auxiliary
from app.infra.tse.parsers.municipalities import MunicipalityTSE, parse_municipalities
from app.infra.tse.parsers.results import (
    AllianceTSE,
    CandidateTSE,
    ResultTSE,
    RunningMateTSE,
    TotalsTSE,
    parse_result,
)
from app.infra.tse.parsers.sections import SectionTSE, parse_sections
from app.infra.tse.parsers.tracking import ProgressTSE, TrackingTSE, parse_tracking

__all__ = [
    "AllianceTSE",
    "AuxiliarySectionTSE",
    "CandidateTSE",
    "MunicipalityTSE",
    "ProgressTSE",
    "ResultTSE",
    "RunningMateTSE",
    "SectionTSE",
    "TotalsTSE",
    "TrackingTSE",
    "UrnFileTSE",
    "parse_auxiliary",
    "parse_municipalities",
    "parse_result",
    "parse_sections",
    "parse_tracking",
]
