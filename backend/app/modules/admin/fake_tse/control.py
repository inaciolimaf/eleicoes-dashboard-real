"""Controle do mock do TSE (`tse-fake`): o mock fala o vocabulário do TSE; aqui traduzimos."""

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.admin.schemas import FakeTseControlCreate, FakeTseStateDto

_ESTADO = {
    "agora": "now",
    "minutos_apos_17h": "minutes_after_17h",
    "velocidade": "speed",
    "pausado": "paused",
    "pct_secoes": "pct_sections",
    "fim_previsto": "expected_end",
    "secoes": "sections",
    "municipios": "municipalities",
    "locais": "polling_places",
}
_CONTROLE = {"speed": "velocidade", "paused": "pausado", "restart": "reiniciar", "go_to": "ir_para"}


def _verifica_fake() -> str:
    s = get_settings()
    if s.tse_ambiente != "fake":
        raise AppError(409, "Conflito", "controle disponível só no ambiente fake", "admin/not_fake")
    return s.tse_fake_controle_url.rstrip("/")


async def _chamar(metodo: str, caminho: str, corpo: dict | None = None) -> dict:
    base = _verifica_fake()
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.request(metodo, f"{base}/{caminho}", json=corpo)
    except httpx.HTTPError as exc:
        raise AppError(
            502, "Serviço externo indisponível", "mock do TSE indisponível", "admin/fake_tse_unavailable"
        ) from exc
    return dict(r.json())


def _estado(bruto: dict) -> FakeTseStateDto:
    return FakeTseStateDto(**{_ESTADO[k]: v for k, v in bruto.items() if k in _ESTADO})


async def fake_state() -> FakeTseStateDto:
    return _estado(await _chamar("GET", "estado"))


async def fake_control(dados: FakeTseControlCreate) -> FakeTseStateDto:
    corpo = {_CONTROLE[k]: v for k, v in dados.model_dump(exclude_none=True).items()}
    return _estado(await _chamar("POST", "controle", corpo))
