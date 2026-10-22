"""DTOs of the tally: results, series, the children of a geo area and the progress of the count."""

from typing import Literal

from pydantic import BaseModel

from app.modules.public.schemas import (
    CandidateShortDto,
    EventDto,
    GeoAreaDto,
    OfficeDto,
    ViceDto,
)


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
