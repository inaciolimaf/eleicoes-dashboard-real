"""Dados fixos do mock: UFs, regiões, capitais, partidos fictícios e listas de nomes."""

UFS = {
    "ac": ("Acre", "Norte", 8), "al": ("Alagoas", "Nordeste", 9), "am": ("Amazonas", "Norte", 8),
    "ap": ("Amapá", "Norte", 8), "ba": ("Bahia", "Nordeste", 39), "ce": ("Ceará", "Nordeste", 22),
    "df": ("Distrito Federal", "Centro-Oeste", 8), "es": ("Espírito Santo", "Sudeste", 10),
    "go": ("Goiás", "Centro-Oeste", 17), "ma": ("Maranhão", "Nordeste", 18), "mg": ("Minas Gerais", "Sudeste", 53),
    "ms": ("Mato Grosso do Sul", "Centro-Oeste", 8), "mt": ("Mato Grosso", "Centro-Oeste", 8),
    "pa": ("Pará", "Norte", 17), "pb": ("Paraíba", "Nordeste", 12), "pe": ("Pernambuco", "Nordeste", 25),
    "pi": ("Piauí", "Nordeste", 10), "pr": ("Paraná", "Sul", 30), "rj": ("Rio de Janeiro", "Sudeste", 46),
    "rn": ("Rio Grande do Norte", "Nordeste", 8), "ro": ("Rondônia", "Norte", 8), "rr": ("Roraima", "Norte", 8),
    "rs": ("Rio Grande do Sul", "Sul", 31), "sc": ("Santa Catarina", "Sul", 16), "se": ("Sergipe", "Nordeste", 8),
    "sp": ("São Paulo", "Sudeste", 70), "to": ("Tocantins", "Norte", 8),
}

CAPITAIS = {
    1200401, 2704302, 1302603, 1600303, 2927408, 2304400, 5300108, 3205309, 5208707, 2111300, 3106200,
    5002704, 5103403, 1501402, 2507507, 2611606, 2211001, 4106902, 3304557, 2408102, 1100205, 1400100,
    4314902, 4205407, 2800308, 3550308, 1721000,
}


def vagas_estaduais(dep_fed: int) -> int:
    """Art. 27 da Constituição: triplo da bancada federal até 36; acima disso, +1 por deputado federal acima de 12."""
    return dep_fed * 3 if dep_fed * 3 <= 36 else 36 + (dep_fed - 12)


# (número, sigla, nome, federação)
PARTIDOS = [
    (10, "PAL", "Partido Alfa", "Federação Aurora"),
    (12, "PBE", "Partido Beta", "Federação Aurora"),
    (15, "PGA", "Partido Gama", "Federação Horizonte"),
    (18, "PDE", "Partido Delta", "Federação Horizonte"),
    (20, "PEP", "Partido Épsilon", "Federação Horizonte"),
    (23, "PZE", "Partido Zeta", None),
    (27, "PET", "Partido Eta", None),
    (30, "PTE", "Partido Teta", None),
    (33, "PIO", "Partido Iota", None),
    (36, "PKA", "Partido Capa", None),
    (40, "PLA", "Partido Lambda", None),
    (44, "PMU", "Partido Mi", None),
]

NUMEROS_FEDERACAO = {"Federação Aurora": "70000001", "Federação Horizonte": "70000002"}

PRIMEIROS = [
    "ANA", "BRUNO", "CARLA", "DANIEL", "EDUARDA", "FÁBIO", "GABRIELA", "HELENA", "IGOR", "JULIANA", "KLEBER", "LARISSA",
    "MARCOS", "NATÁLIA", "OTÁVIO", "PATRÍCIA", "RAFAEL", "SABRINA", "TIAGO", "ÚRSULA", "VALTER", "WANDA", "YARA",
    "ZECA", "ADRIANA", "BENEDITO", "CÍCERA", "DOUGLAS", "ELIANE", "FRANCISCO", "GERALDO", "HUGO", "ISABEL",
    "JOAQUIM", "LÚCIA", "MAURO", "NEIDE", "OSVALDO", "PAULO", "RITA", "SÉRGIO", "TERESA", "VÂNIA", "WILSON",
    "ALICE", "CAIO", "DÉBORA", "ENZO", "FLÁVIA", "GUSTAVO", "IRENE", "JOÃO", "LEILA", "MÁRCIO", "NÚBIA", "RENATO",
]
SOBRENOMES = [
    "ALMEIDA", "BARBOSA", "CARVALHO", "DIAS", "ESTEVES", "FERREIRA", "GOMES", "HOLANDA", "IGNÁCIO", "JARDIM",
    "LACERDA", "MACEDO", "NOGUEIRA", "OLIVEIRA", "PEIXOTO", "QUEIROZ", "RIBEIRO", "SANTANA", "TAVARES", "UCHÔA",
    "VASCONCELOS", "XAVIER", "ZANETTI", "ARAÚJO", "BRAGA", "CAMPOS", "DUARTE", "FALCÃO", "GUIMARÃES", "LIMA",
    "MONTEIRO", "NUNES", "PRADO", "REZENDE", "SIQUEIRA", "TORRES", "VIANA", "AMARAL", "BORGES", "CUNHA",
]
APELIDOS = ["DO POVO", "DA SAÚDE", "PROFESSOR", "PROFESSORA", "DOUTOR", "DOUTORA", "DO BAIRRO", "PASTOR", "DELEGADO",
            "ENFERMEIRA", "CAMINHONEIRO", "DA FEIRA", "DO ESPORTE"]

TIPOS_LOCAL = ["ESCOLA ESTADUAL", "ESCOLA MUNICIPAL", "EMEF", "COLÉGIO ESTADUAL", "CENTRO EDUCACIONAL",
               "UNIDADE ESCOLAR", "E.E.F.M.", "CENTRO DE ENSINO", "FACULDADE", "GINÁSIO MUNICIPAL"]
HOMENAGEADOS = ["PROF. " + s for s in SOBRENOMES[:15]] + ["DOM PEDRO II", "TIRADENTES", "SANTOS DUMONT", "MACHADO DE ASSIS",
                "CECÍLIA MEIRELES", "PAULO FREIRE", "ANITA GARIBALDI", "MONTEIRO LOBATO", "RUI BARBOSA",
                "CORA CORALINA", "VILLA-LOBOS", "OSWALDO CRUZ", "CARLOS CHAGAS", "ZUMBI DOS PALMARES",
                "CHIQUINHA GONZAGA", "NISE DA SILVEIRA", "CÂNDIDO RONDON", "ADOLFO LUTZ"]
BAIRROS = ["CENTRO", "JARDIM AMÉRICA", "VILA NOVA", "SÃO JOSÉ", "BELA VISTA", "SANTA CRUZ", "BOA VISTA", "ALTO ALEGRE",
           "PARQUE INDUSTRIAL", "JARDIM DAS FLORES", "VILA MARIA", "NOVA ESPERANÇA", "SANTO ANTÔNIO", "CIDADE NOVA",
           "LIBERDADE", "PRIMAVERA", "SÃO FRANCISCO", "PLANALTO", "ZONA RURAL", "VILA RICA"]
LOGRADOUROS = ["RUA", "AVENIDA", "TRAVESSA", "PRAÇA", "ALAMEDA", "RODOVIA"]
