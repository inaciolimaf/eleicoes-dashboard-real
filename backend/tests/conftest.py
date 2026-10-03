"""Configuração dos testes do backend.

Precisam de um PostgreSQL e um Redis reais (no Docker: `make test`; local: TEST_DATABASE_URL / TEST_REDIS_URL).
"""

import os

os.environ.setdefault("TEST_DATABASE_URL", "postgresql+asyncpg://eleicoes:eleicoes@db-test:5432/eleicoes_test")
os.environ.setdefault("TEST_REDIS_URL", "redis://redis-test:6379/15")
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["REDIS_URL"] = os.environ["TEST_REDIS_URL"]
os.environ["TSE_AMBIENTE"] = "fake"
os.environ["TSE_BASE_URL"] = "http://tse-fake.teste/oficial"
os.environ["TSE_FAKE_CONTROLE_URL"] = "http://tse-fake.teste/_fake"
os.environ["LOCAIS_VOTACAO_URL"] = "http://tse-fake.teste/dadosabertos/eleitorado_local_votacao_2026.csv"
os.environ["DIR_BRUTOS"] = "/tmp/eleicoes-testes/brutos"
os.environ["DIR_CACHE_FOTOS"] = "/tmp/eleicoes-testes/fotos"
os.environ["JWT_SECRET"] = "segredo-de-teste"

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core import db as db_mod  # noqa: E402
from app.core import redis as redis_mod  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TABELAS = [
    "alerta", "favorito", "compartilhamento", "painel", "preferencia", "usuario", "evento", "resultado_local",
    "boletim_urna", "snapshot_progresso", "progresso_atual", "snapshot_resultado", "resultado_atual", "candidato",
    "secao", "local_votacao", "zona", "municipio", "eleicao_cargo", "eleicao",
]


def alembic_config() -> Config:
    cfg = Config(os.path.join(RAIZ, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(RAIZ, "alembic"))
    cfg.attributes["database_url"] = os.environ["TEST_DATABASE_URL"]
    return cfg


@pytest.fixture(scope="session", autouse=True)
def banco_migrado():
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest_asyncio.fixture(scope="session")
async def engine(banco_migrado):
    eng = create_async_engine(os.environ["TEST_DATABASE_URL"], pool_size=5, max_overflow=10)
    db_mod.configurar_engine(eng)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="session")
async def redis_cliente():
    cli = redis_mod.criar_redis(os.environ["TEST_REDIS_URL"])
    redis_mod.configurar_redis(cli)
    await cli.flushdb()
    yield cli
    await cli.flushdb()
    await cli.aclose()


async def limpar_banco(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE " + ", ".join(TABELAS) + " RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def banco_limpo(engine, redis_cliente):
    await limpar_banco(engine)
    await redis_cliente.flushdb()
    from app.services import ingestao

    ingestao._candidatos_conhecidos.clear()
    yield engine


@pytest_asyncio.fixture
async def session(banco_limpo):
    async with db_mod.get_sessionmaker()() as s:
        yield s
