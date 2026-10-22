"""The rows and columns of the CSV exports.

The column headers are Portuguese on purpose: they are the file the person opens. The keys read from
the results dicts are the results module's.
"""

from typing import Any

RESULT_COLUMNS = [
    "recorte",
    "posicao",
    "numero",
    "nome_urna",
    "partido_sigla",
    "votos",
    "pct_validos",
    "situacao",
    "situacao_geral",
]

CHILDREN_COLUMNS = [
    "nivel",
    "id",
    "nome",
    "uf",
    "status",
    "pct_secoes",
    "eleitorado",
    "comparecimento",
    "votos_validos",
    "brancos",
    "nulos",
    "lider_nome",
    "lider_pct",
    "margem_pp",
]


def results_rows(data: dict[str, Any], geo_id: str) -> tuple[list[dict[str, Any]], list[str]]:
    rows = [
        {
            "recorte": geo_id,
            "posicao": c["position"],
            "numero": c["ballot_number"],
            "nome_urna": c["ballot_name"],
            "partido_sigla": c["party_abbreviation"],
            "votos": c["votes"],
            "pct_validos": c["valid_pct"],
            "situacao": c["status"],
            "situacao_geral": c["overall_status"],
        }
        for c in data.get("candidates", [])
    ]
    return rows, RESULT_COLUMNS


def children_rows(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    rows = [
        {
            "nivel": i["level"],
            "id": i["id"],
            "nome": i["name"],
            "uf": i["state_code"],
            "status": i["status"],
            "pct_secoes": i["pct_sections"],
            "eleitorado": i["electorate"],
            "comparecimento": i["turnout"],
            "votos_validos": i["valid_votes"],
            "brancos": i["blank_votes"],
            "nulos": i["null_votes"],
            "lider_nome": (i.get("leader") or {}).get("ballot_name"),
            "lider_pct": (i.get("leader") or {}).get("pct"),
            "margem_pp": i["margin_pp"],
        }
        for i in data["items"]
    ]
    return rows, CHILDREN_COLUMNS
