"""Migrações Alembic: sobem, descem e batem com os modelos."""

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from tests.conftest import alembic_config

USUARIO = "00000000-0000-0000-0000-000000000001"
ALERTA = "00000000-0000-0000-0000-000000000002"


def test_migracoes_sobem_descem_e_estao_em_dia():
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.check(cfg)  # falha se os modelos SQLAlchemy divergirem das migrações


async def _sql(sql: str, params: dict | None = None) -> list[tuple]:
    eng = create_async_engine(os.environ["TEST_DATABASE_URL"])
    try:
        async with eng.begin() as conn:
            res = await conn.execute(text(sql), params or {})
            return [tuple(r) for r in res.all()] if res.returns_rows else []
    finally:
        await eng.dispose()


def test_0002_preserva_dados_e_converte_valores_nos_dois_sentidos():
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
            {"id": ALERTA, "u": USUARIO},
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


def test_0003_renomeia_chaves_de_alerta_e_preferencias():
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
                "id": ALERTA,
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
        assert asyncio.run(_sql("SELECT params FROM alerts WHERE id = :i", {"i": ALERTA})) == [
            ({"cargo": 1, "nivel": "br", "id": "br", "sqcand": "10", "limite": 5},)
        ]
        command.upgrade(cfg, "head")
        assert asyncio.run(_sql("SELECT params FROM alerts WHERE id = :i", {"i": ALERTA})) == [
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
