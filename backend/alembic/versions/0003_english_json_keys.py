"""Chaves em inglês nos JSON guardados pelo usuário: parâmetros de alerta e preferências.

`alerts.params` (chaves e nível) e `preferences.data` são dados do usuário: a migração reescreve
as chaves em todas as linhas, sem perder valor. `dashboards.config` NÃO muda (decisão 8 do glossário:
é JSON do painel, compartilhado por link). O downgrade faz o caminho inverso.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PARAMS_PARA_INGLES = {
    "cargo": "office_code",
    "nivel": "level",
    "id": "geo_area_id",
    "sqcand": "tse_candidate_id",
    "limite": "threshold",
    "local_id": "polling_place_id",
}
NIVEL_PARA_INGLES = {
    "br": "country",
    "uf": "state",
    "municipio": "municipality",
    "zona": "zone",
    "local": "polling_place",
    "secao": "section",
}
PREFERENCIAS_PARA_INGLES = {
    "tema": "theme",
    "densidade": "density",
    "animacoes": "animations",
    "cores_candidatos": "candidate_colors",
    "notificacoes": "notifications",
}
NOTIFICACOES_PARA_INGLES = {"virada": "lead_change", "eleito": "elected", "marco": "milestone"}

ALERTS = sa.table("alerts", sa.column("id", sa.Uuid), sa.column("params", postgresql.JSONB))
PREFERENCES = sa.table("preferences", sa.column("user_id", sa.Uuid), sa.column("data", postgresql.JSONB))


def _traduzir(d: dict[str, Any], chaves: dict[str, str], niveis: bool, notif: bool) -> dict[str, Any]:
    saida: dict[str, Any] = {}
    for k, v in d.items():
        nk = chaves.get(k, k)
        if niveis and nk == "level" and isinstance(v, str):
            v = NIVEL_PARA_INGLES.get(v, v)
        if notif and nk == "notifications" and isinstance(v, dict):
            v = {NOTIFICACOES_PARA_INGLES.get(x, x): y for x, y in v.items()}
        saida[nk] = v
    return saida


def _reescrever(params: bool, inverso: bool) -> None:
    conexao = op.get_bind()
    if params:
        mapa = {v: k for k, v in PARAMS_PARA_INGLES.items()} if inverso else PARAMS_PARA_INGLES
        niveis = {v: k for k, v in NIVEL_PARA_INGLES.items()} if inverso else NIVEL_PARA_INGLES
        for row_id, dados in conexao.execute(sa.select(ALERTS.c.id, ALERTS.c.params)).all():
            novo = {**dados}
            novo = {
                mapa.get(k, k): (niveis.get(v, v) if mapa.get(k, k) == "level" else v)
                for k, v in novo.items()
            }
            conexao.execute(sa.update(ALERTS).where(ALERTS.c.id == row_id).values(params=novo))
        return
    mapa = {v: k for k, v in PREFERENCIAS_PARA_INGLES.items()} if inverso else PREFERENCIAS_PARA_INGLES
    notif = {v: k for k, v in NOTIFICACOES_PARA_INGLES.items()} if inverso else NOTIFICACOES_PARA_INGLES
    for uid, dados in conexao.execute(sa.select(PREFERENCES.c.user_id, PREFERENCES.c.data)).all():
        novo = {mapa.get(k, k): v for k, v in dados.items()}
        if isinstance(novo.get("notifications"), dict):
            novo["notifications"] = {notif.get(x, x): y for x, y in novo["notifications"].items()}
        conexao.execute(sa.update(PREFERENCES).where(PREFERENCES.c.user_id == uid).values(data=novo))


def upgrade() -> None:
    _reescrever(params=True, inverso=False)
    _reescrever(params=False, inverso=False)


def downgrade() -> None:
    _reescrever(params=True, inverso=True)
    _reescrever(params=False, inverso=True)
