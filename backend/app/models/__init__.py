from app.models.base import Base
from app.models.boletim import Boletim, ResultadoLocal
from app.models.candidatura import Candidato
from app.models.eleicao import Eleicao, EleicaoCargo
from app.models.evento import Evento
from app.models.geografia import UF, LocalVotacao, Municipio, Secao, Zona
from app.models.resultado import ProgressoAtual, ProgressoSnapshot, ResultadoAtual, Snapshot
from app.models.usuario import Alerta, Compartilhamento, Favorito, Painel, Preferencia, Usuario

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
