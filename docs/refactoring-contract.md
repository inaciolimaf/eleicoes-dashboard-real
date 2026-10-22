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
├── modules/         layer order top → bottom: admin, public, alerts, accounts, results, events, ballot_reports, elections, geography (guaranteed by `lint-imports`)
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

## Parallel phase (one agent per slice, each in its own git worktree)

- **First step, before anything else:** your worktree may start on an older commit. From your
  worktree root run `git merge --ff-only claude/electoral-results-realtime-f6ykax` (a fast-forward,
  nothing is rewritten) and check that `docs/refactoring-contract.md` and `backend/app/modules/`
  exist. If the fast-forward fails, stop and report — do not rebase, reset or merge by hand.

- Your worktree has no `.venv` nor `node_modules`: run `cd backend && uv sync`; for the frontend
  `ln -s "/home/inacio/Área de trabalho/code/eleicoes-dashboard-real/frontend/node_modules" frontend/node_modules`.
- **Run the backend tests with your own compose project name**, otherwise agents drop each other's
  database mid-run. From your worktree root (replace `<slice>`):
  `docker compose -p eleicoes-test-<slice> -f docker-compose.test.yml run --rm --build api-test; s=$?; docker compose -p eleicoes-test-<slice> -f docker-compose.test.yml down -v; exit $s`
- Edit only the files of your slice and the tests that exercise them. `backend/pyproject.toml`,
  `backend/tests/conftest.py`, `Makefile`, compose files, `docs/system/`, `CLAUDE.md`, this file and the
  glossary belong to the main agent: write the change you need in your report instead.
- Do not change the API contract (routes, DTO fields, values, WebSocket/Redis formats) — it is fixed
  by commit e738e31. Internal names change freely inside your slice; a name exported by a module's
  `__init__.py` that other slices use stays, unless your brief says otherwise.
- mypy is strict everywhere now (no relaxed overrides): your slice must end with **zero** mypy
  errors (`uv run mypy 2>&1 | grep <your paths>`), and **zero** function/file size errors
  (30 useful lines per function, 300 per file: split by responsibility into subdomain subfolders,
  max 8 files per folder; extract named steps, never compress lines).
- Comments: module docstring only for a decision/pitfall; no separators; comments say why. Convert
  Portuguese identifiers, comments and docstrings in your slice to English (glossary names).
  Product text (UI strings, error `title`/`detail`, CSV headers for users) stays Portuguese.
