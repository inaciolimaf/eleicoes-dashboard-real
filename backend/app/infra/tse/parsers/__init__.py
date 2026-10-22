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
    "AcompanhamentoTSE",
    "AllianceTSE",
    "AuxiliarySectionTSE",
    "CandidateTSE",
    "MunicipalityTSE",
    "MunicipioTSE",
    "ProgressTSE",
    "ResultTSE",
    "ResultadoTSE",
    "RunningMateTSE",
    "SecaoTSE",
    "SectionTSE",
    "TotalsTSE",
    "TrackingTSE",
    "UrnFileTSE",
    "parse_acompanhamento",
    "parse_auxiliar",
    "parse_auxiliary",
    "parse_municipalities",
    "parse_municipios",
    "parse_result",
    "parse_resultado",
    "parse_secoes",
    "parse_sections",
    "parse_tracking",
]

# Names used before the English rename; the collector, the worker and the ingestion still import them.
AcompanhamentoTSE = TrackingTSE
MunicipioTSE = MunicipalityTSE
ResultadoTSE = ResultTSE
SecaoTSE = SectionTSE
parse_acompanhamento = parse_tracking
parse_auxiliar = parse_auxiliary
parse_municipios = parse_municipalities
parse_resultado = parse_result
parse_secoes = parse_sections
