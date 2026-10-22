"""Elections: offices, candidates, party colors and candidate status."""

from app.modules.elections import colors, status
from app.modules.elections.models import Candidato, Eleicao, EleicaoCargo

__all__ = ["Candidato", "Eleicao", "EleicaoCargo", "colors", "status"]
