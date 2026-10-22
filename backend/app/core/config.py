from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SettingsError(Exception):
    """The configuration does not fit the requested environment (see `Settings`)."""


#: Values present in `.env.example`: in production the process refuses to start with one of them.
EXAMPLE_SECRETS = frozenset(
    {
        "troque-este-segredo-por-um-valor-longo-e-aleatorio",
        "troque-este-segredo",
    }
)


class Settings(BaseSettings):
    """Backend configuration.

    Each field reads the server's variable through `validation_alias`. The variable name never
    changes (the server already has it configured); only the field name follows the code. A new
    variable comes with a safe default or with a notice in the delivery (see `docs/system/overview.md`).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True, validate_by_name=True)

    #: `local` (development), `production` or `test`.
    environment: Literal["local", "production", "test"] = Field("local", validation_alias="ENVIRONMENT")

    database_url: str = Field(
        "postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes", validation_alias="DATABASE_URL"
    )
    redis_url: str = Field("redis://redis:6379/0", validation_alias="REDIS_URL")

    # TSE integration
    #: `fake` (local mock), `simulado` (simulated) or `oficial` (the real TSE). The values are the server's.
    tse_environment: Literal["oficial", "simulado", "fake"] = Field("fake", validation_alias="TSE_AMBIENTE")
    #: Base URL with the environment already included (e.g. https://resultados.tse.jus.br/oficial).
    tse_base_url: str = Field("http://tse-fake:8080/oficial", validation_alias="TSE_BASE_URL")
    tse_max_rps: float = Field(90.0, validation_alias="TSE_MAX_RPS")
    tse_concurrency: int = Field(16, validation_alias="TSE_CONCORRENCIA")
    #: Checks the JWS signature of the ballot reports; turn off only to debug the mock.
    tse_verify_jws: bool = Field(True, validation_alias="TSE_VERIFICAR_JWS")
    tse_use_jws: bool = Field(True, validation_alias="TSE_USAR_JWS")

    # Collector queue intervals (seconds)
    interval_catalog: float = Field(60.0, validation_alias="INTERVALO_CATALOGO")
    interval_main: float = Field(10.0, validation_alias="INTERVALO_PRINCIPAL")
    interval_follow_up: float = Field(10.0, validation_alias="INTERVALO_ACOMPANHAMENTO")
    interval_min_municipality: float = Field(30.0, validation_alias="INTERVALO_MIN_MUNICIPIO")
    collect_sections: bool = Field(True, validation_alias="COLETAR_SECOES")
    #: `sob_demanda` (on demand: downloads only the ballot reports of the polling places and sections
    #: somebody opened or with an active alert) or `todas` (all: sweeps every section of each municipality
    #: that changed: ~500 thousand sections, hours of collection).
    section_mode: Literal["sob_demanda", "todas"] = Field("sob_demanda", validation_alias="MODO_SECOES")
    collect_zones: bool = Field(True, validation_alias="COLETAR_ZONAS")
    #: Above this many items in the worker's low queue, the collector stops downloading municipalities
    #: until the queue drains.
    queue_max: int = Field(3000, validation_alias="FILA_MAX")
    #: Municipalities the collector downloads in parallel.
    collector_municipality_workers: int = Field(8, validation_alias="COLETOR_WORKERS_MUNICIPIO")
    #: Sections the collector downloads in parallel.
    collector_section_workers: int = Field(16, validation_alias="COLETOR_WORKERS_SECAO")
    #: Concurrent worker tasks.
    worker_concurrency: int = Field(4, validation_alias="WORKER_CONCORRENCIA")

    # Ed25519 public key (base64url) for the "fake" environment (the mock publishes its own).
    tse_fake_kid: str = Field("fake-eleicoes-dashboard", validation_alias="TSE_FAKE_KID")
    tse_fake_public_key: str = Field("", validation_alias="TSE_FAKE_CHAVE_PUBLICA")
    tse_fake_control_url: str = Field("http://tse-fake:8080/_fake", validation_alias="TSE_FAKE_CONTROLE_URL")

    #: Open data: the TSE "Eleitorado - local de votação" CSV (accepts .csv or .zip).
    polling_places_url: str = Field(
        "http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv",
        validation_alias="LOCAIS_VOTACAO_URL",
    )

    raw_dir: str = Field("/data/brutos", validation_alias="DIR_BRUTOS")
    photo_cache_dir: str = Field("/data/fotos", validation_alias="DIR_CACHE_FOTOS")

    #: JWT secret: no default value, 32+ bytes in production.
    jwt_secret: SecretStr = Field(validation_alias="JWT_SECRET")
    jwt_expire_min: int = Field(60 * 24 * 7, validation_alias="JWT_EXPIRA_MIN")
    cors_origins: str = Field("http://localhost:5173,http://localhost:8081", validation_alias="CORS_ORIGINS")

    log_level: str = Field("INFO", validation_alias="LOG_LEVEL")

    #: Failed logins before blocking, per e-mail and per IP, within the same window.
    login_max_failures: int = Field(5, ge=1, validation_alias="LOGIN_MAX_FAILURES")
    #: Length of the failed-login window, in seconds.
    login_window_seconds: int = Field(15 * 60, ge=1, validation_alias="LOGIN_WINDOW_SECONDS")

    @model_validator(mode="after")
    def _validar_producao(self) -> "Settings":
        """In production the process does not start with a missing, short or example secret."""
        if self.environment != "production":
            return self
        secret = self.jwt_secret.get_secret_value()
        if len(secret.encode()) < 32:
            raise SettingsError("JWT_SECRET precisa de 32+ bytes em produção")
        if secret in EXAMPLE_SECRETS:
            raise SettingsError("JWT_SECRET ainda está com o valor de exemplo de .env.example")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
