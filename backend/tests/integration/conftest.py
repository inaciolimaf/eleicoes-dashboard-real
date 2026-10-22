"""Test PostgreSQL and Redis. Without `TEST_DATABASE_URL` / `TEST_REDIS_URL` the tests skip.

Migrations run both ways once per session: `upgrade head` at the start, `downgrade base` at the end.
Each test starts with empty tables and an empty Redis. The tables are truncated, not rolled back:
the code under test commits, and the realtime messages leave only after the commit.
"""

from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from alembic import command
from app.core import db as db_mod
from app.core import redis as redis_mod
from app.modules.results import ingestion
from tests.integration.support import alembic_config, clean_database, database_url_or_skip, redis_url_or_skip


@pytest.fixture(scope="session")
def migrated_db() -> Iterator[None]:
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


@pytest_asyncio.fixture(scope="session")
async def engine(migrated_db: None) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(database_url_or_skip(), pool_size=5, max_overflow=10)
    db_mod.configure_engine(eng)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="session")
async def redis_cliente() -> AsyncIterator[Redis]:
    cli = redis_mod.create_redis(redis_url_or_skip())
    redis_mod.configure_redis(cli)
    await cli.flushdb()
    yield cli
    await cli.flushdb()
    await cli.aclose()


@pytest_asyncio.fixture
async def clean_db(engine: AsyncEngine, redis_cliente: Redis) -> AsyncIterator[AsyncEngine]:
    await clean_database(engine)
    await redis_cliente.flushdb()
    ingestion.known_candidate_ids.clear()
    yield engine


@pytest_asyncio.fixture
async def session(clean_db: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with db_mod.get_sessionmaker()() as s:
        yield s
