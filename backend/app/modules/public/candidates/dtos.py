"""DTOs of the candidates: the list entry, the detail and the result summary."""

from pydantic import BaseModel

from app.modules.public.schemas import OfficeDto, ViceDto


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
    office_name: str
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
