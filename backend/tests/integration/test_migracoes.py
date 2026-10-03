"""Migrações Alembic: sobem, descem e batem com os modelos."""

from alembic import command

from tests.conftest import alembic_config


def test_migracoes_sobem_descem_e_estao_em_dia():
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.check(cfg)  # falha se os modelos SQLAlchemy divergirem das migrações
