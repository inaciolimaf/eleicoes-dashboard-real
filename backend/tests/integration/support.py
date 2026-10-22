"""Helpers of the integration tests: the test database's URL, Alembic and the table truncation."""

import os

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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


def database_url_or_skip() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set: run `make test` (Docker) or point it at a test PostgreSQL")
    return url


def redis_url_or_skip() -> str:
    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL not set: run `make test` (Docker) or point it at a test Redis")
    return url


def alembic_config() -> Config:
    cfg = Config(os.path.join(ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(ROOT, "alembic"))
    cfg.attributes["database_url"] = database_url_or_skip()
    return cfg


async def clean_database(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE " + ", ".join(TABELAS) + " RESTART IDENTITY CASCADE"))
