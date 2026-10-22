"""DTOs da API pública (leitura): respostas (XDto) e filtros de consulta."""

from typing import Any, Literal

from pydantic import BaseModel, Field

# ------------------------------------------------------------------ comuns


class CollectorStatusDto(BaseModel):
    paused: bool
    requests_per_second: float


class StatusDto(BaseModel):
    tse_environment: str
    live: bool
    now: str
    last_tally: str | None
    last_collection: str | None
    release_start: str | None
    pct_sections_br: float | None
    collector: CollectorStatusDto


class OfficeDto(BaseModel):
    office_code: int
    name: str
    voting_system: str
    seats: int | None
    coverage: str | None = None


class ElectionDto(BaseModel):
    id: int
    round: int
    cycle: str | None
    jurisdiction: str | None
    name: str | None
    election_code: int | None
    offices: list[OfficeDto]


class GeoAreaRefDto(BaseModel):
    level: str
    id: str
    name: str


class GeoAreaDto(BaseModel):
    level: str
    id: str
    name: str
    state_code: str | None
    breadcrumb: list[GeoAreaRefDto]


class RefDto(BaseModel):
    id: str | None
    name: str | None


class ZoneRefDto(BaseModel):
    id: str | None
    number: int | None


class CandidateShortDto(BaseModel):
    """Candidato resumido: líder e segundo colocado, pontos de série e mapas."""

    tse_candidate_id: str
    ballot_name: str
    color: str
    ballot_number: int | None
    party_abbreviation: str
    votes: int
    pct: float


class EventDto(BaseModel):
    id: int
    type: str
    occurred_at: str | None
    office_code: int | None
    level: str | None
    geo_area_id: str | None
    title: str
    description: str | None
    payload: dict[str, Any]


# ------------------------------------------------------------------ /results


class ViceDto(BaseModel):
    name: str | None
    kind: str | None  # "vice" | "suplente" (valor do TSE, guardado como veio)


class CandidateResultDto(BaseModel):
    tse_candidate_id: str
    ballot_number: int | None
    name: str
    ballot_name: str
    party_abbreviation: str
    party_number: int | None
    alliance: str | None
    color: str
    photo_url: str
    votes: int
    valid_pct: float
    position: int
    status: str
    overall_status: str
    elected: bool
    vote_destination: str
    vice_and_substitutes: list[ViceDto]


class AllianceDto(BaseModel):
    name: str
    parties: list[str]
    votes: int
    seats: int | None
    color: str


class TotalsDto(BaseModel):
    electorate: int
    tallied_electorate: int
    sections_total: int
    sections_tallied: int
    pct_sections: float
    turnout: int
    pct_turnout: float
    abstention: int
    pct_abstention: float
    total_votes: int
    valid_votes: int
    pct_valid: float
    blank_votes: int
    pct_blank: float
    null_votes: int
    pct_null: float


class LeaderDto(BaseModel):
    tse_candidate_id: str
    margin_pp: float
    margin_votes: int


class CoverageDto(BaseModel):
    total_sections: int
    collected_sections: int


class ResultsWithDataDto(BaseModel):
    no_data: Literal[False]
    geo_area: GeoAreaDto
    office: OfficeDto
    source: str
    coverage: CoverageDto | None
    generation_id: str
    tallied_at: str | None
    captured_at: str | None
    jws_verified: bool
    totals: TotalsDto
    mathematically_decided: bool
    final_tally: bool
    leader: LeaderDto | None
    candidates: list[CandidateResultDto]
    alliances: list[AllianceDto]


class ResultsWithoutDataDto(BaseModel):
    no_data: Literal[True]
    geo_area: GeoAreaDto
    office: OfficeDto


ResultsDto = ResultsWithDataDto | ResultsWithoutDataDto


# ------------------------------------------------------------------ /results/series


class SeriesCandidateDto(BaseModel):
    tse_candidate_id: str
    ballot_name: str
    color: str
    ballot_number: int | None
    party_abbreviation: str


class SeriesPointCandidateDto(BaseModel):
    votes: int
    pct: float


class SeriesPointDto(BaseModel):
    time: str | None
    pct_sections: float
    valid_votes: int
    candidates: dict[str, SeriesPointCandidateDto]


class SeriesDto(BaseModel):
    candidates: list[SeriesCandidateDto]
    points: list[SeriesPointDto]
    events: list[EventDto]


# ------------------------------------------------------------------ /geo-areas/children


class LeaderPartyDto(BaseModel):
    abbreviation: str
    color: str


class ChildItemDto(BaseModel):
    level: str
    id: str
    name: str
    state_code: str | None
    ibge_code: int | None
    region: str | None
    is_capital: bool | None
    lat: float | None
    lon: float | None
    status: str
    pct_sections: float
    electorate: int
    turnout: int
    pct_abstention: float
    valid_votes: int
    blank_votes: int
    null_votes: int
    leader: CandidateShortDto | None
    second: CandidateShortDto | None
    margin_pp: float
    leader_party: LeaderPartyDto | None
    values: dict[str, float]


class ChildCandidateDto(BaseModel):
    tse_candidate_id: str
    ballot_name: str
    color: str
    ballot_number: int | None
    party_abbreviation: str
    wins: int


class ChildrenDto(BaseModel):
    child_level: str | None
    candidates: list[ChildCandidateDto]
    items: list[ChildItemDto]


# ------------------------------------------------------------------ /progress


class ProgressCountryDto(BaseModel):
    pct_sections: float
    sections_total: int
    sections_tallied: int
    tallied_at: str | None


class ProgressItemDto(BaseModel):
    state_code: str
    name: str
    pct_sections: float
    sections_total: int
    sections_tallied: int
    municipalities_total: int
    municipalities_completed: int
    municipalities_partial: int
    municipalities_not_received: int
    pct_turnout: float
    tallied_at: str | None


class ProgressDto(BaseModel):
    country: ProgressCountryDto
    items: list[ProgressItemDto]


# ------------------------------------------------------------------ /maps/polling-places


class MapPollingPlaceDto(BaseModel):
    id: str
    name: str
    neighborhood: str | None
    lat: float | None
    lon: float | None
    approximate: bool | None
    status: str
    sections_total: int
    sections_tallied: int
    leader: CandidateShortDto | None
    margin_pp: float | None
    valid_votes: int


class MapPollingPlacesDto(BaseModel):
    total: int
    truncated: bool
    items: list[MapPollingPlaceDto]


# ------------------------------------------------------------------ /polling-places/{id}


class PollingSectionSummaryDto(BaseModel):
    id: str
    number: int
    eligible_voters: int | None
    status: str
    tallied_at: str | None
    turnout: int | None


class PollingPlaceDto(BaseModel):
    id: str
    name: str
    address: str | None
    neighborhood: str | None
    zip_code: str | None
    lat: float | None
    lon: float | None
    approximate: bool | None
    eligible_voters: int | None
    municipality: RefDto
    zone: ZoneRefDto
    sections: list[PollingSectionSummaryDto]


# ------------------------------------------------------------------ /polling-sections/{id}


class SectionVoteDto(BaseModel):
    kind: Literal["nominal", "legenda"]
    number: int
    tse_candidate_id: str | None
    ballot_name: str
    party_abbreviation: str
    color: str
    votes: int


class SectionOfficeDto(BaseModel):
    office_code: int
    name: str
    turnout: int
    valid_votes: int
    blank_votes: int
    null_votes: int
    votes: list[SectionVoteDto]


class PollingSectionDto(BaseModel):
    id: str
    number: int
    state_code: str
    municipality: RefDto
    zone: ZoneRefDto
    polling_place: RefDto
    status: str
    tallied_at: str | None
    issued_at: str | None
    hash: str | None
    signature_valid: bool | None
    bu_url: str | None
    eligible_voters: int | None
    turnout: int | None
    offices: list[SectionOfficeDto]


# ------------------------------------------------------------------ /candidates


class CandidateDto(BaseModel):
    tse_candidate_id: str
    ballot_number: int | None
    name: str
    ballot_name: str
    party_abbreviation: str
    alliance: str | None
    color: str
    photo_url: str
    state_code: str | None
    office_code: int
    overall_status: str
    elected: bool
    vice_and_substitutes: list[ViceDto]


class CandidateResultSummaryDto(BaseModel):
    votes: int
    valid_pct: float
    position: int
    status: str


class CandidateDetailDto(CandidateDto):
    office: OfficeDto
    result: CandidateResultSummaryDto | None


# ------------------------------------------------------------------ /search, /timeline


class SearchItemDto(BaseModel):
    type: str
    level: str | None = None
    id: str
    title: str
    subtitle: str | None = None
    office_code: int | None = None
    state_code: str | None = None


class SearchDto(BaseModel):
    items: list[SearchItemDto]


class TimelineDto(BaseModel):
    start: str | None
    end: str | None
    now: str | None
    events: list[EventDto]


# ------------------------------------------------------------------ filtros de consulta


class FiltroEleicao(BaseModel):
    """Cargo e turno da consulta."""

    office: int = 1
    round: int = 1


class FiltroEventos(BaseModel):
    """Filtro da lista de eventos."""

    round: int = 1
    since: str | None = None
    until: str | None = None
    limit: int = Field(100, ge=1, le=1000)
    types: str | None = None
    office: int | None = None
    level: str | None = None
    geo_area_id: str | None = None


class FiltroExport(BaseModel):
    """O que exportar e em que formato."""

    resource: str = "results"
    format: str = "csv"
    office: int = 1
    round: int = 1
    level: str = "country"
    id: str = "br"
    child_level: str | None = None
