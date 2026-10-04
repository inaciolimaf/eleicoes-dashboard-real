"""Parsers tolerantes dos arquivos de divulgação do TSE -> estruturas normalizadas.

Todos os campos do TSE vêm como string; aqui viram int/float/datetime. Campos ausentes viram 0/None.
"""

from dataclasses import dataclass, field
from datetime import datetime

from app.tse.numeros import data_hora, decimal, inteiro, inteiro_ou_none, sim_nao

# ---------------------------------------------------------------- EA12 municípios



def _idg(dados: dict) -> str:
    """Identificador de geração. Sem `idg` no arquivo, usa a data/hora de geração: sem isso todas as gerações
    teriam idg 0 e só a primeira seria gravada (o snapshot é único por idg)."""
    idg = str(dados.get("idg") or "").strip()
    if idg.isdigit():
        return idg
    gerado = data_hora(dados.get("dg"), dados.get("hg")) or data_hora(dados.get("dt"), dados.get("ht"))
    return str(int(gerado.timestamp())) if gerado else ""

@dataclass
class MunicipioTSE:
    uf: str
    cd: int
    cd_ibge: int | None
    nome: str
    capital: bool
    zonas: list[int]


def parse_municipios(dados: dict) -> list[MunicipioTSE]:
    saida: list[MunicipioTSE] = []
    for abr in dados.get("abr", []) or []:
        uf = str(abr.get("cd") or "").lower()
        for mu in abr.get("mu", []) or []:
            saida.append(
                MunicipioTSE(
                    uf=uf,
                    cd=inteiro(mu.get("cd")),
                    cd_ibge=inteiro_ou_none(mu.get("cdi")),
                    nome=str(mu.get("nm") or "").strip(),
                    capital=sim_nao(mu.get("c")),
                    zonas=[inteiro(z) for z in (mu.get("z") or [])],
                )
            )
    return saida


# ---------------------------------------------------------------- EA14/EA15 acompanhamento


@dataclass
class ProgressoTSE:
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
class AcompanhamentoTSE:
    cd_eleicao: int
    turno: int
    idg: str
    gerado_em: datetime | None
    itens: list[ProgressoTSE]


def parse_acompanhamento(dados: dict) -> AcompanhamentoTSE:
    itens: list[ProgressoTSE] = []
    for a in dados.get("abr", []) or []:
        s = a.get("s") or {}
        e = a.get("e") or {}
        itens.append(
            ProgressoTSE(
                tipo=str(a.get("tpabr") or "").lower(),
                codigo=str(a.get("cdabr") or "").lower(),
                totalizado_em=data_hora(a.get("dt"), a.get("ht")),
                andamento=str(a.get("and") or ""),
                secoes_total=inteiro(s.get("ts")),
                secoes_totalizadas=inteiro(s.get("st")),
                pct_secoes=decimal(s.get("pstn", s.get("pst"))),
                eleitorado=inteiro(e.get("te")),
                eleitorado_apurado=inteiro(e.get("est")),
                comparecimento=inteiro(e.get("c")),
                pct_comparecimento=decimal(e.get("pcn", e.get("pc"))),
                abstencao=inteiro(e.get("a")),
                pct_abstencao=decimal(e.get("pan", e.get("pa"))),
                municipios_finalizados=inteiro(a.get("munf")),
                municipios_parciais=inteiro(a.get("munpt")),
                municipios_nao_recebidos=inteiro(a.get("munnr")),
            )
        )
    return AcompanhamentoTSE(
        cd_eleicao=inteiro(dados.get("ele")),
        turno=inteiro(dados.get("t"), 1),
        idg=_idg(dados),
        gerado_em=data_hora(dados.get("dg"), dados.get("hg")),
        itens=itens,
    )


# ---------------------------------------------------------------- EA20 resultado unificado


@dataclass
class ViceTSE:
    nome: str
    tipo: str


@dataclass
class CandidatoTSE:
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
    vices: list[ViceTSE] = field(default_factory=list)


@dataclass
class AgremiacaoTSE:
    numero: str
    nome: str
    tipo: str
    partidos: list[str]
    votos: int
    vagas: int | None


@dataclass
class TotaisTSE:
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
class ResultadoTSE:
    cd_eleicao: int
    turno: int
    cd_cargo: int
    vagas: int | None
    idg: str
    gerado_em: datetime | None
    totalizado_em: datetime | None
    final: bool
    matematicamente_definido: bool
    totais: TotaisTSE
    candidatos: list[CandidatoTSE]
    agremiacoes: list[AgremiacaoTSE]


def _pct(parte: int, todo: int) -> float:
    return round(parte * 100.0 / todo, 4) if todo else 0.0


def parse_resultado(dados: dict, cd_cargo: int | None = None) -> ResultadoTSE:
    s = dados.get("s") or {}
    e = dados.get("e") or {}
    v = dados.get("v") or {}

    totais = TotaisTSE(
        eleitorado=inteiro(e.get("te")),
        eleitorado_apurado=inteiro(e.get("est")),
        secoes_total=inteiro(s.get("ts")),
        secoes_totalizadas=inteiro(s.get("st")),
        pct_secoes=decimal(s.get("pstn", s.get("pst"))),
        comparecimento=inteiro(e.get("c")),
        abstencao=inteiro(e.get("a")),
        votos_total=inteiro(v.get("tv")),
        votos_validos=inteiro(v.get("vv")),
        brancos=inteiro(v.get("vb")),
        nulos=inteiro(v.get("tvn", v.get("vn"))),
    )
    if not totais.comparecimento and totais.votos_total:
        totais.comparecimento = totais.votos_total
    totais.pct_comparecimento = decimal(e.get("pcn", e.get("pc"))) or _pct(totais.comparecimento, totais.eleitorado_apurado)
    totais.pct_abstencao = decimal(e.get("pan", e.get("pa"))) or _pct(totais.abstencao, totais.eleitorado_apurado)
    base_votos = totais.votos_total or totais.comparecimento
    totais.pct_validos = _pct(totais.votos_validos, base_votos)
    totais.pct_brancos = _pct(totais.brancos, base_votos)
    totais.pct_nulos = _pct(totais.nulos, base_votos)
    if not totais.pct_secoes and totais.secoes_total:
        totais.pct_secoes = _pct(totais.secoes_totalizadas, totais.secoes_total)

    cargos = dados.get("carg") or []
    cargo = None
    if cargos:
        cargo = next((c for c in cargos if cd_cargo is None or inteiro(c.get("cd")) == cd_cargo), cargos[0])
    candidatos: list[CandidatoTSE] = []
    agremiacoes: list[AgremiacaoTSE] = []
    vagas = None
    cd = cd_cargo or 0
    if cargo:
        cd = inteiro(cargo.get("cd"), cd)
        vagas = inteiro_ou_none(cargo.get("nv"))
        for agr in cargo.get("agr", []) or []:
            partidos = agr.get("par", []) or []
            siglas = [str(p.get("sg") or "") for p in partidos]
            votos_agr = 0
            for par in partidos:
                for c in par.get("cand", []) or []:
                    votos = inteiro(c.get("vap"))
                    votos_agr += votos if str(c.get("dvt") or "Válido").startswith("V") else 0
                    candidatos.append(
                        CandidatoTSE(
                            sqcand=str(c.get("sqcand") or c.get("n")),
                            numero=inteiro(c.get("n")),
                            nome=str(c.get("nm") or ""),
                            nome_urna=str(c.get("nmu") or c.get("nm") or ""),
                            partido_sigla=str(par.get("sg") or ""),
                            partido_numero=inteiro(par.get("n")),
                            agremiacao=str(agr.get("nm") or par.get("nm") or ""),
                            agremiacao_numero=str(agr.get("n") or ""),
                            votos=votos,
                            pct_validos=decimal(c.get("pvapn", c.get("pvap"))),
                            eleito=sim_nao(c.get("e")),
                            situacao_tse=str(c.get("st") or ""),
                            destinacao=str(c.get("dvt") or "Válido"),
                            vices=[ViceTSE(nome=str(x.get("nmu") or x.get("nm") or ""), tipo=str(x.get("tp") or "v"))
                                   for x in (c.get("vs") or [])],
                        )
                    )
                votos_agr += inteiro(par.get("tvl"))
            agremiacoes.append(
                AgremiacaoTSE(
                    numero=str(agr.get("n") or ""),
                    nome=str(agr.get("nm") or "/".join(siglas)),
                    tipo=str(agr.get("tp") or "i"),
                    partidos=siglas,
                    votos=inteiro(agr.get("tvtl"), votos_agr) or votos_agr,
                    vagas=inteiro_ou_none(agr.get("vag")),
                )
            )
    if totais.votos_validos == 0 and candidatos:
        totais.votos_validos = sum(c.votos for c in candidatos if c.destinacao.startswith("V"))
    for c in candidatos:
        if not c.pct_validos and totais.votos_validos:
            c.pct_validos = _pct(c.votos, totais.votos_validos)
    candidatos.sort(key=lambda c: (-c.votos, c.numero))

    md_raw = str(dados.get("md") or "").strip().lower()
    return ResultadoTSE(
        cd_eleicao=inteiro(dados.get("ele")),
        turno=inteiro(dados.get("t"), 1),
        cd_cargo=cd,
        vagas=vagas,
        idg=_idg(dados),
        gerado_em=data_hora(dados.get("dg"), dados.get("hg")),
        totalizado_em=data_hora(dados.get("dt"), dados.get("ht")) or data_hora(dados.get("dg"), dados.get("hg")),
        final=sim_nao(dados.get("tf")),
        matematicamente_definido=md_raw in {"s", "e", "sim"},
        totais=totais,
        candidatos=candidatos,
        agremiacoes=agremiacoes,
    )


# ---------------------------------------------------------------- EA16 seções


@dataclass
class SecaoTSE:
    uf: str
    municipio: int
    zona: int
    secao: int
    agregadora: int | None


def parse_secoes(dados: dict) -> list[SecaoTSE]:
    saida: list[SecaoTSE] = []
    for abr in dados.get("abr", []) or []:
        uf = str(abr.get("cd") or "").lower()
        for mu in abr.get("mu", []) or []:
            cd_mu = inteiro(mu.get("cd"))
            for zon in mu.get("zon", []) or []:
                cd_z = inteiro(zon.get("cd"))
                for sec in zon.get("sec", []) or []:
                    ns = inteiro(sec.get("ns"))
                    nsp = inteiro_ou_none(sec.get("nsp"))
                    saida.append(SecaoTSE(uf=uf, municipio=cd_mu, zona=cd_z, secao=ns,
                                          agregadora=nsp if nsp and nsp != ns else None))
    return saida


# ---------------------------------------------------------------- EA18 auxiliar de seção


@dataclass
class ArquivoUrnaTSE:
    hash: str
    status: str
    recebido_em: datetime | None
    arquivos: list[str]

    @property
    def totalizado(self) -> bool:
        return self.status.lower().startswith("totalizad")

    def nome_bu(self) -> str | None:
        return next((n for n in self.arquivos if n.endswith(".bu")), None)


@dataclass
class AuxiliarSecaoTSE:
    status: str
    urnas: list[ArquivoUrnaTSE]

    def urna_totalizada(self) -> ArquivoUrnaTSE | None:
        tot = [u for u in self.urnas if u.totalizado and u.nome_bu()]
        if not tot:
            return None
        # Mais de uma urna totalizada (substituição): usa a mais recente.
        return max(tot, key=lambda u: u.recebido_em.timestamp() if u.recebido_em else 0.0)


def parse_auxiliar(dados: dict) -> AuxiliarSecaoTSE:
    urnas = [
        ArquivoUrnaTSE(
            hash=str(h.get("hash") or ""),
            status=str(h.get("st") or ""),
            recebido_em=data_hora(h.get("dr"), h.get("hr")),
            arquivos=[str(n) for n in (h.get("nmarq") or [])],
        )
        for h in (dados.get("hashes") or [])
    ]
    return AuxiliarSecaoTSE(status=str(dados.get("st") or ""), urnas=urnas)
