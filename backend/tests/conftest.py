"""Backend test configuration.

Needs a real PostgreSQL and Redis (in Docker: `make test`; locally: TEST_DATABASE_URL / TEST_REDIS_URL).
"""

import os

os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+asyncpg://eleicoes:eleicoes@db-test:5432/eleicoes_test"
)
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

import pytest
import pytest_asyncio
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.core import db as db_mod
from app.core import redis as redis_mod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TABELAS = [
    "alerts",
    "favorites",
    "shares",
    "dashboards",
    "preferences",
    "users",
    "events",
    "polling_place_results",
    "ballot_box_reports",
    "progress_snapshots",
    "current_progress",
    "result_snapshots",
    "current_results",
    "candidates",
    "polling_sections",
    "polling_places",
    "electoral_zones",
    "municipalities",
    "election_offices",
    "elections",
]


def alembic_config() -> Config:
    cfg = Config(os.path.join(ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(ROOT, "alembic"))
    cfg.attributes["database_url"] = os.environ["TEST_DATABASE_URL"]
    return cfg


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest_asyncio.fixture(scope="session")
async def engine(migrated_db):
    eng = create_async_engine(os.environ["TEST_DATABASE_URL"], pool_size=5, max_overflow=10)
    db_mod.configure_engine(eng)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="session")
async def redis_cliente():
    cli = redis_mod.create_redis(os.environ["TEST_REDIS_URL"])
    redis_mod.configure_redis(cli)
    await cli.flushdb()
    yield cli
    await cli.flushdb()
    await cli.aclose()


async def clean_database(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE " + ", ".join(TABELAS) + " RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def clean_db(engine, redis_cliente):
    await clean_database(engine)
    await redis_cliente.flushdb()
    from app.modules.results import ingestion as ingestion

    ingestion.known_candidate_ids.clear()
    yield engine


@pytest_asyncio.fixture
async def session(clean_db):
    async with db_mod.get_sessionmaker()() as s:
        yield s
