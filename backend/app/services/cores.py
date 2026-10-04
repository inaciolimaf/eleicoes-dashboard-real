"""Cores dos candidatos conforme a cor tradicional do partido (pelo número/sigla).

Partidos sem cor conhecida caem numa paleta categórica estável.
"""

import hashlib
import re

PALETA = [
    "#3B82F6",  # azul
    "#F97316",  # laranja
    "#10B981",  # verde-esmeralda
    "#A855F7",  # roxo
    "#EAB308",  # amarelo
    "#EC4899",  # rosa
    "#14B8A6",  # turquesa
    "#EF4444",  # vermelho
    "#84CC16",  # lima
    "#6366F1",  # índigo
    "#F59E0B",  # âmbar
    "#06B6D4",  # ciano
]

# número do partido -> (sigla, cor)
PARTIDOS: dict[int, tuple[str, str]] = {
    10: ("REPUBLICANOS", "#1F6FB2"),
    11: ("PP", "#5DA9E9"),
    12: ("PDT", "#E4572E"),
    13: ("PT", "#D7191C"),
    14: ("PTB", "#2E7D32"),
    15: ("MDB", "#2E9E48"),
    16: ("PSTU", "#B71C1C"),
    18: ("REDE", "#F28C28"),
    19: ("PODE", "#22B14C"),
    20: ("PSC", "#1B7F3A"),
    21: ("PCB", "#C62828"),
    22: ("PL", "#0B3D91"),
    23: ("CIDADANIA", "#E6007E"),
    25: ("PRD", "#1E4FA0"),
    27: ("DC", "#7CB342"),
    28: ("PRTB", "#00897B"),
    29: ("PCO", "#8E0000"),
    30: ("NOVO", "#F26522"),
    33: ("PMN", "#C0392B"),
    35: ("PMB", "#AD1457"),
    36: ("AGIR", "#4A90E2"),
    40: ("PSB", "#F2C200"),
    43: ("PV", "#00A651"),
    44: ("UNIÃO", "#2A4D9B"),
    45: ("PSDB", "#0A84D6"),
    50: ("PSOL", "#8E24AA"),
    55: ("PSD", "#F5A623"),
    65: ("PCdoB", "#A50F15"),
    70: ("AVANTE", "#00A3AD"),
    77: ("SOLIDARIEDADE", "#FF8C00"),
    80: ("UP", "#7B1F1F"),
    90: ("PROS", "#F57C00"),
}

_POR_SIGLA = {sigla.upper(): cor for sigla, cor in PARTIDOS.values()}
_POR_SIGLA.update({"UNIAO": PARTIDOS[44][1], "PODEMOS": PARTIDOS[19][1], "PC DO B": PARTIDOS[65][1],
                   "SD": PARTIDOS[77][1], "SOLIDARIEDADE": PARTIDOS[77][1], "REPUBLICANO": PARTIDOS[10][1]})


def cor_por_ordem(posicao: int) -> str:
    return PALETA[posicao % len(PALETA)]


def cor_texto(texto: str) -> str:
    """Cor estável para um texto qualquer, igual em qualquer processo."""
    return PALETA[int(hashlib.md5(texto.encode()).hexdigest()[:6], 16) % len(PALETA)]


def cor_sigla(sigla: str | None) -> str | None:
    if not sigla:
        return None
    return _POR_SIGLA.get(sigla.strip().upper())


def cor_partido(numero: int) -> str:
    """Cor pelo número do partido (ou de candidato: os 2 primeiros dígitos são o partido)."""
    n = abs(int(numero))
    while n >= 100:
        n //= 10
    p = PARTIDOS.get(n)
    return p[1] if p else PALETA[(n * 7) % len(PALETA)]


def cor_agremiacao(nome: str) -> str:
    """Federação/coligação: usa a cor do primeiro partido reconhecido no nome."""
    for parte in re.split(r"[/,;\-–()]+|\s+", nome or ""):
        cor = cor_sigla(parte)
        if cor:
            return cor
    return cor_sigla(nome) or cor_texto(nome or "")


def cor_candidato(numero: int | None, partido_numero: int | None = None, partido_sigla: str | None = None) -> str:
    cor = cor_sigla(partido_sigla)
    if cor:
        return cor
    if partido_numero:
        return cor_partido(partido_numero)
    if numero is not None:
        return cor_partido(numero)
    return "#888888"


def cor_de(c) -> str:
    """Cor de um registro Candidato (ou None)."""
    if c is None:
        return "#888888"
    return cor_candidato(c.numero, c.partido_numero, c.partido_sigla)


def cores_por_numero(numeros: list[int]) -> dict[int, str]:
    return {n: cor_partido(n) for n in set(numeros)}
