"""Avaliação das regras de alerta dos usuários."""

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
    if alerta.type == "pct_candidato":
        if (
            int(p.get("cargo", 0)) != linha["office_code"]
            or p.get("nivel") != linha["level"]
            or p.get("id") != linha["geo_area_id"]
        ):
            return None
        cand = next((c for c in linha.get("candidates", []) if c["sq"] == p.get("sqcand")), None)
        if cand and cand.get("p", 0) >= float(p.get("limite", 0)):
            return (
                "Alerta de percentual",
                f"Candidato passou de {p.get('limite')}% em {linha['geo_area_id'].upper()}.",
            )
    if alerta.type == "apuracao" and (
        p.get("nivel") == linha["level"]
        and p.get("id") == linha["geo_area_id"]
        and (linha.get("pct_sections") or 0) >= float(p.get("limite", 100))
    ):
        return (
            "Alerta de apuração",
            f"{linha['geo_area_id'].upper()} chegou a {p.get('limite')}% das seções apuradas.",
        )
    for ev in eventos:
        if (
            alerta.type == "virada"
            and ev["type"] == "virada"
            and int(p.get("cargo", 0)) == ev["office_code"]
            and p.get("nivel") == ev["level"]
            and p.get("id") == ev["geo_area_id"]
        ):
            return ev["title"], ev["description"]
        if (
            alerta.type == "eleito"
            and ev["type"] in ("eleito", "matematicamente_definido")
            and ev.get("payload", {}).get("sqcand") == p.get("sqcand")
        ):
            return ev["title"], ev["description"]
    return None


def avaliar_local(alerta: Alert, local_id: str, status: str) -> tuple[str, str] | None:
    p = alerta.params or {}
    if alerta.type == "local_apurado" and p.get("local_id") == local_id and status == "apurado":
        return "Local de votação apurado", "Todas as seções do local foram totalizadas."
    return None


async def marcar_disparado(session: AsyncSession, alerta: Alert) -> None:
    await session.execute(update(Alert).where(Alert.id == alerta.id).values(triggered_at=datetime.now(UTC)))
    await session.commit()
    invalidar_cache()
