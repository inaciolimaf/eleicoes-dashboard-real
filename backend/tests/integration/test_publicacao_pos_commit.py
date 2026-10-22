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
async def _sessao(ordem: list[str], falha: bool) -> AsyncIterator[object]:
    """A real session whose commit is recorded in `ordem`, and fails when `falha` is set."""
    async with get_sessionmaker()() as session:
        commit_real = session.commit

        async def commit() -> None:
            ordem.append("commit")
            if falha:
                raise RuntimeError("commit falhou")
            await commit_real()

        session.commit = commit  # type: ignore[method-assign]
        yield session


def _fabrica(ordem: list[str], falha: bool) -> Callable[[], contextlib.AbstractAsyncContextManager[object]]:
    return lambda: _sessao(ordem, falha)


def _preparar_tracking(monkeypatch: pytest.MonkeyPatch, ordem: list[str]) -> None:
    async def publicar(redis, topic: str, type_: str, data: object) -> None:
        ordem.append(f"publish:{topic}")

    async def progresso_mudou(session, turno, acomp, uf, capturado) -> list[dict[str, str]]:
        return [{"level": "country"}]

    async def progress(session, turno, t) -> dict[str, bool]:
        return {"ok": True}

    monkeypatch.setattr(tracking, "parse_tracking", lambda dados: None)
    monkeypatch.setattr(ingestion, "ingest_progress", progresso_mudou)
    monkeypatch.setattr(results_queries, "progress", progress)
    monkeypatch.setattr(topics, "publish", publicar)


async def test_job_publishes_only_after_its_commit(engine, redis_cliente, monkeypatch):
    ordem: list[str] = []
    _preparar_tracking(monkeypatch, ordem)
    proc = Processor(_fabrica(ordem, falha=False), redis_cliente)

    await proc.process(queue.TYPE_TRACKING, b"{}", {"round": 1, "state_code": "ac"})

    assert ordem == ["commit", "publish:progress:1"]


async def test_job_whose_commit_fails_publishes_nothing(engine, redis_cliente, monkeypatch):
    ordem: list[str] = []
    _preparar_tracking(monkeypatch, ordem)
    proc = Processor(_fabrica(ordem, falha=True), redis_cliente)

    with pytest.raises(RuntimeError, match="commit falhou"):
        await proc.process(queue.TYPE_TRACKING, b"{}", {"round": 1, "state_code": "ac"})

    assert ordem == ["commit"]
