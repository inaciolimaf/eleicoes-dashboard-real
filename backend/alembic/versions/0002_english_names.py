"""Nomes em inglês no banco: tabelas, colunas, índices, constraints, sequências e valores guardados.

Renomeia por migração, preservando os dados (nunca derruba e recria). O downgrade faz o caminho
inverso, inclusive os valores de enumeração.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABELAS: list[tuple[str, str]] = [
    ("usuario", "users"),
    ("preferencia", "preferences"),
    ("painel", "dashboards"),
    ("compartilhamento", "shares"),
    ("favorito", "favorites"),
    ("alerta", "alerts"),
    ("boletim_urna", "ballot_box_reports"),
    ("resultado_local", "polling_place_results"),
    ("eleicao", "elections"),
    ("eleicao_cargo", "election_offices"),
    ("candidato", "candidates"),
    ("evento", "events"),
    ("uf", "states"),
    ("municipio", "municipalities"),
    ("zona", "electoral_zones"),
    ("local_votacao", "polling_places"),
    ("secao", "polling_sections"),
    ("snapshot_resultado", "result_snapshots"),
    ("resultado_atual", "current_results"),
    ("snapshot_progresso", "progress_snapshots"),
    ("progresso_atual", "current_progress"),
]

_RESULTADO = [
    ("eleicao_id", "election_id"),
    ("turno", "round"),
    ("cd_cargo", "office_code"),
    ("nivel", "level"),
    ("recorte_id", "geo_area_id"),
    ("pai_id", "parent_id"),
    ("uf", "state_code"),
    ("idg", "generation_id"),
    ("totalizado_em", "tallied_at"),
    ("capturado_em", "captured_at"),
    ("jws_verificado", "jws_verified"),
    ("fonte", "source"),
    ("arquivo", "source_file"),
    ("eleitorado", "electorate"),
    ("eleitorado_apurado", "tallied_electorate"),
    ("secoes_total", "sections_total"),
    ("secoes_totalizadas", "sections_tallied"),
    ("pct_secoes", "pct_sections"),
    ("comparecimento", "turnout"),
    ("pct_comparecimento", "pct_turnout"),
    ("abstencao", "abstention"),
    ("pct_abstencao", "pct_abstention"),
    ("votos_total", "total_votes"),
    ("votos_validos", "valid_votes"),
    ("pct_validos", "pct_valid"),
    ("brancos", "blank_votes"),
    ("pct_brancos", "pct_blank"),
    ("nulos", "null_votes"),
    ("pct_nulos", "pct_null"),
    ("matematicamente_definido", "mathematically_decided"),
    ("totalizacao_final", "final_tally"),
    ("lider_sqcand", "leader_candidate_id"),
    ("lider_votos", "leader_votes"),
    ("lider_pct", "leader_pct"),
    ("segundo_sqcand", "second_candidate_id"),
    ("segundo_votos", "second_votes"),
    ("segundo_pct", "second_pct"),
    ("margem_pp", "margin_pp"),
    ("partido_lider", "leader_party"),
    ("candidatos", "candidates"),
    ("agremiacoes", "alliances"),
]

_PROGRESSO = [
    ("turno", "round"),
    ("nivel", "level"),
    ("recorte_id", "geo_area_id"),
    ("uf", "state_code"),
    ("idg", "generation_id"),
    ("totalizado_em", "tallied_at"),
    ("capturado_em", "captured_at"),
    ("andamento", "progress_code"),
    ("secoes_total", "sections_total"),
    ("secoes_totalizadas", "sections_tallied"),
    ("pct_secoes", "pct_sections"),
    ("eleitorado", "electorate"),
    ("comparecimento", "turnout"),
    ("pct_comparecimento", "pct_turnout"),
    ("municipios_finalizados", "municipalities_completed"),
    ("municipios_parciais", "municipalities_partial"),
    ("municipios_nao_recebidos", "municipalities_not_received"),
]

# tabela (nome novo) -> [(coluna antiga, coluna nova)]
COLUNAS: dict[str, list[tuple[str, str]]] = {
    "users": [("nome", "name"), ("senha_hash", "password_hash"), ("criado_em", "created_at"), ("atualizado_em", "updated_at")],
    "preferences": [("usuario_id", "user_id"), ("dados", "data")],
    "dashboards": [
        ("usuario_id", "user_id"),
        ("nome", "name"),
        ("ordem", "position"),
        ("padrao", "is_default"),
        ("criado_em", "created_at"),
        ("atualizado_em", "updated_at"),
    ],
    "shares": [("painel_id", "dashboard_id"), ("modo", "mode"), ("tempo", "frozen_time"), ("criado_em", "created_at")],
    "favorites": [("usuario_id", "user_id"), ("tipo", "type"), ("rotulo", "label")],
    "alerts": [
        ("usuario_id", "user_id"),
        ("tipo", "type"),
        ("ativo", "active"),
        ("disparado_em", "triggered_at"),
        ("criado_em", "created_at"),
        ("atualizado_em", "updated_at"),
    ],
    "ballot_box_reports": [
        ("turno", "round"),
        ("secao_id", "polling_section_id"),
        ("local_id", "polling_place_id"),
        ("zona_id", "electoral_zone_id"),
        ("municipio_id", "municipality_id"),
        ("uf", "state_code"),
        ("totalizado_em", "tallied_at"),
        ("emitido_em", "issued_at"),
        ("capturado_em", "captured_at"),
        ("eleitores_aptos", "eligible_voters"),
        ("comparecimento", "turnout"),
        ("assinatura_ok", "signature_valid"),
        ("votos", "votes"),
    ],
    "polling_place_results": [
        ("turno", "round"),
        ("cd_cargo", "office_code"),
        ("local_id", "polling_place_id"),
        ("municipio_id", "municipality_id"),
        ("uf", "state_code"),
        ("secoes_total", "sections_total"),
        ("secoes_apuradas", "sections_tallied"),
        ("comparecimento", "turnout"),
        ("votos_validos", "valid_votes"),
        ("brancos", "blank_votes"),
        ("nulos", "null_votes"),
        ("lider_sqcand", "leader_candidate_id"),
        ("lider_pct", "leader_pct"),
        ("margem_pp", "margin_pp"),
        ("votos", "votes"),
        ("atualizado_em", "updated_at"),
    ],
    "elections": [
        ("ambiente", "tse_environment"),
        ("ciclo", "cycle"),
        ("cd_pleito", "election_event_code"),
        ("cd_eleicao", "election_code"),
        ("cd_eleicao_t2", "runoff_election_code"),
        ("turno", "round"),
        ("tipo", "jurisdiction"),
        ("nome", "name"),
        ("data", "date"),
    ],
    "election_offices": [
        ("eleicao_id", "election_id"),
        ("cd_cargo", "office_code"),
        ("nome", "name"),
        ("sistema", "voting_system"),
        ("abrangencia", "coverage"),
        ("vagas", "seats"),
    ],
    "candidates": [
        ("sqcand", "tse_candidate_id"),
        ("eleicao_id", "election_id"),
        ("turno", "round"),
        ("cd_cargo", "office_code"),
        ("uf", "state_code"),
        ("numero", "ballot_number"),
        ("nome", "name"),
        ("nome_urna", "ballot_name"),
        ("partido_sigla", "party_abbreviation"),
        ("partido_numero", "party_number"),
        ("agremiacao", "alliance"),
        ("cor", "color"),
        ("vices", "vice_and_substitutes"),
        ("situacao_geral", "overall_status"),
        ("eleito", "elected"),
        ("atualizado_em", "updated_at"),
    ],
    "events": [
        ("turno", "round"),
        ("tipo", "type"),
        ("ocorrido_em", "occurred_at"),
        ("criado_em", "created_at"),
        ("cd_cargo", "office_code"),
        ("nivel", "level"),
        ("recorte_id", "geo_area_id"),
        ("titulo", "title"),
        ("descricao", "description"),
    ],
    "states": [("sigla", "code"), ("nome", "name"), ("regiao", "region")],
    "municipalities": [
        ("uf", "state_code"),
        ("cd_tse", "tse_code"),
        ("cd_ibge", "ibge_code"),
        ("nome", "name"),
        ("capital", "is_capital"),
        ("eleitorado", "electorate"),
    ],
    "electoral_zones": [("municipio_id", "municipality_id"), ("uf", "state_code"), ("numero", "number")],
    "polling_places": [
        ("municipio_id", "municipality_id"),
        ("zona_id", "electoral_zone_id"),
        ("uf", "state_code"),
        ("numero", "number"),
        ("nome", "name"),
        ("endereco", "address"),
        ("bairro", "neighborhood"),
        ("cep", "zip_code"),
        ("aproximado", "is_approximate"),
        ("eleitores_aptos", "eligible_voters"),
        ("qtd_secoes", "section_count"),
    ],
    "polling_sections": [
        ("municipio_id", "municipality_id"),
        ("zona_id", "electoral_zone_id"),
        ("local_id", "polling_place_id"),
        ("uf", "state_code"),
        ("numero", "number"),
        ("eleitores_aptos", "eligible_voters"),
        ("agregadora", "aggregator_section"),
    ],
    "result_snapshots": _RESULTADO,
    "current_results": _RESULTADO,
    "progress_snapshots": _PROGRESSO,
    "current_progress": _PROGRESSO,
}

# (tabela nova, antigo, novo) — constraints PK, UNIQUE e FK (ALTER TABLE ... RENAME CONSTRAINT)
CONSTRAINTS: list[tuple[str, str, str]] = [
    ("ballot_box_reports", "pk_boletim_urna", "pk_ballot_box_reports"),
    ("ballot_box_reports", "uq_boletim_urna_turno_secao_id", "uq_ballot_box_reports_round_polling_section_id"),
    ("elections", "pk_eleicao", "pk_elections"),
    ("elections", "uq_eleicao_ambiente_cd_eleicao", "uq_elections_tse_environment_election_code"),
    ("events", "pk_evento", "pk_events"),
    ("current_progress", "pk_progresso_atual", "pk_current_progress"),
    ("current_results", "pk_resultado_atual", "pk_current_results"),
    ("polling_place_results", "pk_resultado_local", "pk_polling_place_results"),
    ("progress_snapshots", "pk_snapshot_progresso", "pk_progress_snapshots"),
    ("progress_snapshots", "uq_snapshot_progresso_turno_nivel_recorte_id_idg", "uq_progress_snapshots_key"),
    ("result_snapshots", "pk_snapshot_resultado", "pk_result_snapshots"),
    (
        "result_snapshots",
        "uq_snapshot_resultado_turno_cd_cargo_nivel_recorte_id_idg",
        "uq_result_snapshots_key",
    ),
    ("states", "pk_uf", "pk_states"),
    ("users", "pk_usuario", "pk_users"),
    ("users", "uq_usuario_email", "uq_users_email"),
    ("alerts", "pk_alerta", "pk_alerts"),
    ("alerts", "fk_alerta_usuario_id_usuario", "fk_alerts_user_id_users"),
    ("candidates", "pk_candidato", "pk_candidates"),
    ("candidates", "fk_candidato_eleicao_id_eleicao", "fk_candidates_election_id_elections"),
    ("election_offices", "pk_eleicao_cargo", "pk_election_offices"),
    (
        "election_offices",
        "fk_eleicao_cargo_eleicao_id_eleicao",
        "fk_election_offices_election_id_elections",
    ),
    ("favorites", "pk_favorito", "pk_favorites"),
    ("favorites", "fk_favorito_usuario_id_usuario", "fk_favorites_user_id_users"),
    ("municipalities", "pk_municipio", "pk_municipalities"),
    ("municipalities", "fk_municipio_uf_uf", "fk_municipalities_state_code_states"),
    ("dashboards", "pk_painel", "pk_dashboards"),
    ("dashboards", "fk_painel_usuario_id_usuario", "fk_dashboards_user_id_users"),
    ("preferences", "pk_preferencia", "pk_preferences"),
    ("preferences", "fk_preferencia_usuario_id_usuario", "fk_preferences_user_id_users"),
    ("shares", "pk_compartilhamento", "pk_shares"),
    ("shares", "fk_compartilhamento_painel_id_painel", "fk_shares_dashboard_id_dashboards"),
    ("polling_places", "pk_local_votacao", "pk_polling_places"),
    (
        "polling_places",
        "fk_local_votacao_municipio_id_municipio",
        "fk_polling_places_municipality_id_municipalities",
    ),
    ("polling_sections", "pk_secao", "pk_polling_sections"),
    (
        "polling_sections",
        "fk_secao_municipio_id_municipio",
        "fk_polling_sections_municipality_id_municipalities",
    ),
    ("electoral_zones", "pk_zona", "pk_electoral_zones"),
    (
        "electoral_zones",
        "fk_zona_municipio_id_municipio",
        "fk_electoral_zones_municipality_id_municipalities",
    ),
]

# índices (ALTER INDEX ... RENAME), incluindo os de trigram criados à mão na 0001
INDICES: list[tuple[str, str]] = [
    ("ix_boletim_local_tempo", "ix_ballot_box_reports_polling_place_tallied"),
    ("ix_boletim_municipio", "ix_ballot_box_reports_municipality"),
    ("ix_boletim_urna_zona_id", "ix_ballot_box_reports_electoral_zone_id"),
    ("ix_evento_turno_ocorrido", "ix_events_round_occurred_at"),
    ("ix_resultado_atual_pai", "ix_current_results_parent"),
    ("ix_resultado_local_municipio", "ix_polling_place_results_municipality"),
    ("ix_snapshot_progresso_tempo", "ix_progress_snapshots_time"),
    ("ix_snapshot_busca_tempo", "ix_result_snapshots_search"),
    ("ix_snapshot_pai_tempo", "ix_result_snapshots_parent"),
    ("ix_alerta_usuario_id", "ix_alerts_user_id"),
    ("ix_candidato_cargo_uf_numero", "ix_candidates_office_state_ballot_number"),
    ("ix_candidato_nome_trgm", "ix_candidates_ballot_name_trgm"),
    ("ix_municipio_cd_ibge", "ix_municipalities_ibge_code"),
    ("ix_municipio_uf", "ix_municipalities_state_code"),
    ("ix_municipio_nome_trgm", "ix_municipalities_name_trgm"),
    ("ix_painel_usuario_id", "ix_dashboards_user_id"),
    ("ix_compartilhamento_painel_id", "ix_shares_dashboard_id"),
    ("ix_local_votacao_lat_lon", "ix_polling_places_lat_lon"),
    ("ix_local_votacao_municipio_id", "ix_polling_places_municipality_id"),
    ("ix_local_votacao_uf", "ix_polling_places_state_code"),
    ("ix_local_votacao_zona_id", "ix_polling_places_electoral_zone_id"),
    ("ix_local_nome_trgm", "ix_polling_places_name_trgm"),
    ("ix_secao_local_id", "ix_polling_sections_polling_place_id"),
    ("ix_secao_municipio_id", "ix_polling_sections_municipality_id"),
    ("ix_secao_uf", "ix_polling_sections_state_code"),
    ("ix_secao_zona_id", "ix_polling_sections_electoral_zone_id"),
    ("ix_zona_municipio_id", "ix_electoral_zones_municipality_id"),
]

# sequências das colunas id seriais (nome padrão do Postgres: <tabela>_<coluna>_seq)
SEQUENCIAS: list[tuple[str, str]] = [
    ("boletim_urna_id_seq", "ballot_box_reports_id_seq"),
    ("eleicao_id_seq", "elections_id_seq"),
    ("evento_id_seq", "events_id_seq"),
    ("snapshot_resultado_id_seq", "result_snapshots_id_seq"),
    ("snapshot_progresso_id_seq", "progress_snapshots_id_seq"),
]

# valores guardados: (tabela, coluna, antigo, novo)
_NIVEL = {"br": "country", "uf": "state", "municipio": "municipality", "zona": "zone", "local": "polling_place", "secao": "section"}
VALORES: list[tuple[str, str, dict[str, str]]] = [
    ("result_snapshots", "level", _NIVEL),
    ("current_results", "level", _NIVEL),
    ("progress_snapshots", "level", _NIVEL),
    ("current_progress", "level", _NIVEL),
    ("events", "level", _NIVEL),
    (
        "candidates",
        "overall_status",
        {
            "ELEITO": "ELECTED",
            "SEGUNDO_TURNO": "RUNOFF",
            "MATEMATICAMENTE_ELEITO": "MATHEMATICALLY_ELECTED",
            "LIDERANDO": "LEADING",
            "SUPLENTE": "SUBSTITUTE",
            "NAO_ELEITO": "NOT_ELECTED",
            "SUB_JUDICE": "SUB_JUDICE",
            "EM_APURACAO": "COUNTING",
        },
    ),
    (
        "polling_place_results",
        "status",
        {"nao_recebido": "not_received", "parcial": "partial", "apurado": "tallied"},
    ),
    (
        "alerts",
        "type",
        {
            "pct_candidato": "candidate_pct",
            "apuracao": "tally_threshold",
            "virada": "lead_change",
            "eleito": "elected",
            "local_apurado": "polling_place_tallied",
        },
    ),
    (
        "events",
        "type",
        {
            "inicio": "start",
            "marco": "milestone",
            "virada": "lead_change",
            "eleito": "elected",
            "matematicamente_definido": "mathematically_decided",
            "segundo_turno": "runoff",
        },
    ),
    (
        "favorites",
        "type",
        {"candidato": "candidate", "recorte": "geo_area", "local": "polling_place", "secao": "section"},
    ),
    ("shares", "mode", {"ao_vivo": "live", "congelado": "frozen"}),
]


def _valores(inverso: bool) -> None:
    """Converte os valores guardados (upgrade: código -> inglês; downgrade: inglês -> código)."""
    for tabela, coluna, mapa in VALORES:
        pares = {v: k for k, v in mapa.items()} if inverso else mapa
        t = sa.table(tabela, sa.column(coluna, sa.String))
        for antigo, novo in pares.items():
            op.execute(sa.update(t).where(t.c[coluna] == antigo).values({coluna: novo}))


def _colunas(inverso: bool) -> None:
    # as tabelas já estão com o nome novo nesta etapa, nos dois sentidos
    for tabela, pares in COLUNAS.items():
        for antiga, nova in pares:
            if inverso:
                op.alter_column(tabela, nova, new_column_name=antiga)
            else:
                op.alter_column(tabela, antiga, new_column_name=nova)


# a coluna de nível passa de 10 para 16 caracteres: "municipality" e "polling_place" não cabem em 10
TABELAS_NIVEL = ["result_snapshots", "current_results", "progress_snapshots", "current_progress", "events"]


def _tamanho_nivel(inverso: bool) -> None:
    for tabela in TABELAS_NIVEL:
        if inverso:
            op.alter_column(tabela, "level", existing_type=sa.String(16), type_=sa.String(10))
        else:
            op.alter_column(tabela, "level", existing_type=sa.String(10), type_=sa.String(16))


def _tabelas(inverso: bool) -> None:
    for antigo, novo in TABELAS:
        if inverso:
            op.rename_table(novo, antigo)
        else:
            op.rename_table(antigo, novo)


def _constraints_indices_sequencias(inverso: bool) -> None:
    # constraints usam o nome novo da tabela: nos dois sentidos, esta etapa roda com as tabelas já novas
    for tabela, antigo, novo in CONSTRAINTS:
        origem, destino = (novo, antigo) if inverso else (antigo, novo)
        op.execute(f'ALTER TABLE "{tabela}" RENAME CONSTRAINT "{origem}" TO "{destino}"')
    for antigo, novo in INDICES:
        origem, destino = (novo, antigo) if inverso else (antigo, novo)
        op.execute(f'ALTER INDEX "{origem}" RENAME TO "{destino}"')
    for antigo, novo in SEQUENCIAS:
        origem, destino = (novo, antigo) if inverso else (antigo, novo)
        op.execute(f'ALTER SEQUENCE "{origem}" RENAME TO "{destino}"')


def upgrade() -> None:
    _tabelas(inverso=False)
    _colunas(inverso=False)
    _tamanho_nivel(inverso=False)
    _constraints_indices_sequencias(inverso=False)
    _valores(inverso=False)


def downgrade() -> None:
    _valores(inverso=True)
    _constraints_indices_sequencias(inverso=True)
    _tamanho_nivel(inverso=True)
    _colunas(inverso=True)
    _tabelas(inverso=True)
