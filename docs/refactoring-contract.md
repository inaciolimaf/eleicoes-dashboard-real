# Refactoring contract (temporary, deleted at the end of the standard migration)

Shared context for every agent applying the project standard
(`/home/inacio/.claude/skills/project-standard/`) to this repository. Read it fully before
touching code. The glossary `docs/glossary.md` is the source of every English name; its
"Decisions" section is binding.

## Rules for every agent

- Refactoring only: **no behavior change**. Product text (UI labels, error `detail`, screen URLs)
  stays in Portuguese. Environment variable names never change (fields read them by
  `validation_alias`). Makefile targets and the `tse-fake` service name never change.
- Touch only the files your brief lists. Shared files (`backend/pyproject.toml`,
  `backend/tests/conftest.py`, `Makefile`, compose files, `docs/system/*`, `CLAUDE.md`) belong
  to the main agent unless your brief gives them to you.
- Before you finish, run from `backend/`:
  `uv run ruff check . && uv run ruff format --check . && uv run python -m tools.function_size`
  (size errors are allowed only if your brief says so), `uv run mypy` (do not add errors), and the
  tests: from the repo root `make test` (Docker: Postgres + Redis in containers; takes a few
  minutes). All tests must pass.
- Use `git mv` for moves so history follows the files.
- Commit on your branch with a conventional commit in English, lowercase, ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Report: what you moved/renamed, anything you could not do, checks output (pass/fail).

## Target backend layout (package root stays `backend/app`)

```
app/
├── core/            no domain: config.py, db.py (Base, Timestamps, engine, session, unit_of_work),
│                    redis.py, security.py, deps.py (DbSession), main.py (create_app + app),
│                    models.py (imports every module's models for Alembic)
├── infra/
│   ├── tse/         TSE formats: bu.py, catalog.py, keys.py, jws.py, numbers.py, urls.py,
│   │                parsers/ (split by file kind: municipalities, results, follow_up, sections, auxiliary)
│   ├── queue/       Redis job queue (was worker/fila.py)
│   └── realtime/    hub.py, topics.py (WebSocket hub and Redis pub/sub topics)
├── modules/         layer order bottom → top:
│   ├── geography/       UF, Municipio, Zona, LocalVotacao, Secao models; geo area parsing (was services/recortes.py)
│   ├── elections/       Eleicao, EleicaoCargo, Candidato models; party colors (was services/cores.py); candidate status (was services/situacao.py)
│   ├── ballot_reports/  Boletim, ResultadoLocal models; on-demand section requests (was services/demanda.py)
│   ├── results/         ResultadoAtual, Snapshot, ProgressoAtual, ProgressoSnapshot models;
│   │                    queries (was services/resultados.py, split into subfolders), ingestion (was services/ingestao.py, split)
│   ├── events/          Evento model; event detection (was services/eventos.py)
│   ├── alerts/          Alerta model; alert evaluation (was services/alertas.py); alert routes
│   ├── accounts/        Usuario, Preferencia, Painel, Compartilhamento, Favorito; auth (CurrentUser, Admin in deps.py); routes
│   ├── public/          read-only public routes (was api/v1/publico.py), may read every module below
│   └── admin/           admin routes (was api/v1/admin.py), top
├── collector/       the collector process (entry point, like a CLI): main.py, collector/ package, fetcher.py
└── worker/          the worker process: main.py, jobs/ package
```

Each module: `__init__.py` = public interface with `__all__`; `models.py`; `routes.py`;
`schemas.py` when it has DTOs; logic in subfolders named after the subdomain (never `services/`,
`utils/`). At most 8 `.py` files per folder. A module imports another only through its
`__init__.py`. `collector/` and `worker/` may import any module's interface.
`backend/tse_fake/` stays a separate package (the fake TSE deployable) and may import `app.infra.tse`.

Tests move to `tests/unit/`, `tests/integration/` (marker `integration`), `tests/golden/`.
