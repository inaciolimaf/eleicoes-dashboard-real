from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.tse.parsers import ProgressTSE, TrackingTSE
from app.modules.geography import municipality_id_of
from app.modules.results.ingestion.common import now
from app.modules.results.models import CurrentProgress, ProgressSnapshot

_CURRENT_KEY = ("round", "level", "geo_area_id")


@dataclass(frozen=True)
class _Area:
    level: str
    geo_area_id: str
    state_code: str


async def ingest_progress(
    session: AsyncSession,
    round_number: int,
    acomp: TrackingTSE,
    file_uf: str,
    captured_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Writes the progress lines that changed; each carries `anterior_secoes` (tallied before)."""
    changed: list[dict[str, Any]] = []
    for item in acomp.items:
        area = _area_of(item, file_uf)
        row = _progress_row(round_number, area, item, acomp, captured_at)
        current = await _current_progress(session, round_number, area)
        if _unchanged(current, item):
            continue
        if area.level != "municipality":
            await session.execute(insert(ProgressSnapshot).values(**row).on_conflict_do_nothing())
        await _upsert_current(session, row)
        row["anterior_secoes"] = current.sections_tallied if current else 0
        changed.append(row)
    await session.flush()
    return changed


def _area_of(item: ProgressTSE, file_uf: str) -> _Area:
    if item.tipo == "br":
        return _Area("country", "br", "br")
    if item.tipo == "uf":
        return _Area("state", item.code, item.code)
    geo_area_id = item.code if item.code[:2].isalpha() else municipality_id_of(file_uf, int(item.code))
    return _Area("municipality", geo_area_id, file_uf)


def _progress_row(
    round_number: int, area: _Area, item: ProgressTSE, acomp: TrackingTSE, captured_at: datetime | None
) -> dict[str, Any]:
    return {
        "round": round_number,
        "level": area.level,
        "geo_area_id": area.geo_area_id,
        "state_code": area.state_code,
        "generation_id": int(acomp.generation_id or 0),
        "tallied_at": item.tallied_at,
        "captured_at": captured_at or now(),
        "progress_code": item.progress_code,
        "sections_total": item.sections_total,
        "sections_tallied": item.sections_tallied,
        "pct_sections": item.pct_sections,
        "electorate": item.electorate,
        "turnout": item.turnout,
        "pct_turnout": item.pct_turnout,
        "municipalities_completed": item.municipalities_completed,
        "municipalities_partial": item.municipalities_partial,
        "municipalities_not_received": item.municipalities_not_received,
    }


async def _current_progress(session: AsyncSession, round_number: int, area: _Area) -> CurrentProgress | None:
    current: CurrentProgress | None = (
        await session.execute(
            select(CurrentProgress).where(
                CurrentProgress.round == round_number,
                CurrentProgress.level == area.level,
                CurrentProgress.geo_area_id == area.geo_area_id,
            )
        )
    ).scalar_one_or_none()
    return current


def _unchanged(current: CurrentProgress | None, item: ProgressTSE) -> bool:
    return (
        current is not None
        and current.sections_tallied == item.sections_tallied
        and current.tallied_at == item.tallied_at
    )


async def _upsert_current(session: AsyncSession, row: dict[str, Any]) -> None:
    stmt = insert(CurrentProgress).values(**row)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=list(_CURRENT_KEY),
            set_={k: getattr(stmt.excluded, k) for k in row if k not in _CURRENT_KEY},
        )
    )
