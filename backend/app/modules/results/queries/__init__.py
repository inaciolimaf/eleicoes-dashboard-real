"""Read queries: build the payloads of the API (the DTOs in `schemas.py` describe each one).

The API keys are in English (glossary). The status and level values come from the database; the
product text (titles, `Válido`, office names) stays in Portuguese.

The names exported here are the ones the public API and the worker call, through
`from app.modules.results import queries`.
"""

from app.modules.results.queries.candidates import detalhe_candidato, listar_candidatos
from app.modules.results.queries.children.query import filhos, item_filho
from app.modules.results.queries.common import iso, nome_recorte
from app.modules.results.queries.events import ConsultaEventos, evento_json, linha_do_tempo, listar_eventos
from app.modules.results.queries.polling.maps import ConsultaMapa, locais_mapa
from app.modules.results.queries.polling.place import detalhe_local, item_local
from app.modules.results.queries.search import buscar
from app.modules.results.queries.sections import detalhe_secao
from app.modules.results.queries.status import listar_eleicoes, pct_br, progresso, ultima_totalizacao
from app.modules.results.queries.tally.lines import linha_tse
from app.modules.results.queries.tally.result import montar_resultado
from app.modules.results.queries.tally.series import serie

__all__ = [
    "ConsultaEventos",
    "ConsultaMapa",
    "buscar",
    "detalhe_candidato",
    "detalhe_local",
    "detalhe_secao",
    "evento_json",
    "filhos",
    "iso",
    "item_filho",
    "item_local",
    "linha_do_tempo",
    "linha_tse",
    "listar_candidatos",
    "listar_eleicoes",
    "listar_eventos",
    "locais_mapa",
    "montar_resultado",
    "nome_recorte",
    "pct_br",
    "progresso",
    "serie",
    "ultima_totalizacao",
]
