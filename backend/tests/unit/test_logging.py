"""Logging: request ids travel through the response, and production writes JSON lines."""

import json
import logging
import re

import pytest
import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.log import configure_logging
from app.core.main import RequestIdMiddleware, create_app

HEX_ID = re.compile(r"[0-9a-f]{32}")


@pytest.fixture(autouse=True)
def restore_logging():
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)
    structlog.reset_defaults()


def _settings(environment: str) -> Settings:
    return Settings(_env_file=None, environment=environment, jwt_secret="y" * 40)


def _json_lines(output: str) -> list[dict]:
    return [json.loads(line) for line in output.splitlines() if line.strip()]


def test_response_carries_a_generated_request_id():
    client = TestClient(create_app())
    response = client.get("/api/openapi.json")
    assert HEX_ID.fullmatch(response.headers["x-request-id"])


def test_response_echoes_a_sane_request_id_sent_by_the_caller():
    client = TestClient(create_app())
    response = client.get("/api/openapi.json", headers={"x-request-id": "req-42.abc_7"})
    assert response.headers["x-request-id"] == "req-42.abc_7"


def test_unsafe_request_id_is_replaced_not_logged():
    client = TestClient(create_app())
    response = client.get("/api/openapi.json", headers={"x-request-id": "a" * 200})
    assert response.headers["x-request-id"] != "a" * 200
    assert HEX_ID.fullmatch(response.headers["x-request-id"])


def test_production_renders_json_lines(capsys):
    configure_logging(_settings("production"))
    structlog.get_logger("test").info("test.event", items=3)
    [line] = _json_lines(capsys.readouterr().out)
    assert line["event"] == "test.event"
    assert line["level"] == "info"
    assert line["items"] == 3
    assert line["timestamp"].endswith("Z") or "+00:00" in line["timestamp"]


def test_request_context_and_stdlib_records_reach_the_json_line(capsys):
    configure_logging(_settings("production"))
    app = FastAPI()

    @app.get("/items/{item_id}")
    async def item(item_id: int) -> dict[str, int]:
        structlog.get_logger("test").info("test.handled")
        logging.getLogger("legacy").warning("legacy.call")
        return {"id": item_id}

    app.add_middleware(RequestIdMiddleware, routes=app.router.routes)
    response = TestClient(app).get("/items/7", headers={"x-request-id": "req-42"})
    assert response.headers["x-request-id"] == "req-42"

    lines = {entry["event"]: entry for entry in _json_lines(capsys.readouterr().out)}
    for event in ("test.handled", "legacy.call"):
        assert lines[event]["request_id"] == "req-42"
        assert lines[event]["route"] == "/items/{item_id}"
        assert lines[event]["method"] == "GET"
    assert lines["legacy.call"]["level"] == "warning"


def test_development_renders_a_console_line_not_json(capsys):
    configure_logging(_settings("local"))
    structlog.get_logger("test").info("test.event", items=3)
    output = capsys.readouterr().out
    assert "test.event" in output
    with pytest.raises(json.JSONDecodeError):
        json.loads(output)
