"""Alembic migrations: they go up, go down and match the models."""

import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from tests.integration.support import alembic_config, database_url_or_skip

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("migrated_db")]

USUARIO = "00000000-0000-0000-0000-000000000001"
ALERT = "00000000-0000-0000-0000-000000000002"


def test_migrations_go_up_down_and_match_models():
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.check(cfg)  # fails if the SQLAlchemy models diverge from the migrations


async def _sql(sql: str, params: dict | None = None) -> list[tuple]:
    eng = create_async_engine(database_url_or_skip())
    try:
        async with eng.begin() as conn:
            res = await conn.execute(text(sql), params or {})
            return [tuple(r) for r in res.all()] if res.returns_rows else []
    finally:
        await eng.dispose()


def test_0002_keeps_data_and_converts_values_both_ways():
    cfg = alembic_config()
    command.upgrade(cfg, "head")
    asyncio.run(
        _sql(
            "INSERT INTO users (id, email, name, password_hash, is_admin, created_at, updated_at) "
            "VALUES (:id, 'migracao@teste.local', 'Migração', 'x', false, now(), now())",
            {"id": USUARIO},
        )
    )
    asyncio.run(
        _sql(
            "INSERT INTO alerts (id, user_id, type, params, active, created_at, updated_at) "
            "VALUES (:id, :u, 'candidate_pct', '{}', true, now(), now())",
            {"id": ALERT, "u": USUARIO},
        )
    )
    asyncio.run(
        _sql(
            "INSERT INTO events (round, type, occurred_at, office_code, level, geo_area_id, title, description, "
            "payload) VALUES (1, 'lead_change', now(), 1, 'municipality', 'migracao', 't', 'd', '{}')"
        )
    )
    try:
        command.downgrade(cfg, "0001")
        assert asyncio.run(_sql("SELECT tipo FROM alerta WHERE usuario_id = :u", {"u": USUARIO})) == [
            ("pct_candidato",)
        ]
        assert asyncio.run(_sql("SELECT tipo, nivel FROM evento WHERE recorte_id = 'migracao'")) == [
            ("virada", "municipio")
        ]
        assert asyncio.run(_sql("SELECT nome FROM usuario WHERE id = :u", {"u": USUARIO})) == [("Migração",)]
    finally:
        command.upgrade(cfg, "head")
    assert asyncio.run(_sql("SELECT type FROM alerts WHERE user_id = :u", {"u": USUARIO})) == [
        ("candidate_pct",)
    ]
    assert asyncio.run(_sql("SELECT type, level FROM events WHERE geo_area_id = 'migracao'")) == [
        ("lead_change", "municipality")
    ]
    assert asyncio.run(_sql("SELECT name FROM users WHERE id = :u", {"u": USUARIO})) == [("Migração",)]
    asyncio.run(_sql("DELETE FROM events WHERE geo_area_id = 'migracao'"))
    asyncio.run(_sql("DELETE FROM alerts WHERE user_id = :u", {"u": USUARIO}))
    asyncio.run(_sql("DELETE FROM users WHERE id = :u", {"u": USUARIO}))


def test_0003_renames_alert_and_preference_keys():
    cfg = alembic_config()
    command.upgrade(cfg, "head")
    asyncio.run(
        _sql(
            "INSERT INTO users (id, email, name, password_hash, is_admin, created_at, updated_at) "
            "VALUES (:id, 'chaves@teste.local', 'Chaves', 'x', false, now(), now())",
            {"id": USUARIO},
        )
    )
    asyncio.run(
        _sql(
            "INSERT INTO alerts (id, user_id, type, params, active, created_at, updated_at) "
            "VALUES (:id, :u, 'candidate_pct', CAST(:p AS jsonb), true, now(), now())",
            {
                "id": ALERT,
                "u": USUARIO,
                "p": '{"cargo": 1, "nivel": "br", "id": "br", "sqcand": "10", "limite": 5}',
            },
        )
    )
    asyncio.run(
        _sql(
            "INSERT INTO preferences (user_id, data) VALUES (:u, CAST(:d AS jsonb))",
            {"u": USUARIO, "d": '{"tema": "claro", "notificacoes": {"virada": true}}'},
        )
    )
    try:
        command.downgrade(cfg, "0002")
        assert asyncio.run(_sql("SELECT params FROM alerts WHERE id = :i", {"i": ALERT})) == [
            ({"cargo": 1, "nivel": "br", "id": "br", "sqcand": "10", "limite": 5},)
        ]
        command.upgrade(cfg, "head")
        assert asyncio.run(_sql("SELECT params FROM alerts WHERE id = :i", {"i": ALERT})) == [
            (
                {
                    "office_code": 1,
                    "level": "country",
                    "geo_area_id": "br",
                    "tse_candidate_id": "10",
                    "threshold": 5,
                },
            )
        ]
        assert asyncio.run(_sql("SELECT data FROM preferences WHERE user_id = :u", {"u": USUARIO})) == [
            ({"theme": "claro", "notifications": {"lead_change": True}},)
        ]
    finally:
        asyncio.run(_sql("DELETE FROM preferences WHERE user_id = :u", {"u": USUARIO}))
        asyncio.run(_sql("DELETE FROM alerts WHERE user_id = :u", {"u": USUARIO}))
        asyncio.run(_sql("DELETE FROM users WHERE id = :u", {"u": USUARIO}))
