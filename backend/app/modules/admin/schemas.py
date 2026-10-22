"""Admin API DTOs: collector and worker health, control of the fake TSE."""

from pydantic import BaseModel, Field


class CollectorMetricsDto(BaseModel):
    """Métricas publicadas pelo coletor no Redis (`collector:metrics`)."""

    requests_per_second: float
    status: dict[str, int]
    network_errors: int
    jws_failures: int
    municipality_queue: int
    section_queue: int
    sections_collected: int
    municipalities: int
    section_mode: str
    watched: int
    paused: bool
    environment: str
    base_url: str
    max_rps: float
    updated_at: str
    leader: str


class DatabaseCountsDto(BaseModel):
    result_snapshots: int
    ballot_reports: int
    polling_places: int
    events: int


class AdminHealthDto(BaseModel):
    collector: CollectorMetricsDto | None
    worker: dict[str, int] = Field(description="Contadores por tipo de mensagem: ok:<type> e erro:<type>")
    queue: int = Field(description="Mensagens aguardando o worker")
    database: DatabaseCountsDto
    environment: str


class CollectorPausedDto(BaseModel):
    paused: bool


class FakeTseStateDto(BaseModel):
    now: str
    minutes_after_17h: float
    speed: float
    paused: bool
    pct_sections: float
    expected_end: str
    sections: int
    municipalities: int
    polling_places: int


class FakeTseControlCreate(BaseModel):
    speed: float | None = None
    paused: bool | None = None
    restart: bool | None = None
    go_to: str | None = Field(None, description="HH:MM (horário de Brasília) ou minutos após as 17h")
