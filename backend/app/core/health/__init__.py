"""`/health` probe: the database and Redis state (`probes`)."""

from app.core.health.probes import router

__all__ = ["router"]
