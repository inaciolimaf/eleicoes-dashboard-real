"""Paleta categórica neutra (sem associação partidária) atribuída pela ordem do número do candidato."""

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


def cor_por_ordem(posicao: int) -> str:
    return PALETA[posicao % len(PALETA)]


def cores_por_numero(numeros: list[int]) -> dict[int, str]:
    return {n: cor_por_ordem(i) for i, n in enumerate(sorted(set(numeros)))}


def cor_partido(numero: int) -> str:
    return PALETA[(numero * 7) % len(PALETA)]


def cor_texto(texto: str) -> str:
    """Cor estável para um nome (ex.: agremiação), igual em qualquer processo."""
    import hashlib

    return PALETA[int(hashlib.md5(texto.encode()).hexdigest()[:6], 16) % len(PALETA)]
