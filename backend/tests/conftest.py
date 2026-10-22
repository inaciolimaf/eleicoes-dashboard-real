"""Environment shared by every test.

Each test starts from the same configuration: the machine's variables and its `.env` never reach
`Settings`, and the database and Redis are unreachable unless the test asks for them through
`tests/integration/conftest.py`. The unit tests therefore run without any infrastructure.
"""

import inspect
import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.core.config import Settings

#: Every variable `Settings` reads, by the real name (the `validation_alias` in `app/core/config.py`).
#: `tests/unit/test_settings.py` checks this list against the fields, so a new field cannot slip past.
SETTINGS_VARIABLES = frozenset(
    {
        "ENVIRONMENT",
        "DATABASE_URL",
        "REDIS_URL",
        "TSE_AMBIENTE",
        "TSE_BASE_URL",
        "TSE_MAX_RPS",
        "TSE_CONCORRENCIA",
        "TSE_VERIFICAR_JWS",
        "TSE_USAR_JWS",
        "INTERVALO_CATALOGO",
        "INTERVALO_PRINCIPAL",
        "INTERVALO_ACOMPANHAMENTO",
        "INTERVALO_MIN_MUNICIPIO",
        "COLETAR_SECOES",
        "MODO_SECOES",
        "COLETAR_ZONAS",
        "FILA_MAX",
        "COLETOR_WORKERS_MUNICIPIO",
        "COLETOR_WORKERS_SECAO",
        "WORKER_CONCORRENCIA",
        "TSE_FAKE_KID",
        "TSE_FAKE_CHAVE_PUBLICA",
        "TSE_FAKE_CONTROLE_URL",
        "LOCAIS_VOTACAO_URL",
        "DIR_BRUTOS",
        "DIR_CACHE_FOTOS",
        "JWT_SECRET",
        "JWT_EXPIRA_MIN",
        "CORS_ORIGINS",
        "LOG_LEVEL",
        "LOGIN_MAX_FAILURES",
        "LOGIN_WINDOW_SECONDS",
    }
)

#: The test environment. Port 1 refuses connections at once: a test that did not ask for infrastructure
#: fails instead of finding it. The directories are set per test (under `tmp_path`).
TEST_ENVIRONMENT = {
    "ENVIRONMENT": "test",
    "DATABASE_URL": "postgresql+asyncpg://eleicoes:eleicoes@127.0.0.1:1/inalcancavel",
    "REDIS_URL": "redis://127.0.0.1:1/0",
    "JWT_SECRET": "segredo-de-teste-com-no-minimo-32-bytes",
    "TSE_AMBIENTE": "fake",
    "TSE_BASE_URL": "http://tse-fake.teste/oficial",
    "TSE_FAKE_CONTROLE_URL": "http://tse-fake.teste/_fake",
    "LOCAIS_VOTACAO_URL": "http://tse-fake.teste/dadosabertos/eleitorado_local_votacao_2026.csv",
}

#: Packages whose `lru_cache` functions hold state that a test must not inherit.
APP_PACKAGES = frozenset({"app", "tse_fake", "tools"})

# `app/core/main.py` builds the application at import time, which reads `Settings`. Test modules are
# imported after this conftest, so the isolation also applies at import, before any fixture runs.
Settings.model_config["env_file"] = None
for _name in list(os.environ):
    if _name.upper() in SETTINGS_VARIABLES:
        del os.environ[_name]
os.environ.update(TEST_ENVIRONMENT)


def clear_lru_caches() -> None:
    """Empties every `lru_cache` singleton of the project (`get_settings` among them)."""
    for name, module in list(sys.modules.items()):
        if module is None or name.partition(".")[0] not in APP_PACKAGES:
            continue
        for value in list(vars(module).values()):
            if inspect.isfunction(value) and hasattr(value, "cache_clear"):
                value.cache_clear()


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    for name in list(os.environ):
        if name.upper() in SETTINGS_VARIABLES:
            monkeypatch.delenv(name)
    for name, value in TEST_ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("DIR_BRUTOS", str(tmp_path / "brutos"))
    monkeypatch.setenv("DIR_CACHE_FOTOS", str(tmp_path / "fotos"))
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    clear_lru_caches()
    yield
    clear_lru_caches()
