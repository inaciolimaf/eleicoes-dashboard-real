"""Imports the models of every module so Alembic sees the complete metadata."""

from app.core.db import Base
from app.modules.accounts import Compartilhamento, Favorito, Painel, Preferencia, Usuario
from app.modules.alerts import Alerta
from app.modules.ballot_reports import Boletim, ResultadoLocal
from app.modules.elections import Candidato, Eleicao, EleicaoCargo
from app.modules.events import Evento
from app.modules.geography import UF, LocalVotacao, Municipio, Secao, Zona
from app.modules.results import ProgressoAtual, ProgressoSnapshot, ResultadoAtual, Snapshot

__all__ = [
    "UF",
    "Alerta",
    "Base",
    "Boletim",
    "Candidato",
    "Compartilhamento",
    "Eleicao",
    "EleicaoCargo",
    "Evento",
    "Favorito",
    "LocalVotacao",
    "Municipio",
    "Painel",
    "Preferencia",
    "ProgressoAtual",
    "ProgressoSnapshot",
    "ResultadoAtual",
    "ResultadoLocal",
    "Secao",
    "Snapshot",
    "Usuario",
    "Zona",
]
