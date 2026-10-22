"""Results: live tally, snapshots, progress, result queries and ingestion."""

from app.modules.results import ingestion, queries
from app.modules.results.models import ProgressoAtual, ProgressoSnapshot, ResultadoAtual, Snapshot

__all__ = [
    "ProgressoAtual",
    "ProgressoSnapshot",
    "ResultadoAtual",
    "Snapshot",
    "ingestion",
    "queries",
]
