"""Settings: each field reads the server's variable, and production refuses a bad JWT secret."""

import pytest
from pydantic import ValidationError

from app.core.config import EXAMPLE_SECRETS, Settings, SettingsError
from tests.conftest import SETTINGS_VARIABLES


def test_isolation_lists_every_variable_settings_reads():
    """The autouse fixture clears these names: a field whose variable is missing would leak the machine's value."""
    aliases = {field.validation_alias for field in Settings.model_fields.values()}
    assert aliases == SETTINGS_VARIABLES


def test_fields_read_the_server_variables(monkeypatch):
    monkeypatch.setenv("TSE_AMBIENTE", "simulado")
    monkeypatch.setenv("FILA_MAX", "7")
    monkeypatch.setenv("MODO_SECOES", "todas")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    s = Settings(_env_file=None)
    assert s.tse_environment == "simulado"
    assert s.queue_max == 7
    assert s.section_mode == "todas"


@pytest.mark.parametrize(
    "secret",
    [None, "x" * 31, next(iter(EXAMPLE_SECRETS))],
    ids=["missing", "short", "example"],
)
def test_production_refuses_missing_short_or_example_secret(monkeypatch, secret):
    monkeypatch.setenv("ENVIRONMENT", "production")
    if secret is None:
        monkeypatch.delenv("JWT_SECRET", raising=False)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)
        return
    monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(SettingsError):
        Settings(_env_file=None)


def test_production_accepts_a_long_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "y" * 40)
    assert Settings(_env_file=None).environment == "production"
