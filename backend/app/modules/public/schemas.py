"""Public API DTOs shared by several subdomains: status, elections, geo references, events, filters.

The field names are the wire contract of the API (the frontend reads them): renaming one changes the
response. Each subdomain has its own DTO file (`results/dtos.py`, `candidates/dtos.py`, ...).
"""

from typing import Any

from pydantic import BaseModel, Field


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


class ViceDto(BaseModel):
    name: str | None
    kind: str | None  # "vice" or "suplente": the TSE value, stored as it came


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


class ElectionFilter(BaseModel):
    """Office and round of the query."""

    office: int = 1
    round: int = 1


class EventFilter(BaseModel):
    """Filter of the event list."""

    round: int = 1
    since: str | None = None
    until: str | None = None
    limit: int = Field(100, ge=1, le=1000)
    types: str | None = None
    office: int | None = None
    level: str | None = None
    geo_area_id: str | None = None


class ExportFilter(BaseModel):
    """What to export and in which format."""

    resource: str = "results"
    format: str = "csv"
    office: int = 1
    round: int = 1
    level: str = "country"
    id: str = "br"
    child_level: str | None = None


__all__ = [
    "CandidateShortDto",
    "CollectorStatusDto",
    "ElectionDto",
    "ElectionFilter",
    "EventDto",
    "EventFilter",
    "ExportFilter",
    "GeoAreaDto",
    "GeoAreaRefDto",
    "OfficeDto",
    "RefDto",
    "SearchDto",
    "SearchItemDto",
    "StatusDto",
    "TimelineDto",
    "ViceDto",
    "ZoneRefDto",
]
