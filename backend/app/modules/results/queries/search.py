"""`/search`: one list of states, municipalities, candidates, polling places, zones and sections."""

from __future__ import annotations

import unicodedata
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.modules.elections import Candidate
from app.modules.geography import ElectoralZone, Municipality, PollingPlace, PollingSection, State
from app.modules.results.queries.common import OFFICE_NAMES

#: Words that ask for a zone or a section number in the query (accent-free, as `without_accents` gives).
ZONE_WORDS = ("zona", "z")
SECTION_WORDS = ("secao", "seção", "s")


def without_accents(texto: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", texto) if unicodedata.category(ch) != "Mn"
    ).lower()


def _unaccented(column: Any) -> Any:
    return func.unaccent(func.lower(column))


async def _state_hits(session: AsyncSession, q: str, term: str) -> list[dict[str, Any]]:
    conditions: list[ColumnElement[bool]] = [_unaccented(State.name).ilike(term)]
    if len(q) == 2:
        conditions.append(State.code == q.lower()[:2])
    states = (await session.execute(select(State).where(or_(*conditions)))).scalars().all()
    return [
        {"type": "state", "level": "state", "id": u.code, "title": u.name, "subtitle": u.code.upper()}
        for u in states
    ]


async def _municipality_hits(session: AsyncSession, term: str, limit: int) -> list[dict[str, Any]]:
    stmt = (
        select(Municipality)
        .where(_unaccented(Municipality.name).ilike(term))
        .order_by(
            Municipality.is_capital.desc(),
            func.coalesce(Municipality.electorate, 0).desc(),
            Municipality.name,
        )
        .limit(limit)
    )
    municipalities = (await session.execute(stmt)).scalars().all()
    return [
        {
            "type": "municipality",
            "level": "municipality",
            "id": m.id,
            "title": m.name,
            "subtitle": f"{m.state_code.upper()}"
            + (f" · {m.electorate:,} eleitores".replace(",", ".") if m.electorate else ""),
        }
        for m in municipalities
    ]


async def _candidate_hits(
    session: AsyncSession, q: str, term: str, number: str, limit: int
) -> list[dict[str, Any]]:
    conditions: list[ColumnElement[bool]] = [
        _unaccented(Candidate.ballot_name).ilike(term),
        _unaccented(Candidate.name).ilike(term),
    ]
    if number and len(number) == len(q.replace(" ", "")):
        conditions.append(Candidate.ballot_number == int(number))
    stmt = select(Candidate).where(or_(*conditions)).order_by(Candidate.office_code).limit(limit)
    candidates = (await session.execute(stmt)).scalars().all()
    return [
        {
            "type": "candidate",
            "id": c.tse_candidate_id,
            "title": f"{c.ballot_name} ({c.ballot_number})",
            "subtitle": f"{OFFICE_NAMES.get(c.office_code, c.office_code)} · {c.party_abbreviation}"
            + (f" · {c.state_code.upper()}" if c.state_code != "br" else ""),
            "office_code": c.office_code,
            "state_code": None if c.state_code == "br" else c.state_code,
        }
        for c in candidates
    ]


async def _polling_place_hits(session: AsyncSession, term: str, limit: int) -> list[dict[str, Any]]:
    stmt = (
        select(PollingPlace, Municipality.name)
        .join(Municipality, Municipality.id == PollingPlace.municipality_id)
        .where(
            or_(
                _unaccented(PollingPlace.name).ilike(term),
                _unaccented(PollingPlace.neighborhood).ilike(term),
                _unaccented(PollingPlace.address).ilike(term),
            )
        )
        .limit(limit)
    )
    return [
        {
            "type": "polling_place",
            "level": "polling_place",
            "id": loc.id,
            "title": loc.name,
            "subtitle": f"{(loc.neighborhood or '').title()} · {mn}/{loc.state_code.upper()}",
        }
        for loc, mn in (await session.execute(stmt)).all()
    ]


async def _zone_hits(session: AsyncSession, number: int, rest: str, limit: int) -> list[dict[str, Any]]:
    stmt = (
        select(ElectoralZone, Municipality.name)
        .join(Municipality, Municipality.id == ElectoralZone.municipality_id)
        .where(ElectoralZone.number == number)
    )
    if rest:
        stmt = stmt.where(_unaccented(Municipality.name).ilike(f"%{rest}%"))
    return [
        {
            "type": "zone",
            "level": "zone",
            "id": obj.id,
            "title": f"Zona {obj.number}",
            "subtitle": f"{mn}/{obj.state_code.upper()}",
        }
        for obj, mn in (await session.execute(stmt.limit(limit))).all()
    ]


async def _section_hits(session: AsyncSession, number: int, rest: str, limit: int) -> list[dict[str, Any]]:
    stmt = (
        select(PollingSection, Municipality.name)
        .join(Municipality, Municipality.id == PollingSection.municipality_id)
        .where(PollingSection.number == number)
    )
    if rest:
        stmt = stmt.where(_unaccented(Municipality.name).ilike(f"%{rest}%"))
    return [
        {
            "type": "section",
            "level": "section",
            "id": obj.id,
            "title": f"Seção {obj.number}",
            "subtitle": f"{mn}/{obj.state_code.upper()}",
        }
        for obj, mn in (await session.execute(stmt.limit(limit))).all()
    ]


async def _numbered_hits(session: AsyncSession, q: str, number: str, limit: int) -> list[dict[str, Any]]:
    """Zone or section number typed as `zona 12` or `secao 120`, optionally with a municipality."""
    words = without_accents(q).split()
    if not (number and words and words[0] in ZONE_WORDS + SECTION_WORDS):
        return []
    rest = " ".join(p for p in words[1:] if not p.isdigit())
    if words[0] in ZONE_WORDS:
        return await _zone_hits(session, int(number), rest, limit)
    return await _section_hits(session, int(number), rest, limit)


async def search_items(session: AsyncSession, q: str, limit: int = 20) -> dict[str, Any]:
    q = q.strip()
    if len(q) < 2:
        return {"items": []}
    term = f"%{without_accents(q)}%"
    number = "".join(ch for ch in q if ch.isdigit())
    items: list[dict[str, Any]] = []
    items += await _state_hits(session, q, term)
    items += await _municipality_hits(session, term, limit)
    items += await _candidate_hits(session, q, term, number, limit)
    items += await _polling_place_hits(session, term, limit)
    items += await _numbered_hits(session, q, number, limit)
    return {"items": items[: limit * 3]}
