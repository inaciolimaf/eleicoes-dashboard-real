from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes"
    redis_url: str = "redis://redis:6379/0"

    # Integração TSE
    tse_ambiente: Literal["oficial", "simulado", "fake"] = "fake"
    # Base já com o ambiente embutido (ex.: https://resultados.tse.jus.br/oficial)
    tse_base_url: str = "http://tse-fake:8080/oficial"
    tse_max_rps: float = 90.0
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
    # Acima disso (itens na fila baixa do worker) o coletor para de baixar municípios até a fila esvaziar
    fila_max: int = 3000
    # Chave pública Ed25519 (base64url) para o ambiente "fake" (o mock publica a dele)
    tse_fake_kid: str = "fake-eleicoes-dashboard"
    tse_fake_chave_publica: str = ""
    tse_fake_controle_url: str = "http://tse-fake:8080/_fake"

    # Dados Abertos: CSV "Eleitorado - local de votação" (aceita .csv ou .zip)
    locais_votacao_url: str = "http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv"

    dir_brutos: str = "/data/brutos"
    dir_cache_fotos: str = "/data/fotos"

    jwt_secret: str = "troque-este-segredo"
    jwt_expira_min: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173,http://localhost:8081"

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
