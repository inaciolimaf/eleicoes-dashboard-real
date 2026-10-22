"""DTOs of the polling places and their sections, the map markers and the collection diagnostics."""

from typing import Any, Literal

from pydantic import BaseModel

from app.modules.public.schemas import CandidateShortDto, RefDto, ZoneRefDto


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


class SectionDiagnosticDto(BaseModel):
    """What the collector and the worker did with one section of a polling place (Redis, 1 h)."""

    id: str
    ballot_in_db: bool
    collector: dict[str, Any] | None
    worker: dict[str, Any] | None


class PollingPlaceDiagnosticsDto(BaseModel):
    polling_place_id: str
    polling_place_in_db: bool
    municipality_in_db: bool
    request_registered: bool
    collector: dict[str, Any]
    sections: list[SectionDiagnosticDto]
