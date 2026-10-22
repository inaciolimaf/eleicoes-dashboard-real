"""What the worker did with the ballot of a section, read by the diagnostics route.

Best effort: a failure to write the diagnostic must never fail the job.
"""

from __future__ import annotations

import contextlib
from datetime import datetime
from typing import Any

import orjson
from redis.asyncio import Redis

from app.infra.tse.bu import BoletimUrna
from app.worker.jobs.shared import ballot_ids

DIAGNOSTIC_TTL_SECONDS = 3600


async def record_worker(redis: Redis, section_id: str, data: dict[str, Any]) -> None:
    with contextlib.suppress(Exception):
        await redis.set(
            f"diag:section:{section_id}:worker",
            orjson.dumps({"at": datetime.now().isoformat(), **data}),
            ex=DIAGNOSTIC_TTL_SECONDS,
        )


def ballot_outcome(state_code: str, report: BoletimUrna, changed: list[tuple[int, str]]) -> dict[str, Any]:
    warning = None if changed else "município do BU não está no banco ou o local não foi recalculado"
    return {
        "ok": True,
        "ballot": {
            "municipality": report.municipio,
            "zone": report.zona,
            "polling_place": report.local,
            "section": report.secao,
        },
        "section_saved": ballot_ids(state_code, report).section,
        "polling_places_recalculated": changed,
        "warning": warning,
    }
