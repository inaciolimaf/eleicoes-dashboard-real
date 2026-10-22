"""Control of the fake TSE (`tse-fake`): the mock speaks the TSE's vocabulary; here we translate it."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.admin.schemas import FakeTseControlCreate, FakeTseStateDto

#: The mock's state keys (its Portuguese vocabulary, part of the mock's protocol) -> our field names.
_STATE_FIELDS = {
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
#: Our control field names -> the mock's control keys (its vocabulary, kept on purpose).
_CONTROL_FIELDS = {"speed": "velocidade", "paused": "pausado", "restart": "reiniciar", "go_to": "ir_para"}


def _check_fake_environment() -> str:
    s = get_settings()
    if s.tse_environment != "fake":
        raise AppError(409, "Conflito", "controle disponível só no ambiente fake", "admin/not_fake")
    return s.tse_fake_control_url.rstrip("/")


async def _call(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    base = _check_fake_environment()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request(method, f"{base}/{path}", json=body)
    except httpx.HTTPError as exc:
        raise AppError(
            502, "Serviço externo indisponível", "mock do TSE indisponível", "admin/fake_tse_unavailable"
        ) from exc
    return dict(response.json())


def _to_state(raw: dict[str, Any]) -> FakeTseStateDto:
    return FakeTseStateDto(**{_STATE_FIELDS[k]: v for k, v in raw.items() if k in _STATE_FIELDS})


async def fake_state() -> FakeTseStateDto:
    return _to_state(await _call("GET", "estado"))


async def fake_control(body: FakeTseControlCreate) -> FakeTseStateDto:
    payload = {_CONTROL_FIELDS[k]: v for k, v in body.model_dump(exclude_none=True).items()}
    return _to_state(await _call("POST", "controle", payload))
