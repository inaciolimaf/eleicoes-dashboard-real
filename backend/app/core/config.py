from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
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

    O nome da variável de ambiente é o do servidor (nunca muda): o campo pode ter outro nome,
    mas a variável continua a mesma. Uma variável nova entra com um valor padrão seguro ou com um
    aviso na entrega (ver `docs/system/overview.md`).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    #: `local` (desenvolvimento), `production` (produção) ou `test` (testes).
    environment: Literal["local", "production", "test"] = "local"

    database_url: str = "postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes"
    redis_url: str = "redis://redis:6379/0"

    # Integração TSE
    tse_ambiente: Literal["oficial", "simulado", "fake"] = "fake"
    # Base já com o ambiente embutido (ex.: https://resultados.tse.jus.br/oficial)
    tse_base_url: str = "http://tse-fake:8080/oficial"
    tse_max_rps: float = 60.0
    tse_concorrencia: int = 16
    tse_verificar_jws: bool = True
    tse_usar_jws: bool = True
    # Intervalos (segundos) das filas do coletor
    intervalo_catalogo: float = 60.0
    intervalo_principal: float = 10.0
    intervalo_acompanhamento: float = 10.0
    intervalo_min_municipio: float = 30.0
    coletar_secoes: bool = True
    # sob_demanda: só baixa boletins de urna dos locais/seções que alguém abriu (ou com alerta ativo)
    # todas: varre todas as seções de cada município que mudou (~500 mil seções no Brasil, horas de coleta)
    modo_secoes: Literal["sob_demanda", "todas"] = "sob_demanda"
    coletar_zonas: bool = True
    # Chave pública Ed25519 (base64url) para o ambiente "fake" (o mock publica a dele)
    tse_fake_kid: str = "fake-eleicoes-dashboard"
    tse_fake_chave_publica: str = ""
    tse_fake_controle_url: str = "http://tse-fake:8080/_fake"

    # Dados Abertos: CSV "Eleitorado - local de votação" (aceita .csv ou .zip)
    locais_votacao_url: str = "http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv"

    dir_brutos: str = "/data/brutos"
    dir_cache_fotos: str = "/data/fotos"

    #: Segredo do JWT: sem valor padrão, 32+ bytes em produção.
    jwt_secret: SecretStr
    jwt_expira_min: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173,http://localhost:8081"

    log_level: str = "INFO"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
