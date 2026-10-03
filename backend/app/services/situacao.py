"""Situação do candidato. A situação de eleito vem SEMPRE do TSE; só LIDERANDO é calculado por nós."""

ELEITO = "ELEITO"
SEGUNDO_TURNO = "SEGUNDO_TURNO"
MATEMATICAMENTE_ELEITO = "MATEMATICAMENTE_ELEITO"
LIDERANDO = "LIDERANDO"
SUPLENTE = "SUPLENTE"
NAO_ELEITO = "NAO_ELEITO"
SUB_JUDICE = "SUB_JUDICE"
EM_APURACAO = "EM_APURACAO"


def da_tse(eleito: bool, st: str, destinacao: str, final: bool, md: bool) -> str | None:
    """Mapeia os campos do TSE. Devolve None quando o TSE ainda não definiu a situação."""
    st_l = (st or "").strip().lower()
    dest = (destinacao or "Válido").strip().lower()
    if dest and not dest.startswith("v"):
        return SUB_JUDICE
    if "2º turno" in st_l or "2o turno" in st_l or "segundo turno" in st_l:
        return SEGUNDO_TURNO
    if eleito or st_l.startswith("eleito"):
        return ELEITO if final else MATEMATICAMENTE_ELEITO
    if st_l.startswith("suplente"):
        return SUPLENTE
    if st_l.startswith("não eleito") or st_l.startswith("nao eleito"):
        return NAO_ELEITO
    return None


def calcular(
    candidatos: list[dict], vagas: int, final: bool, md: bool, abrangencia_do_cargo: bool
) -> dict[str, str]:
    """`candidatos` em ordem decrescente de votos: [{sq, v, e, st, d}].

    No nível da abrangência do cargo usa a situação do TSE; nos demais níveis (e enquanto o TSE não define),
    marca LIDERANDO para os N primeiros com votos (N = vagas) e EM_APURACAO para os outros.
    """
    saida: dict[str, str] = {}
    vagas = vagas or 0  # proporcionais: 0 -> ninguém "liderando" (vaga depende do partido)
    for pos, c in enumerate(candidatos):
        tse = da_tse(bool(c.get("e")), str(c.get("st") or ""), str(c.get("d") or "Válido"), final, md)
        if abrangencia_do_cargo and tse:
            saida[c["sq"]] = tse
        elif tse == SUB_JUDICE:
            saida[c["sq"]] = SUB_JUDICE
        elif pos < vagas and int(c.get("v") or 0) > 0:
            saida[c["sq"]] = LIDERANDO
        else:
            saida[c["sq"]] = EM_APURACAO
    return saida
