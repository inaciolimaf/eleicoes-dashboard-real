"""EA14/EA15 file (acompanhamento): progress of the tally by state and municipality."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time, decimal, integer
from app.infra.tse.parsers.common import generation_id


@dataclass
class ProgressTSE:
    tipo: str  # br | uf | mu
    codigo: str  # br, sp, 71072
    totalizado_em: datetime | None
    andamento: str
    secoes_total: int
    secoes_totalizadas: int
    pct_secoes: float
    eleitorado: int
    eleitorado_apurado: int
    comparecimento: int
    pct_comparecimento: float
    abstencao: int
    pct_abstencao: float
    municipios_finalizados: int
    municipios_parciais: int
    municipios_nao_recebidos: int


@dataclass
class TrackingTSE:
    cd_eleicao: int
    turno: int
    idg: str
    gerado_em: datetime | None
    itens: list[ProgressTSE]


def _progress(area: dict[str, Any]) -> ProgressTSE:
    sections = area.get("s") or {}
    electorate = area.get("e") or {}
    return ProgressTSE(
        tipo=str(area.get("tpabr") or "").lower(),
        codigo=str(area.get("cdabr") or "").lower(),
        totalizado_em=date_time(area.get("dt"), area.get("ht")),
        andamento=str(area.get("and") or ""),
        secoes_total=integer(sections.get("ts")),
        secoes_totalizadas=integer(sections.get("st")),
        pct_secoes=decimal(sections.get("pstn", sections.get("pst"))),
        eleitorado=integer(electorate.get("te")),
        eleitorado_apurado=integer(electorate.get("est")),
        comparecimento=integer(electorate.get("c")),
        pct_comparecimento=decimal(electorate.get("pcn", electorate.get("pc"))),
        abstencao=integer(electorate.get("a")),
        pct_abstencao=decimal(electorate.get("pan", electorate.get("pa"))),
        municipios_finalizados=integer(area.get("munf")),
        municipios_parciais=integer(area.get("munpt")),
        municipios_nao_recebidos=integer(area.get("munnr")),
    )


def parse_tracking(data: dict[str, Any]) -> TrackingTSE:
    return TrackingTSE(
        cd_eleicao=integer(data.get("ele")),
        turno=integer(data.get("t"), 1),
        idg=generation_id(data),
        gerado_em=date_time(data.get("dg"), data.get("hg")),
        itens=[_progress(area) for area in data.get("abr", []) or []],
    )
