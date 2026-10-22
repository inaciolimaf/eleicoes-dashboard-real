"""Ingestion of the TSE files into the database, called by the collector and the worker."""

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

__all__ = [
    "BallotReportContext",
    "ResultContext",
    "candidate_number_map",
    "import_polling_places",
    "ingest_ballot_report",
    "ingest_catalog",
    "ingest_municipalities",
    "ingest_progress",
    "ingest_result",
    "ingest_sections",
    "known_candidate_ids",
    "read_polling_place_csv",
]
