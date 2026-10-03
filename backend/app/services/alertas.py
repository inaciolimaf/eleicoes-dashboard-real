"""Avaliação das regras de alerta dos usuários."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alerta

_cache: tuple[float, list[Alerta]] = (0.0, [])


async def ativos(session: AsyncSession) -> list[Alerta]:
    global _cache
    if time.monotonic() - _cache[0] > 10:
        rows = (await session.execute(select(Alerta).where(Alerta.ativo.is_(True), Alerta.disparado_em.is_(None)))).scalars().all()
        _cache = (time.monotonic(), list(rows))
    return _cache[1]


def invalidar_cache() -> None:
    global _cache
    _cache = (0.0, [])


def avaliar_resultado(alerta: Alerta, linha: dict, eventos: list[dict]) -> tuple[str, str] | None:
    p = alerta.params or {}
    if alerta.tipo == "pct_candidato":
        if int(p.get("cargo", 0)) != linha["cd_cargo"] or p.get("nivel") != linha["nivel"] or p.get("id") != linha["recorte_id"]:
            return None
        cand = next((c for c in linha.get("candidatos", []) if c["sq"] == p.get("sqcand")), None)
        if cand and cand.get("p", 0) >= float(p.get("limite", 0)):
            return "Alerta de percentual", f"Candidato passou de {p.get('limite')}% em {linha['recorte_id'].upper()}."
    if alerta.tipo == "apuracao":
        if p.get("nivel") == linha["nivel"] and p.get("id") == linha["recorte_id"] and \
                (linha.get("pct_secoes") or 0) >= float(p.get("limite", 100)):
            return "Alerta de apuração", f"{linha['recorte_id'].upper()} chegou a {p.get('limite')}% das seções apuradas."
    for ev in eventos:
        if alerta.tipo == "virada" and ev["tipo"] == "virada" and int(p.get("cargo", 0)) == ev["cd_cargo"] \
                and p.get("nivel") == ev["nivel"] and p.get("id") == ev["recorte_id"]:
            return ev["titulo"], ev["descricao"]
        if alerta.tipo == "eleito" and ev["tipo"] in ("eleito", "matematicamente_definido") \
                and ev.get("payload", {}).get("sqcand") == p.get("sqcand"):
            return ev["titulo"], ev["descricao"]
    return None


def avaliar_local(alerta: Alerta, local_id: str, status: str) -> tuple[str, str] | None:
    p = alerta.params or {}
    if alerta.tipo == "local_apurado" and p.get("local_id") == local_id and status == "apurado":
        return "Local de votação apurado", "Todas as seções do local foram totalizadas."
    return None


async def marcar_disparado(session: AsyncSession, alerta: Alerta) -> None:
    await session.execute(update(Alerta).where(Alerta.id == alerta.id).values(disparado_em=datetime.now(UTC)))
    await session.commit()
    invalidar_cache()
