# CLAUDE.md — Election dashboard

Real-time dashboard of the Brazilian election night: a collector reads the TSE's public files
(JSON signed with JWS, ballot box reports), a worker ingests them into Postgres and publishes
changes over Redis, the API serves results and a WebSocket, and the React frontend shows maps,
scoreboards and user dashboards. Design principle: **every number shown traces back to a TSE file**
(the raw file is archived, its JWS verified when possible, and each result keeps its generation id).

This project follows the **`project-standard`** skill (`~/.claude/skills/project-standard/`).
A change to the standard (lint, tests, docker, CI, documentation) applies in both places: here and
in the skill.

## Documentation — read first, update together

- **`docs/system/`** explains the system as it is: one file per domain, index in
  `docs/system/README.md`. Before touching a domain, read its file.
- **Every change to the system updates the documentation in the same commit**: route, table,
  flow, rule, environment variable, new, removed or renamed file → the domain's file. New domain
  → new file + a line in the index.
- **Keep the `.md` files tidy**: when passing through a documentation file (including this
  `CLAUDE.md`, the `README.md` and the specs), fix what is outdated, duplicated or confusing,
  even if it is not part of the task.
- **This `CLAUDE.md` updates too**: new command, new convention, discovered pitfall, structure
  change → it goes here in the same commit.
- `specs/` is what was asked and why (in Portuguese, kept as history); divergence from the code is
  recorded in `docs/system/` under "Points of attention".
- Guarantee: `make docs` (in CI).

## Language

- **The code is all in English**: identifiers, file and folder names, database tables and
  columns, API routes and fields, error types, comments, docstrings, documentation (`docs/`,
  this file, README) and commit messages.
- **Only what a person reads in the product stays in Portuguese**: interface text, error messages
  (`title`/`detail` of the problem+json), CSV headers, the screen URLs (`/mapas`, `/paineis`,
  `/explorar/uf/sp`), and external data formats (the TSE's JSON keys, file names and URLs, which
  the fake TSE imitates).
- **Every domain name comes from `docs/glossary.md`** (term in Portuguese → name in code). A new
  term enters the glossary in the same commit that introduces it.
- **Data saved by users keeps its format**: the dashboard config JSON (`filtroGlobal`, `herda`,
  `nivelFilhos`, widget type ids...), localStorage keys and values, shared links' query params.
- **Never renamed**: environment variables configured on a server (the settings field has an
  English name and reads the variable by alias, `Field(validation_alias="TSE_AMBIENTE")`; a new
  variable comes with a safe default or with a notice listing what to configure), Makefile targets
  (`make fake-velocidade`, `make up-oficial`...), the `tse-fake` service, past commits.

## Where things are

```
backend/            FastAPI + collector + worker (Python 3.12, uv)
  app/core/         settings, db + unit of work, errors, health, logging, security, main (create_app)
  app/infra/        tse/ (TSE formats, JWS, ballot box), queue/ (Redis job queue), realtime/ (WS hub)
  app/modules/      domains, layer order top → bottom: admin, public, alerts, accounts, results,
                    events, ballot_reports, elections, geography (public interface in __init__.py)
  app/collector/    the collector process (python -m app.collector.main)
  app/worker/       the worker process (python -m app.worker.main)
  tse_fake/         the fake TSE (a separate deployable used locally and in tests)
  alembic/          migrations (versions/NNNN_name.py)
  tests/            unit/, integration/ (marker integration: Postgres + Redis)
  tools/            function_size.py, docs_coverage.py, openapi.py
frontend/           React 18 + Vite + TS strict + Mantine + react-router + TanStack Query
  src/api/          client.ts (single fetch, readProblem), types.ts (GENERATED), models.ts
  src/routes/       one thin file per screen
  src/modules/      domains: results, charts, maps, dashboards, events, alerts, accounts,
                    polling-places, sections, admin, realtime, shell (index.ts = public interface)
  src/components/   shared UI; src/lib/ cross-cutting (formatting.ts, palettes*, stores)
  tests/            Vitest (helpers/screen.tsx: renderScreen + fakeApi); e2e/ Playwright
docs/system/        how the system works today; docs/glossary.md; docs/deploy-coolify.md
specs/              what was asked (NN-name.md)
docker-compose*.yml local, dev, test and Coolify (production)
```

## Commands

`make` with no target lists everything.

| Command | Does |
|---|---|
| `make up` / `make dev` | whole system against the fake TSE (8080) / with reload and Vite (5173) |
| `make lint` | ruff + format check + function/file size + import boundaries + compose files parse |
| `make format` / `make web-format` | ruff format / prettier |
| `make types` | strict mypy (zero errors) |
| `make docs` | `docs/system/` covers every module and screen and cites no vanished path |
| `make test` | backend suite in containers (Postgres + Redis), coverage ≥ 85% |
| `make test-unit` | backend unit tests, no infrastructure |
| `make web-test` | eslint + prettier check + tsc + vitest |
| `make web-coverage` | vitest with coverage, fails below 60% |
| `make web-types` | regenerate `frontend/src/api/types.ts` from the backend OpenAPI |
| `make e2e` / `make mobile` / `make e2e-flows` | Playwright on the production build (needs the API) |

One area's backend tests: `cd backend && uv run pytest tests/unit/test_<x>.py`; with the database,
`make test` (or `TEST_DATABASE_URL`/`TEST_REDIS_URL` pointing at a Postgres/Redis of your own).

## Local environment

- `docker-compose.override.yml` (versioned, loaded automatically by `docker compose`) moves the
  published ports so they do not clash with other projects on this machine: Postgres 25432, API
  28000, web 28080, fake TSE 28089. Without it (`-f docker-compose.yml`, as CI does): 5432, 8000,
  8080, 8089. Other projects here use 5432/5433 (`crivo-db-1`, `resumeai-db`): never stop their
  containers; for an isolated run use another compose project name (`docker compose -p <name>`).
- E2E locally: start an isolated stack, then
  `cd frontend && API_URL=http://localhost:28000 E2E_EMAIL=... E2E_SENHA=... npx playwright test`.
  The login attempt limit counts every wrong login; the flows use an unknown e-mail for the
  wrong-password case so reruns do not lock the e2e account.
- The test compose (`docker-compose.test.yml`) publishes no ports; parallel runs need different
  `-p` names, otherwise one run drops the other's database.
- `.env` (copied from `.env.example`) is the local configuration; tests never read it.

## Code rules

**Lint and types** (all blocking in CI): ruff with the standard's rule set and `line-length = 110`,
`ruff format`, strict mypy, at most 30 useful lines per function and 300 per file
(`backend/tools/function_size.py`), import-linter contracts in `backend/pyproject.toml`; frontend
eslint (exhaustive-deps as error, 100-line functions, 300-line files, reuse rules: hex colors only
in `src/lib/palettes*.ts`/`src/theme.ts`, numbers formatted only in `src/lib/formatting.ts`, module
boundaries through `index.ts`), prettier (`printWidth` 110), `tsc` strict. Details:
`~/.claude/skills/project-standard/references/lint-and-types.md`. Every exception carries its reason.

**Backend**: routers only do HTTP (no queries); the session dependency is the unit of work (only
`backend/app/core/db.py` commits — guaranteed by `backend/tests/unit/test_architecture.py`); a
user's record is loaded with `get_owned`; errors are `AppError` → `application/problem+json` with a
non-empty Portuguese `detail` and an English `domain/reason` type; SQL only through SQLAlchemy's
builder; a module imports another only through its `__init__`; a side effect the worker publishes
over Redis goes out only after the commit; every response has a DTO in the module's `schemas.py`.

**Frontend**: one `fetch` in `src/api/client.ts`; API types are generated (`make web-types`, CI
fails on a diff); a module imports another only through its `index.ts`; screens work at 390 px.

## Tests

- Backend: unit tests run without infrastructure; integration tests (`backend/tests/integration/`)
  use Postgres + Redis and migrations run both ways on every suite. The fake TSE drives the full
  flow test (`backend/tests/integration/test_full_flow.py`).
- Frontend: pure `lib/` fully, components, and **every screen with logic has a screen test**
  (`renderScreen("/url")` + `fakeApi({"GET /path": ...})`); fake timers, never real waits.
- E2E: Playwright projects `routes`, `mobile` and `flows`; `frontend/tests/e2e-routes-list.test.ts`
  fails when a route of the router is missing from `frontend/e2e/helpers.ts`.
- **A bug fix comes with a test that reproduces it.** A new screen is born with a test and an e2e
  route.

## Workflow

1. Read the domain's `docs/system/` file.
2. Change + test + documentation (+ glossary if there is a new term).
3. Run only what you touched: `make lint types docs` + the area's tests (`make web-test` for the
   frontend).
4. Commit on `claude/electoral-results-realtime-f6ykax`; conventional commit in English describing
   the behavior (`fix(collector): ...`). Stage explicit paths: other sessions may have work in
   progress in the same checkout.

**Large change** (more than ~15 files or more than one area): subagents in parallel by disjoint
files (worktrees when they edit existing code); the main agent integrates and verifies.

## Deploy

Coolify, Docker Compose build pack with `docker-compose.coolify.yml`: step by step in
`docs/deploy-coolify.md`. The file sets every variable itself (secrets come from Coolify's
`SERVICE_PASSWORD_*`), runs in `ENVIRONMENT=production` and migrates on start.
