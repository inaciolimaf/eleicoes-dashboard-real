"""Avaliação das regras de alerta dos usuários.

Parâmetros de alerta (JSON guardado em `alerts.params`): `office_code`, `level`, `geo_area_id`,
`tse_candidate_id`, `threshold`, `polling_place_id`.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.alerts.models import Alert

_cache: tuple[float, list[Alert]] = (0.0, [])


async def ativos(session: AsyncSession) -> list[Alert]:
    global _cache
    if time.monotonic() - _cache[0] > 10:
        rows = (
            (await session.execute(select(Alert).where(Alert.active.is_(True), Alert.triggered_at.is_(None))))
            .scalars()
            .all()
        )
        _cache = (time.monotonic(), list(rows))
    return _cache[1]


def invalidar_cache() -> None:
    global _cache
    _cache = (0.0, [])


def avaliar_resultado(alerta: Alert, linha: dict, eventos: list[dict]) -> tuple[str, str] | None:
    p = alerta.params or {}
    if alerta.type == "candidate_pct":
        if (
            int(p.get("office_code", 0)) != linha["office_code"]
            or p.get("level") != linha["level"]
            or p.get("geo_area_id") != linha["geo_area_id"]
        ):
            return None
        cand = next((c for c in linha.get("candidates", []) if c["sq"] == p.get("tse_candidate_id")), None)
        if cand and cand.get("p", 0) >= float(p.get("threshold", 0)):
            return (
                "Alerta de percentual",
                f"Candidato passou de {p.get('threshold')}% em {linha['geo_area_id'].upper()}.",
            )
    if alerta.type == "tally_threshold" and (
        p.get("level") == linha["level"]
        and p.get("geo_area_id") == linha["geo_area_id"]
        and (linha.get("pct_sections") or 0) >= float(p.get("threshold", 100))
    ):
        return (
            "Alerta de apuração",
            f"{linha['geo_area_id'].upper()} chegou a {p.get('threshold')}% das seções apuradas.",
        )
    for ev in eventos:
        if (
            alerta.type == "lead_change"
            and ev["type"] == "lead_change"
            and int(p.get("office_code", 0)) == ev["office_code"]
            and p.get("level") == ev["level"]
            and p.get("geo_area_id") == ev["geo_area_id"]
        ):
            return ev["title"], ev["description"]
        if (
            alerta.type == "elected"
            and ev["type"] in ("elected", "mathematically_decided")
            and ev.get("payload", {}).get("tse_candidate_id") == p.get("tse_candidate_id")
        ):
            return ev["title"], ev["description"]
    return None


def avaliar_local(alerta: Alert, local_id: str, status: str) -> tuple[str, str] | None:
    p = alerta.params or {}
    if (
        alerta.type == "polling_place_tallied"
        and p.get("polling_place_id") == local_id
        and status == "tallied"
    ):
        return "Local de votação apurado", "Todas as seções do local foram totalizadas."
    return None


async def marcar_disparado(session: AsyncSession, alerta: Alert) -> None:
    await session.execute(update(Alert).where(Alert.id == alerta.id).values(triggered_at=datetime.now(UTC)))
    invalidar_cache()
