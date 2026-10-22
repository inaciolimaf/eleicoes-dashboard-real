"""Ingestion of the TSE files into the database, called by the collector and the worker.

The collector and the worker still use the Portuguese names below; they are aliases of the English
ones, which are the names for new code. Context fields keep their Portuguese spelling because the
worker builds them with keyword arguments.
"""

from app.modules.results.ingestion.ballot_reports import (
    BallotReportContext,
    candidate_number_map,
    ingest_ballot_report,
)
from app.modules.results.ingestion.candidates import known_candidate_ids
from app.modules.results.ingestion.catalog import ingest_catalog
from app.modules.results.ingestion.geography import (
    import_polling_places,
    ingest_municipalities,
    ingest_sections,
    read_polling_place_csv,
)
from app.modules.results.ingestion.progress import ingest_progress
from app.modules.results.ingestion.results import ResultContext, ingest_result

Contexto = ResultContext
BoletimContexto = BallotReportContext
ingerir_catalogo = ingest_catalog
ingerir_municipios = ingest_municipalities
ingerir_secoes = ingest_sections
ler_csv_locais = read_polling_place_csv
importar_locais = import_polling_places
ingerir_resultado = ingest_result
ingerir_progresso = ingest_progress
mapa_numeros = candidate_number_map
ingerir_boletim = ingest_ballot_report
_candidatos_conhecidos = known_candidate_ids

__all__ = [
    "BallotReportContext",
    "BoletimContexto",
    "Contexto",
    "ResultContext",
    "candidate_number_map",
    "import_polling_places",
    "importar_locais",
    "ingerir_boletim",
    "ingerir_catalogo",
    "ingerir_municipios",
    "ingerir_progresso",
    "ingerir_resultado",
    "ingerir_secoes",
    "ingest_ballot_report",
    "ingest_catalog",
    "ingest_municipalities",
    "ingest_progress",
    "ingest_result",
    "ingest_sections",
    "known_candidate_ids",
    "ler_csv_locais",
    "mapa_numeros",
    "read_polling_place_csv",
]
