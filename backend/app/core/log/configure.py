"""Logging for every process: structlog events and stdlib records share one renderer.

JSON lines in production (the log collector parses them), a readable console everywhere else.
Stdlib loggers (`logging.getLogger(...)`, httpx, uvicorn) pass through the same pipeline, so
existing calls keep working without rewriting them.
"""

import logging
import sys

import structlog
from structlog.typing import Processor

from app.core.config import Settings, get_settings

#: Loggers that uvicorn configures with its own handlers; they are routed to the root instead.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


def configure_logging(settings: Settings | None = None) -> None:
    """Configure structlog and the root logger. Safe to call again (tests and each process)."""
    settings = settings or get_settings()
    shared = _shared_processors()
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared,
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, _renderer(settings)],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level)
    for name in UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True


def _shared_processors() -> list[Processor]:
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]


def _renderer(settings: Settings) -> Processor:
    if settings.environment == "production":
        return structlog.processors.JSONRenderer()
    return structlog.dev.ConsoleRenderer()
