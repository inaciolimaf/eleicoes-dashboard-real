from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SettingsError(Exception):
    """A configuração não serve para o ambiente pedido (ver `Settings`)."""


#: Valores que existem em `.env.example`: em produção, o processo não sobe com um deles.
EXAMPLE_SECRETS = frozenset(
    {
        "troque-este-segredo-por-um-valor-longo-e-aleatorio",
        "troque-este-segredo",
    }
)


class Settings(BaseSettings):
    """Configuração do backend.

    Cada campo lê a variável de ambiente do servidor pelo `validation_alias`. O nome da variável
    nunca muda (o servidor já a tem configurada); só o nome do campo segue o código. Uma variável
    nova entra com um valor padrão seguro ou com um aviso na entrega (ver `docs/system/overview.md`).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True, validate_by_name=True)

    #: `local` (desenvolvimento), `production` (produção) ou `test` (testes).
    environment: Literal["local", "production", "test"] = Field("local", validation_alias="ENVIRONMENT")

    database_url: str = Field(
        "postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes", validation_alias="DATABASE_URL"
    )
    redis_url: str = Field("redis://redis:6379/0", validation_alias="REDIS_URL")

    # Integração TSE
    #: `fake` (mock local), `simulado` ou `oficial` (o TSE de verdade). Os valores são os do servidor.
    tse_environment: Literal["oficial", "simulado", "fake"] = Field("fake", validation_alias="TSE_AMBIENTE")
    #: Base já com o ambiente embutido (ex.: https://resultados.tse.jus.br/oficial).
    tse_base_url: str = Field("http://tse-fake:8080/oficial", validation_alias="TSE_BASE_URL")
    tse_max_rps: float = Field(90.0, validation_alias="TSE_MAX_RPS")
    tse_concurrency: int = Field(16, validation_alias="TSE_CONCORRENCIA")
    #: Verifica a assinatura JWS dos boletins; desligar só para depurar o mock.
    tse_verify_jws: bool = Field(True, validation_alias="TSE_VERIFICAR_JWS")
    tse_use_jws: bool = Field(True, validation_alias="TSE_USAR_JWS")

    # Intervalos (segundos) das filas do coletor
    interval_catalog: float = Field(60.0, validation_alias="INTERVALO_CATALOGO")
    interval_main: float = Field(10.0, validation_alias="INTERVALO_PRINCIPAL")
    interval_follow_up: float = Field(10.0, validation_alias="INTERVALO_ACOMPANHAMENTO")
    interval_min_municipality: float = Field(30.0, validation_alias="INTERVALO_MIN_MUNICIPIO")
    collect_sections: bool = Field(True, validation_alias="COLETAR_SECOES")
    #: `sob_demanda` (só baixa os boletins dos locais/seções que alguém abriu ou com alerta ativo) ou
    #: `todas` (varre todas as seções de cada município que mudou: ~500 mil seções, horas de coleta).
    section_mode: Literal["sob_demanda", "todas"] = Field("sob_demanda", validation_alias="MODO_SECOES")
    collect_zones: bool = Field(True, validation_alias="COLETAR_ZONAS")
    #: Acima disso (itens na fila baixa do worker) o coletor para de baixar municípios até a fila esvaziar.
    queue_max: int = Field(3000, validation_alias="FILA_MAX")
    #: Municípios baixados em paralelo pelo coletor.
    collector_municipality_workers: int = Field(8, validation_alias="COLETOR_WORKERS_MUNICIPIO")
    #: Seções baixadas em paralelo pelo coletor.
    collector_section_workers: int = Field(16, validation_alias="COLETOR_WORKERS_SECAO")
    #: Tarefas simultâneas do worker.
    worker_concurrency: int = Field(4, validation_alias="WORKER_CONCORRENCIA")

    # Chave pública Ed25519 (base64url) para o ambiente "fake" (o mock publica a dele).
    tse_fake_kid: str = Field("fake-eleicoes-dashboard", validation_alias="TSE_FAKE_KID")
    tse_fake_public_key: str = Field("", validation_alias="TSE_FAKE_CHAVE_PUBLICA")
    tse_fake_control_url: str = Field("http://tse-fake:8080/_fake", validation_alias="TSE_FAKE_CONTROLE_URL")

    #: Dados Abertos: CSV "Eleitorado - local de votação" (aceita .csv ou .zip).
    polling_places_url: str = Field(
        "http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv",
        validation_alias="LOCAIS_VOTACAO_URL",
    )

    raw_dir: str = Field("/data/brutos", validation_alias="DIR_BRUTOS")
    photo_cache_dir: str = Field("/data/fotos", validation_alias="DIR_CACHE_FOTOS")

    #: Segredo do JWT: sem valor padrão, 32+ bytes em produção.
    jwt_secret: SecretStr = Field(validation_alias="JWT_SECRET")
    jwt_expire_min: int = Field(60 * 24 * 7, validation_alias="JWT_EXPIRA_MIN")
    cors_origins: str = Field("http://localhost:5173,http://localhost:8081", validation_alias="CORS_ORIGINS")

    log_level: str = Field("INFO", validation_alias="LOG_LEVEL")

    #: Falhas de login até bloquear, por e-mail e por IP, na mesma janela.
    login_max_failures: int = Field(5, ge=1, validation_alias="LOGIN_MAX_FAILURES")
    #: Tamanho da janela de falhas de login, em segundos.
    login_window_seconds: int = Field(15 * 60, ge=1, validation_alias="LOGIN_WINDOW_SECONDS")

    @model_validator(mode="after")
    def _validar_producao(self) -> "Settings":
        """Em produção o processo não sobe com segredo ausente, curto ou de exemplo."""
        if self.environment != "production":
            return self
        segredo = self.jwt_secret.get_secret_value()
        if len(segredo.encode()) < 32:
            raise SettingsError("JWT_SECRET precisa de 32+ bytes em produção")
        if segredo in EXAMPLE_SECRETS:
            raise SettingsError("JWT_SECRET ainda está com o valor de exemplo de .env.example")
        return self

    # TEMPORARY: removed by the main agent after integration. Old attribute names still read by the
    # collector, the worker and the tests of other slices; each one reads the English field.

    @property
    def tse_ambiente(self) -> Literal["oficial", "simulado", "fake"]:
        return self.tse_environment

    @property
    def tse_concorrencia(self) -> int:
        return self.tse_concurrency

    @property
    def tse_verificar_jws(self) -> bool:
        return self.tse_verify_jws

    @property
    def tse_usar_jws(self) -> bool:
        return self.tse_use_jws

    @property
    def intervalo_catalogo(self) -> float:
        return self.interval_catalog

    @property
    def intervalo_principal(self) -> float:
        return self.interval_main

    @property
    def intervalo_acompanhamento(self) -> float:
        return self.interval_follow_up

    @property
    def intervalo_min_municipio(self) -> float:
        return self.interval_min_municipality

    @property
    def coletar_secoes(self) -> bool:
        return self.collect_sections

    @property
    def modo_secoes(self) -> Literal["sob_demanda", "todas"]:
        return self.section_mode

    @property
    def coletar_zonas(self) -> bool:
        return self.collect_zones

    @property
    def fila_max(self) -> int:
        return self.queue_max

    @property
    def tse_fake_chave_publica(self) -> str:
        return self.tse_fake_public_key

    @property
    def tse_fake_controle_url(self) -> str:
        return self.tse_fake_control_url

    @property
    def locais_votacao_url(self) -> str:
        return self.polling_places_url

    @property
    def dir_brutos(self) -> str:
        return self.raw_dir

    @property
    def dir_cache_fotos(self) -> str:
        return self.photo_cache_dir

    @property
    def jwt_expira_min(self) -> int:
        return self.jwt_expire_min


@lru_cache
def get_settings() -> Settings:
    return Settings()
