"""Chaves em inglês no `payload` dos eventos guardados.

Os eventos gravados antes da renomeação trazem chaves em português (`sqcand`, `marco`, `novo_lider`,
`lider_anterior`); o feed e as regras de alerta já leem as chaves em inglês. A migração reescreve o
`payload` de cada linha, preservando os valores. O downgrade faz o caminho inverso.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PAYLOAD_PARA_INGLES = {
    "sqcand": "tse_candidate_id",
    "marco": "milestone",
    "novo_lider": "new_leader",
    "lider_anterior": "previous_leader",
}

EVENTS = sa.table("events", sa.column("id", sa.BigInteger), sa.column("payload", postgresql.JSONB))


def _reescrever(mapa: dict[str, str]) -> None:
    conexao = op.get_bind()
    for row_id, payload in conexao.execute(sa.select(EVENTS.c.id, EVENTS.c.payload)).all():
        novo: dict[str, Any] = {mapa.get(k, k): v for k, v in (payload or {}).items()}
        if novo != payload:
            conexao.execute(sa.update(EVENTS).where(EVENTS.c.id == row_id).values(payload=novo))


def upgrade() -> None:
    _reescrever(PAYLOAD_PARA_INGLES)


def downgrade() -> None:
    _reescrever({v: k for k, v in PAYLOAD_PARA_INGLES.items()})
