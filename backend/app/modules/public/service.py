"""Casos de uso da leitura pública: status, pedido de seções, fotos e exportação."""

from __future__ import annotations

import csv
import io
import logging
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import orjson
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis import get_redis
from app.infra.tse.urls import MontadorUrls
from app.modules.ballot_reports import demand as demanda
from app.modules.elections import Candidate, Election
from app.modules.geography import GeoArea, GeoAreaInvalid, parse
from app.modules.public.schemas import CollectorStatusDto, FiltroExport, StatusDto
from app.modules.results import queries as resultados

log = logging.getLogger(__name__)


async def pedir_secoes(turno: int, nivel: str, rid: str) -> None:
    """Abriu um local ou seção: avisa o coletor para baixar esses boletins (modo sob demanda)."""
    try:
        await demanda.registrar(get_redis(), turno, nivel, rid)
    except Exception:
        # O pedido é só um sinal para o coletor: nunca derruba a leitura.
        log.warning("não foi possível registrar a demanda por seções: %s", rid, exc_info=True)


async def status(session: AsyncSession) -> StatusDto:
    s = get_settings()
    redis = get_redis()
    metricas = await redis.get("collector:metrics")
    m = orjson.loads(metricas) if metricas else {}
    ultima_coleta = await redis.get("collector:last_collection")
    ult = await resultados.ultima_totalizacao(session)
    eleicoes = await resultados.listar_eleicoes(session)
    inicio = None
    if eleicoes:
        e = await session.get(Election, eleicoes[0]["id"])
        if e and e.date:
            d, mth, a = e.date.split("/")
            inicio = f"{a}-{mth}-{d}T20:00:00+00:00"
    ao_vivo = bool(m) and not m.get("paused")
    return StatusDto(
        tse_environment=s.tse_ambiente,
        live=ao_vivo,
        now=datetime.now().astimezone().isoformat(),
        last_tally=resultados.iso(ult),
        last_collection=ultima_coleta.decode() if isinstance(ultima_coleta, bytes) else ultima_coleta,
        release_start=inicio,
        pct_sections_br=await resultados.pct_br(session),
        collector=CollectorStatusDto(
            paused=bool(m.get("paused")), requests_per_second=m.get("requests_per_second", 0.0)
        ),
    )


async def photo(session: AsyncSession, tse_candidate_id: str) -> Response:
    s = get_settings()
    nao_achou = AppError(404, "Não encontrado", "foto não encontrada", "candidates/photo_not_found")
    if not tse_candidate_id.isdigit():
        raise nao_achou
    cache = Path(s.dir_cache_fotos) / tse_candidate_id
    if cache.exists():
        tipo = cache.with_suffix(".tipo").read_text() if cache.with_suffix(".tipo").exists() else "image/jpeg"
        return Response(
            cache.read_bytes(), media_type=tipo, headers={"Cache-Control": "public, max-age=86400"}
        )
    c = await session.get(Candidate, tse_candidate_id)
    if c is None:
        raise nao_achou
    e = await session.get(Election, c.election_id)
    if e is None:
        raise nao_achou
    url = MontadorUrls(s.tse_base_url, {}, e.cycle, e.election_event_code).foto(
        e.election_code, c.state_code, tse_candidate_id
    )
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.get(url)
    except httpx.HTTPError as exc:
        raise nao_achou from exc
    if r.status_code != 200:
        raise nao_achou
    tipo = r.headers.get("content-type", mimetypes.guess_type(url)[0] or "image/jpeg")
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(r.content)
        cache.with_suffix(".tipo").write_text(tipo)
    except OSError:
        pass
    return Response(r.content, media_type=tipo, headers={"Cache-Control": "public, max-age=86400"})


def _csv(linhas: list[dict[str, Any]], colunas: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=colunas, extrasaction="ignore", delimiter=";")
    w.writeheader()
    for ln in linhas:
        w.writerow(ln)
    return buf.getvalue()


def _linhas_resultados(dados: dict, recorte_id: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Colunas do CSV (cabeçalhos em português: é o arquivo que a pessoa abre)."""
    linhas = [
        {
            "recorte": recorte_id,
            "posicao": c["position"],
            "numero": c["ballot_number"],
            "nome_urna": c["ballot_name"],
            "partido_sigla": c["party_abbreviation"],
            "votos": c["votes"],
            "pct_validos": c["valid_pct"],
            "situacao": c["status"],
            "situacao_geral": c["overall_status"],
        }
        for c in dados.get("candidates", [])
    ]
    colunas = [
        "recorte",
        "posicao",
        "numero",
        "nome_urna",
        "partido_sigla",
        "votos",
        "pct_validos",
        "situacao",
        "situacao_geral",
    ]
    return linhas, colunas


def _linhas_filhos(dados: dict) -> tuple[list[dict[str, Any]], list[str]]:
    linhas = [
        {
            "nivel": i["level"],
            "id": i["id"],
            "nome": i["name"],
            "uf": i["state_code"],
            "status": i["status"],
            "pct_secoes": i["pct_sections"],
            "eleitorado": i["electorate"],
            "comparecimento": i["turnout"],
            "votos_validos": i["valid_votes"],
            "brancos": i["blank_votes"],
            "nulos": i["null_votes"],
            "lider_nome": (i.get("leader") or {}).get("ballot_name"),
            "lider_pct": (i.get("leader") or {}).get("pct"),
            "margem_pp": i["margin_pp"],
        }
        for i in dados["items"]
    ]
    colunas = [
        "nivel",
        "id",
        "nome",
        "uf",
        "status",
        "pct_secoes",
        "eleitorado",
        "comparecimento",
        "votos_validos",
        "brancos",
        "nulos",
        "lider_nome",
        "lider_pct",
        "margem_pp",
    ]
    return linhas, colunas


async def export(session: AsyncSession, t: datetime | None, f: FiltroExport) -> Response:
    try:
        r: GeoArea = parse(f.id, f.level)
    except GeoAreaInvalid as exc:
        raise AppError(422, "Parâmetro inválido", "recorte inválido", "geo_area/invalid") from exc
    if f.resource == "results":
        dados = await resultados.montar_resultado(session, f.round, f.office, r, t)
        linhas, colunas = _linhas_resultados(dados, r.id)
    elif f.resource == "children":
        dados = await resultados.filhos(session, f.round, f.office, r, t, f.child_level)
        linhas, colunas = _linhas_filhos(dados)
    else:
        raise AppError(422, "Parâmetro inválido", "recurso inválido", "export/invalid_resource")
    nome = f"{f.resource}-{f.office}-{r.id}"
    if f.format == "json":
        return Response(
            orjson.dumps(dados),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{nome}.json"'},
        )
    return Response(
        _csv(linhas, colunas).encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nome}.csv"'},
    )
