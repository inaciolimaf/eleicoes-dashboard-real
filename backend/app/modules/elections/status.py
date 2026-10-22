"""Situação do candidato (status). A situação de eleito vem SEMPRE do TSE; só LEADING é calculado por nós."""

ELECTED = "ELECTED"
RUNOFF = "RUNOFF"
MATHEMATICALLY_ELECTED = "MATHEMATICALLY_ELECTED"
LEADING = "LEADING"
SUBSTITUTE = "SUBSTITUTE"
NOT_ELECTED = "NOT_ELECTED"
SUB_JUDICE = "SUB_JUDICE"
COUNTING = "COUNTING"


def da_tse(eleito: bool, st: str, destinacao: str, final: bool, md: bool) -> str | None:
    """Mapeia os campos do TSE. Devolve None quando o TSE ainda não definiu a situação."""
    st_l = (st or "").strip().lower()
    dest = (destinacao or "Válido").strip().lower()
    if dest and not dest.startswith("v"):
        return SUB_JUDICE
    if "2º turno" in st_l or "2o turno" in st_l or "segundo turno" in st_l:
        return RUNOFF
    if eleito or st_l.startswith("eleito"):
        return ELECTED if final else MATHEMATICALLY_ELECTED
    if st_l.startswith("suplente"):
        return SUBSTITUTE
    if st_l.startswith("não eleito") or st_l.startswith("nao eleito"):
        return NOT_ELECTED
    return None


def calcular(
    candidatos: list[dict], vagas: int, final: bool, md: bool, abrangencia_do_cargo: bool
) -> dict[str, str]:
    """`candidatos` em ordem decrescente de votos: [{sq, v, e, st, d}].

    No nível da abrangência do cargo usa a situação do TSE; nos demais níveis (e enquanto o TSE não define),
    marca LEADING para os N primeiros com votos (N = vagas) e COUNTING para os outros.
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
            saida[c["sq"]] = LEADING
        else:
            saida[c["sq"]] = COUNTING
    return saida
