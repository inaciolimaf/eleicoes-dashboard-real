"""Migration 0004: the keys of the events `payload` become English and come back on downgrade."""

import asyncio
import json
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from tests.conftest import alembic_config

GEO = "migracao-0004"
ANTIGOS = [
    ("elected", {"sqcand": "10"}),
    ("milestone", {"marco": 50}),
    ("lead_change", {"novo_lider": "10", "lider_anterior": "20"}),
    ("start", {}),
    ("runoff", {"tse_candidate_id": "30", "outra": 1}),
]


async def _sql(sql: str, params: dict | None = None) -> list[tuple]:
    eng = create_async_engine(os.environ["TEST_DATABASE_URL"])
    try:
        async with eng.begin() as conn:
            res = await conn.execute(text(sql), params or {})
            return [tuple(r) for r in res.all()] if res.returns_rows else []
    finally:
        await eng.dispose()


def _payloads() -> list[tuple]:
    return asyncio.run(
        _sql("SELECT type, payload FROM events WHERE geo_area_id = :g ORDER BY id", {"g": GEO})
    )


def test_0004_renames_payload_keys_and_back_on_downgrade():
    cfg = alembic_config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0003")
    try:
        for kind, payload in ANTIGOS:
            asyncio.run(
                _sql(
                    "INSERT INTO events (round, type, occurred_at, office_code, level, geo_area_id, title, "
                    "description, payload) VALUES (1, :t, now(), 1, 'country', :g, 't', 'd', CAST(:p AS jsonb))",
                    {"t": kind, "g": GEO, "p": json.dumps(payload)},
                )
            )
        assert _payloads() == [(t, p) for t, p in ANTIGOS]

        command.upgrade(cfg, "head")
        assert _payloads() == [
            ("elected", {"tse_candidate_id": "10"}),
            ("milestone", {"milestone": 50}),
            ("lead_change", {"new_leader": "10", "previous_leader": "20"}),
            ("start", {}),
            ("runoff", {"tse_candidate_id": "30", "outra": 1}),
        ]

        command.downgrade(cfg, "0003")
        assert _payloads() == [
            ("elected", {"sqcand": "10"}),
            ("milestone", {"marco": 50}),
            ("lead_change", {"novo_lider": "10", "lider_anterior": "20"}),
            ("start", {}),
            ("runoff", {"sqcand": "30", "outra": 1}),
        ]
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(_sql("DELETE FROM events WHERE geo_area_id = :g", {"g": GEO}))
