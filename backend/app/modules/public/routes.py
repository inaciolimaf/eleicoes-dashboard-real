"""Public read routes: results, maps, polling places, sections, candidates, search and events (HTTP only)."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Response

from app.core.deps import DbSession, parse_time
from app.core.errors import AppError
from app.modules.geography import GeoAreaDep, GeoAreaInvalid
from app.modules.public.candidates import photo
from app.modules.public.candidates.dtos import CandidateDetailDto, CandidateDto
from app.modules.public.demand.section_request import request_sections
from app.modules.public.deps import TimeDep
from app.modules.public.diagnostics import polling_place as diagnostics
from app.modules.public.exports import download
from app.modules.public.polling_places.dtos import (
    MapPollingPlacesDto,
    PollingPlaceDiagnosticsDto,
    PollingPlaceDto,
    PollingSectionDto,
)
from app.modules.public.results.dtos import ChildrenDto, ProgressDto, ResultsDto, SeriesDto
from app.modules.public.schemas import (
    ElectionDto,
    ElectionFilter,
    EventDto,
    EventFilter,
    ExportFilter,
    SearchDto,
    StatusDto,
    TimelineDto,
)
from app.modules.public.status.current import current_status
from app.modules.results import queries as results_queries

router = APIRouter()


@router.get("/status", response_model=StatusDto, tags=["status"])
async def status(session: DbSession) -> StatusDto:
    return await current_status(session)


@router.get("/elections", response_model=list[ElectionDto], tags=["elections"])
async def elections(session: DbSession) -> list[dict[str, Any]]:
    return await results_queries.list_elections(session)


@router.get("/results", response_model=ResultsDto, tags=["results"])
async def results(
    session: DbSession,
    geo_area: GeoAreaDep,
    at: TimeDep,
    office: int = 1,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    await request_sections(turno, geo_area.level, geo_area.id)
    return await results_queries.build_result(session, turno, office, geo_area, at)


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
    return await results_queries.series(
        session,
        turno,
        office,
        geo_area,
        parse_time(from_, "from"),
        parse_time(to, "to"),
        max_points,
    )


@router.get("/geo-areas/children", response_model=ChildrenDto, tags=["geo-areas"])
async def geo_area_children(
    session: DbSession,
    geo_area: GeoAreaDep,
    at: TimeDep,
    office: int = 1,
    turno: int = Query(1, alias="round"),
    child_level: str | None = None,
    candidates: str | None = None,
) -> dict[str, Any]:
    if child_level and child_level not in ("state", "municipality", "zone", "polling_place", "section"):
        raise AppError(422, "Parâmetro inválido", "child_level inválido", "geo_area/invalid_child_level")
    selected = [c for c in (candidates or "").split(",") if c]
    await request_sections(turno, geo_area.level, geo_area.id)
    return await results_queries.children(session, turno, office, geo_area, at, child_level, selected or None)


@router.get("/progress", response_model=ProgressDto, tags=["progress"])
async def progress(session: DbSession, at: TimeDep, turno: int = Query(1, alias="round")) -> dict[str, Any]:
    return await results_queries.progress(session, turno, at)


@router.get("/maps/polling-places", response_model=MapPollingPlacesDto, tags=["maps"])
async def map_polling_places(
    session: DbSession,
    at: TimeDep,
    f: Annotated[ElectionFilter, Query()],
    state_code: str | None = None,
    municipality: str | None = None,
    bbox: str | None = None,
    limit: int = Query(20000, ge=1, le=100000),
) -> dict[str, Any]:
    box = None
    if bbox:
        try:
            a, b, c, d = (float(x) for x in bbox.split(","))
            box = (a, b, c, d)
        except ValueError as exc:
            raise AppError(422, "Parâmetro inválido", "bbox inválido", "map/invalid_bbox") from exc
    query = results_queries.MapQuery(
        state_code=state_code.lower() if state_code else None, municipality=municipality, bbox=box
    )
    return await results_queries.polling_place_map(session, f.round, f.office, query, at, limit)


@router.get("/polling-places/{polling_place_id}", response_model=PollingPlaceDto, tags=["polling-places"])
async def polling_place(
    session: DbSession, polling_place_id: str, turno: int = Query(1, alias="round")
) -> dict[str, Any]:
    await request_sections(turno, "polling_place", polling_place_id.strip().lower())
    detail = await results_queries.polling_place_detail(session, turno, polling_place_id)
    if detail is None:
        raise AppError(404, "Não encontrado", "local não encontrado", "polling_places/not_found")
    return detail


@router.get(
    "/diagnostics/polling-places/{polling_place_id}",
    response_model=PollingPlaceDiagnosticsDto,
    tags=["diagnostics"],
)
async def polling_place_diagnostics(
    session: DbSession, polling_place_id: str, turno: int = Query(1, alias="round")
) -> PollingPlaceDiagnosticsDto:
    return await diagnostics.polling_place_diagnostics(session, turno, polling_place_id)


@router.get(
    "/polling-sections/{polling_section_id}", response_model=PollingSectionDto, tags=["polling-sections"]
)
async def polling_section(
    session: DbSession,
    polling_section_id: str,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    await request_sections(turno, "section", polling_section_id.strip().lower())
    try:
        detail = await results_queries.section_detail(session, turno, polling_section_id)
    except GeoAreaInvalid as exc:
        raise AppError(
            422, "Parâmetro inválido", "id de seção inválido", "polling_sections/invalid_id"
        ) from exc
    if detail is None:
        raise AppError(404, "Não encontrado", "seção não encontrada", "polling_sections/not_found")
    return detail


@router.get("/candidates", response_model=list[CandidateDto], tags=["candidates"])
async def candidates(
    session: DbSession,
    turno: int = Query(1, alias="round"),
    office: int | None = None,
    state_code: str | None = None,
) -> list[dict[str, Any]]:
    return await results_queries.list_candidates(
        session, turno, office, state_code.lower() if state_code else None
    )


@router.get("/candidates/{tse_candidate_id}", response_model=CandidateDetailDto, tags=["candidates"])
async def candidate(
    session: DbSession,
    tse_candidate_id: str,
    at: TimeDep,
    turno: int = Query(1, alias="round"),
) -> dict[str, Any]:
    detail = await results_queries.candidate_detail(session, tse_candidate_id, turno, at)
    if detail is None:
        raise AppError(404, "Não encontrado", "candidato não encontrado", "candidates/not_found")
    return detail


@router.get(
    "/candidates/{tse_candidate_id}/photo", tags=["candidates"], responses={200: {"content": {"image/*": {}}}}
)
async def candidate_photo(session: DbSession, tse_candidate_id: str) -> Response:
    return await photo.candidate_photo(session, tse_candidate_id)


@router.get("/search", response_model=SearchDto, tags=["search"])
async def search(
    session: DbSession,
    q: str = Query("", max_length=80),
    limit: int = Query(20, ge=1, le=50),
) -> dict[str, Any]:
    return await results_queries.search_items(session, q, limit)


@router.get("/events", response_model=list[EventDto], tags=["events"])
async def events(session: DbSession, f: Annotated[EventFilter, Query()]) -> list[dict[str, Any]]:
    return await results_queries.list_events(
        session,
        results_queries.EventsQuery(
            round=f.round,
            since=parse_time(f.since, "since"),
            limit=f.limit,
            types=[x for x in (f.types or "").split(",") if x] or None,
            office_code=f.office,
            level=f.level,
            geo_area_id=f.geo_area_id,
            until=parse_time(f.until, "until"),
        ),
    )


@router.get("/timeline", response_model=TimelineDto, tags=["timeline"])
async def timeline(session: DbSession, turno: int = Query(1, alias="round")) -> dict[str, Any]:
    return await results_queries.timeline(session, turno)


@router.get(
    "/exports", tags=["exports"], responses={200: {"content": {"text/csv": {}, "application/json": {}}}}
)
async def export(session: DbSession, at: TimeDep, f: Annotated[ExportFilter, Query()]) -> Response:
    return await download.export_data(session, at, f)
