"""Realtime messages leave the worker only after the job's commit.

A job whose commit fails must publish nothing: the data it would announce was never stored.
"""

import contextlib
from collections.abc import AsyncIterator, Callable

import pytest

from app.core.db import get_sessionmaker
from app.infra import queue
from app.infra.realtime import topics
from app.modules.results import ingestion as ingestion
from app.modules.results import queries as results_queries
from app.worker.jobs import Processor, tracking


@contextlib.asynccontextmanager
async def _session(order: list[str], failure: bool) -> AsyncIterator[object]:
    """A real session whose commit is recorded in `ordem`, and fails when `falha` is set."""
    async with get_sessionmaker()() as session:
        commit_real = session.commit

        async def commit() -> None:
            order.append("commit")
            if failure:
                raise RuntimeError("commit falhou")
            await commit_real()

        session.commit = commit  # type: ignore[method-assign]
        yield session


def _factory(order: list[str], failure: bool) -> Callable[[], contextlib.AbstractAsyncContextManager[object]]:
    return lambda: _session(order, failure)


def _prepare_tracking(monkeypatch: pytest.MonkeyPatch, order: list[str]) -> None:
    async def publish(redis, topic: str, type_: str, data: object) -> None:
        order.append(f"publish:{topic}")

    async def progress_changed(session, round_number, tracking, state_code, captured) -> list[dict[str, str]]:
        return [{"level": "country"}]

    async def progress(session, round_number, t) -> dict[str, bool]:
        return {"ok": True}

    monkeypatch.setattr(tracking, "parse_tracking", lambda data: None)
    monkeypatch.setattr(ingestion, "ingest_progress", progress_changed)
    monkeypatch.setattr(results_queries, "progress", progress)
    monkeypatch.setattr(topics, "publish", publish)


async def test_job_publishes_only_after_its_commit(engine, redis_cliente, monkeypatch):
    order: list[str] = []
    _prepare_tracking(monkeypatch, order)
    proc = Processor(_factory(order, failure=False), redis_cliente)

    await proc.process(queue.TYPE_TRACKING, b"{}", {"round": 1, "state_code": "ac"})

    assert order == ["commit", "publish:progress:1"]


async def test_job_whose_commit_fails_publishes_nothing(engine, redis_cliente, monkeypatch):
    order: list[str] = []
    _prepare_tracking(monkeypatch, order)
    proc = Processor(_factory(order, failure=True), redis_cliente)

    with pytest.raises(RuntimeError, match="commit falhou"):
        await proc.process(queue.TYPE_TRACKING, b"{}", {"round": 1, "state_code": "ac"})

    assert order == ["commit"]
