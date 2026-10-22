"""Candidate photo: served from the disk cache, or fetched from the TSE once and then cached."""

import mimetypes
from pathlib import Path

import httpx
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.infra.tse.urls import MontadorUrls
from app.modules.elections import Candidate, Election

_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}
_DEFAULT_MEDIA_TYPE = "image/jpeg"


def _not_found() -> AppError:
    return AppError(404, "Não encontrado", "foto não encontrada", "candidates/photo_not_found")


async def candidate_photo(session: AsyncSession, tse_candidate_id: str) -> Response:
    if not tse_candidate_id.isdigit():
        raise _not_found()
    cache = Path(get_settings().photo_cache_dir) / tse_candidate_id
    if cache.exists():
        return Response(cache.read_bytes(), media_type=_cached_type(cache), headers=_CACHE_HEADERS)
    url = await _photo_url(session, tse_candidate_id)
    content, media_type = await _download(url)
    _store(cache, content, media_type)
    return Response(content, media_type=media_type, headers=_CACHE_HEADERS)


def _cached_type(cache: Path) -> str:
    type_file = cache.with_suffix(".tipo")
    return type_file.read_text() if type_file.exists() else _DEFAULT_MEDIA_TYPE


async def _photo_url(session: AsyncSession, tse_candidate_id: str) -> str:
    candidate = await session.get(Candidate, tse_candidate_id)
    if candidate is None:
        raise _not_found()
    election = await session.get(Election, candidate.election_id)
    if election is None:
        raise _not_found()
    builder = MontadorUrls(get_settings().tse_base_url, {}, election.cycle, election.election_event_code)
    return str(builder.foto(election.election_code, candidate.state_code, tse_candidate_id))


async def _download(url: str) -> tuple[bytes, str]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
    except httpx.HTTPError as exc:
        raise _not_found() from exc
    if response.status_code != 200:
        raise _not_found()
    fallback = mimetypes.guess_type(url)[0] or _DEFAULT_MEDIA_TYPE
    return response.content, response.headers.get("content-type", fallback)


def _store(cache: Path, content: bytes, media_type: str) -> None:
    """Best effort: a cache that cannot be written does not fail the request."""
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(content)
        cache.with_suffix(".tipo").write_text(media_type)
    except OSError:
        pass
