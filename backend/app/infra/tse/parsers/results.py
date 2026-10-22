"""EA20 file (resultado unificado): the tally of one office, with the candidates, alliances and totals."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time, decimal, integer, integer_or_none, yes_no
from app.infra.tse.parsers.common import generation_id


@dataclass
class RunningMateTSE:
    nome: str
    tipo: str


@dataclass
class CandidateTSE:
    sqcand: str
    numero: int
    nome: str
    nome_urna: str
    partido_sigla: str
    partido_numero: int
    agremiacao: str
    agremiacao_numero: str
    votos: int
    pct_validos: float
    eleito: bool
    situacao_tse: str
    destinacao: str
    vices: list[RunningMateTSE] = field(default_factory=list)


@dataclass
class AllianceTSE:
    numero: str
    nome: str
    tipo: str
    partidos: list[str]
    votos: int
    vagas: int | None


@dataclass
class TotalsTSE:
    eleitorado: int = 0
    eleitorado_apurado: int = 0
    secoes_total: int = 0
    secoes_totalizadas: int = 0
    pct_secoes: float = 0.0
    comparecimento: int = 0
    pct_comparecimento: float = 0.0
    abstencao: int = 0
    pct_abstencao: float = 0.0
    votos_total: int = 0
    votos_validos: int = 0
    pct_validos: float = 0.0
    brancos: int = 0
    pct_brancos: float = 0.0
    nulos: int = 0
    pct_nulos: float = 0.0


@dataclass
class ResultTSE:
    cd_eleicao: int
    turno: int
    cd_cargo: int
    vagas: int | None
    idg: str
    gerado_em: datetime | None
    totalizado_em: datetime | None
    final: bool
    matematicamente_definido: bool
    totais: TotalsTSE
    candidatos: list[CandidateTSE]
    agremiacoes: list[AllianceTSE]


def _pct(part: int, whole: int) -> float:
    return round(part * 100.0 / whole, 4) if whole else 0.0


def _totals(data: dict[str, Any]) -> TotalsTSE:
    sections = data.get("s") or {}
    electorate = data.get("e") or {}
    votes = data.get("v") or {}
    totals = TotalsTSE(
        eleitorado=integer(electorate.get("te")),
        eleitorado_apurado=integer(electorate.get("est")),
        secoes_total=integer(sections.get("ts")),
        secoes_totalizadas=integer(sections.get("st")),
        pct_secoes=decimal(sections.get("pstn", sections.get("pst"))),
        comparecimento=integer(electorate.get("c")),
        abstencao=integer(electorate.get("a")),
        votos_total=integer(votes.get("tv")),
        votos_validos=integer(votes.get("vv")),
        brancos=integer(votes.get("vb")),
        nulos=integer(votes.get("tvn", votes.get("vn"))),
    )
    if not totals.comparecimento and totals.votos_total:
        totals.comparecimento = totals.votos_total
    _turnout_percentages(totals, electorate)
    return totals


def _turnout_percentages(totals: TotalsTSE, electorate: dict[str, Any]) -> None:
    totals.pct_comparecimento = decimal(electorate.get("pcn", electorate.get("pc"))) or _pct(
        totals.comparecimento, totals.eleitorado_apurado
    )
    totals.pct_abstencao = decimal(electorate.get("pan", electorate.get("pa"))) or _pct(
        totals.abstencao, totals.eleitorado_apurado
    )
    base = totals.votos_total or totals.comparecimento
    totals.pct_validos = _pct(totals.votos_validos, base)
    totals.pct_brancos = _pct(totals.brancos, base)
    totals.pct_nulos = _pct(totals.nulos, base)
    if not totals.pct_secoes and totals.secoes_total:
        totals.pct_secoes = _pct(totals.secoes_totalizadas, totals.secoes_total)


def _select_office(data: dict[str, Any], cd_cargo: int | None) -> dict[str, Any] | None:
    offices: list[dict[str, Any]] = data.get("carg") or []
    if not offices:
        return None
    selected: dict[str, Any] = next(
        (o for o in offices if cd_cargo is None or integer(o.get("cd")) == cd_cargo), offices[0]
    )
    return selected


def _read_candidate(cand: dict[str, Any], party: dict[str, Any], alliance: dict[str, Any]) -> CandidateTSE:
    return CandidateTSE(
        sqcand=str(cand.get("sqcand") or cand.get("n")),
        numero=integer(cand.get("n")),
        nome=str(cand.get("nm") or ""),
        nome_urna=str(cand.get("nmu") or cand.get("nm") or ""),
        partido_sigla=str(party.get("sg") or ""),
        partido_numero=integer(party.get("n")),
        agremiacao=str(alliance.get("nm") or party.get("nm") or ""),
        agremiacao_numero=str(alliance.get("n") or ""),
        votos=integer(cand.get("vap")),
        pct_validos=decimal(cand.get("pvapn", cand.get("pvap"))),
        eleito=yes_no(cand.get("e")),
        situacao_tse=str(cand.get("st") or ""),
        destinacao=str(cand.get("dvt") or "Válido"),
        vices=[
            RunningMateTSE(nome=str(x.get("nmu") or x.get("nm") or ""), tipo=str(x.get("tp") or "v"))
            for x in (cand.get("vs") or [])
        ],
    )


def _read_alliance(alliance: dict[str, Any]) -> tuple[AllianceTSE, list[CandidateTSE]]:
    parties = alliance.get("par", []) or []
    acronyms = [str(p.get("sg") or "") for p in parties]
    candidates: list[CandidateTSE] = []
    votes = 0
    for party in parties:
        for cand in party.get("cand", []) or []:
            count = integer(cand.get("vap"))
            votes += count if str(cand.get("dvt") or "Válido").startswith("V") else 0
            candidates.append(_read_candidate(cand, party, alliance))
        votes += integer(party.get("tvl"))
    row = AllianceTSE(
        numero=str(alliance.get("n") or ""),
        nome=str(alliance.get("nm") or "/".join(acronyms)),
        tipo=str(alliance.get("tp") or "i"),
        partidos=acronyms,
        votos=integer(alliance.get("tvtl"), votes) or votes,
        vagas=integer_or_none(alliance.get("vag")),
    )
    return row, candidates


def _finish_percentages(totals: TotalsTSE, candidates: list[CandidateTSE]) -> None:
    if totals.votos_validos == 0 and candidates:
        totals.votos_validos = sum(c.votos for c in candidates if c.destinacao.startswith("V"))
    for candidate in candidates:
        if not candidate.pct_validos and totals.votos_validos:
            candidate.pct_validos = _pct(candidate.votos, totals.votos_validos)


def parse_result(data: dict[str, Any], cd_cargo: int | None = None) -> ResultTSE:
    totals = _totals(data)
    office = _select_office(data, cd_cargo)
    candidates: list[CandidateTSE] = []
    alliances: list[AllianceTSE] = []
    seats = None
    code = cd_cargo or 0
    if office:
        code = integer(office.get("cd"), code)
        seats = integer_or_none(office.get("nv"))
        for alliance in office.get("agr", []) or []:
            row, read = _read_alliance(alliance)
            alliances.append(row)
            candidates.extend(read)
    _finish_percentages(totals, candidates)
    candidates.sort(key=lambda c: (-c.votos, c.numero))
    md_raw = str(data.get("md") or "").strip().lower()
    return ResultTSE(
        cd_eleicao=integer(data.get("ele")),
        turno=integer(data.get("t"), 1),
        cd_cargo=code,
        vagas=seats,
        idg=generation_id(data),
        gerado_em=date_time(data.get("dg"), data.get("hg")),
        totalizado_em=date_time(data.get("dt"), data.get("ht")) or date_time(data.get("dg"), data.get("hg")),
        final=yes_no(data.get("tf")),
        matematicamente_definido=md_raw in {"s", "e", "sim"},
        totais=totals,
        candidatos=candidates,
        agremiacoes=alliances,
    )
