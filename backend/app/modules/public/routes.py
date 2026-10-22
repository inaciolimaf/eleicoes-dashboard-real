"""Rotas públicas de leitura: resultados, mapas, locais, seções, candidatos, busca, eventos (só HTTP)."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Response

from app.core.deps import DbSession, parse_time
from app.core.errors import AppError
from app.modules.geography import GeoAreaDep, GeoAreaInvalid
from app.modules.public import service
from app.modules.public.deps import TempoDep
from app.modules.public.schemas import (
    CandidateDetailDto,
    CandidateDto,
    ChildrenDto,
    ElectionDto,
    EventDto,
    FiltroEleicao,
    FiltroEventos,
    FiltroExport,
    MapPollingPlacesDto,
    PollingPlaceDto,
    PollingSectionDto,
    ProgressDto,
    ResultsDto,
    SearchDto,
    SeriesDto,
    StatusDto,
    TimelineDto,
)
from app.modules.results import queries as resultados

router = APIRouter()


@router.get("/status", response_model=StatusDto, tags=["status"])
async def status(session: DbSession) -> StatusDto:
    return await service.status(session)


@router.get("/elections", response_model=list[ElectionDto], tags=["elections"])
async def elections(session: DbSession) -> list[dict[str, Any]]:
    return await resultados.listar_eleicoes(session)


@router.get("/results", response_model=ResultsDto, tags=["results"])
async def results(
    session: DbSession,
    geo_area: GeoAreaDep,
    at: TempoDep,
    office: int = 1,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    await service.pedir_secoes(turno, geo_area.level, geo_area.id)
    return await resultados.montar_resultado(session, turno, office, geo_area, at)


@router.get("/results/series", response_model=SeriesDto, tags=["results"])
async def results_series(
    session: DbSession,
    geo_area: GeoAreaDep,
    office: int = 1,
    turno: int = Query(1, alias="round"),
    from_: Annotated[str | None, Query(alias="from")] = None,
    to: str | None = None,
    max_points: int = Query(300, ge=10, le=2000),
) -> dict[str, Any]:
    return await resultados.serie(
        session, turno, office, geo_area, parse_time(from_, "from"), parse_time(to, "to"), max_points
    )


@router.get("/geo-areas/children", response_model=ChildrenDto, tags=["geo-areas"])
async def geo_area_children(
    session: DbSession,
    geo_area: GeoAreaDep,
    at: TempoDep,
    office: int = 1,
    turno: int = Query(1, alias="round"),
    child_level: str | None = None,
    candidates: str | None = None,
) -> dict[str, Any]:
    if child_level and child_level not in ("state", "municipality", "zone", "polling_place", "section"):
        raise AppError(422, "Parâmetro inválido", "child_level inválido", "geo_area/invalid_child_level")
    lista = [c for c in (candidates or "").split(",") if c]
    await service.pedir_secoes(turno, geo_area.level, geo_area.id)
    return await resultados.filhos(session, turno, office, geo_area, at, child_level, lista or None)


@router.get("/progress", response_model=ProgressDto, tags=["progress"])
async def progress(session: DbSession, at: TempoDep, turno: int = Query(1, alias="round")) -> dict[str, Any]:
    return await resultados.progresso(session, turno, at)


@router.get("/maps/polling-places", response_model=MapPollingPlacesDto, tags=["maps"])
async def map_polling_places(
    session: DbSession,
    at: TempoDep,
    f: Annotated[FiltroEleicao, Query()],
    state_code: str | None = None,
    municipality: str | None = None,
    bbox: str | None = None,
    limit: int = Query(20000, ge=1, le=100000),
) -> dict[str, Any]:
    caixa = None
    if bbox:
        try:
            a, b, c, d = (float(x) for x in bbox.split(","))
            caixa = (a, b, c, d)
        except ValueError as exc:
            raise AppError(422, "Parâmetro inválido", "bbox inválido", "map/invalid_bbox") from exc
    filtro = resultados.ConsultaMapa(
        uf=state_code.lower() if state_code else None, municipio=municipality, bbox=caixa
    )
    return await resultados.locais_mapa(session, f.round, f.office, filtro, at, limit)


@router.get("/polling-places/{polling_place_id}", response_model=PollingPlaceDto, tags=["polling-places"])
async def polling_place(
    session: DbSession, polling_place_id: str, turno: int = Query(1, alias="round")
) -> dict[str, Any]:
    await service.pedir_secoes(turno, "polling_place", polling_place_id.strip().lower())
    d = await resultados.detalhe_local(session, turno, polling_place_id)
    if d is None:
        raise AppError(404, "Não encontrado", "local não encontrado", "polling_places/not_found")
    return d


@router.get(
    "/polling-sections/{polling_section_id}", response_model=PollingSectionDto, tags=["polling-sections"]
)
async def polling_section(
    session: DbSession,
    polling_section_id: str,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    await service.pedir_secoes(turno, "section", polling_section_id.strip().lower())
    try:
        d = await resultados.detalhe_secao(session, turno, polling_section_id)
    except GeoAreaInvalid as exc:
        raise AppError(
            422, "Parâmetro inválido", "id de seção inválido", "polling_sections/invalid_id"
        ) from exc
    if d is None:
        raise AppError(404, "Não encontrado", "seção não encontrada", "polling_sections/not_found")
    return d


@router.get("/candidates", response_model=list[CandidateDto], tags=["candidates"])
async def candidates(
    session: DbSession,
    turno: int = Query(1, alias="round"),
    office: int | None = None,
    state_code: str | None = None,
) -> list[dict[str, Any]]:
    return await resultados.listar_candidatos(
        session, turno, office, state_code.lower() if state_code else None
    )


@router.get("/candidates/{tse_candidate_id}", response_model=CandidateDetailDto, tags=["candidates"])
async def candidate(
    session: DbSession,
    tse_candidate_id: str,
    at: TempoDep,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    d = await resultados.detalhe_candidato(session, tse_candidate_id, turno, at)
    if d is None:
        raise AppError(404, "Não encontrado", "candidato não encontrado", "candidates/not_found")
    return d


@router.get(
    "/candidates/{tse_candidate_id}/photo", tags=["candidates"], responses={200: {"content": {"image/*": {}}}}
)
async def candidate_photo(session: DbSession, tse_candidate_id: str) -> Response:
    return await service.photo(session, tse_candidate_id)


@router.get("/search", response_model=SearchDto, tags=["search"])
async def search(
    session: DbSession,
    q: str = Query("", max_length=80),
    limit: int = Query(20, ge=1, le=50),
) -> dict[str, Any]:
    return await resultados.buscar(session, q, limit)


@router.get("/events", response_model=list[EventDto], tags=["events"])
async def events(session: DbSession, f: Annotated[FiltroEventos, Query()]) -> list[dict[str, Any]]:
    return await resultados.listar_eventos(
        session,
        resultados.ConsultaEventos(
            turno=f.round,
            desde=parse_time(f.since, "since"),
            limite=f.limit,
            tipos=[x for x in (f.types or "").split(",") if x] or None,
            cargo=f.office,
            nivel=f.level,
            recorte_id=f.geo_area_id,
            ate=parse_time(f.until, "until"),
        ),
    )


@router.get("/timeline", response_model=TimelineDto, tags=["timeline"])
async def timeline(session: DbSession, turno: int = Query(1, alias="round")) -> dict[str, Any]:
    return await resultados.linha_do_tempo(session, turno)


@router.get(
    "/exports", tags=["exports"], responses={200: {"content": {"text/csv": {}, "application/json": {}}}}
)
async def export(session: DbSession, at: TempoDep, f: Annotated[FiltroExport, Query()]) -> Response:
    return await service.export(session, at, f)
