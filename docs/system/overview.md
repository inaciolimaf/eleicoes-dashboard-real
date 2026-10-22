# Overview: architecture, processes, core, database, deploy

The whole system in one place: which processes exist, how the data flows between them, what the
shared `backend/app/core/` provides to every module, how the database evolved through its
migrations, and how the code is built, tested and deployed. It describes the code as it is today;
the intent behind it is in `specs/05-architecture.md` (the design), `specs/08-backend.md` and
`specs/10-docker.md` (the deploy). Domain details live in the domain files of this folder:
[collection.md](collection.md), [processing.md](processing.md), [public-api.md](public-api.md),
[accounts.md](accounts.md), [frontend.md](frontend.md). Terms: [`docs/glossary.md`](../glossary.md).

## Processes

Seven services in the compose files. The backend is one image (`backend/Dockerfile`); the services
differ only by `command`.

| Service | What it runs | Role |
|---|---|---|
| `db` | `postgres:16-alpine` | the database (all durable data) |
| `redis` | `redis:7-alpine` | the job queue collector -> worker, the realtime topics and pub/sub, the collector's shared state, metrics |
| `tse-fake` | `uvicorn tse_fake.main:app` on port 8080 | mock of the TSE dissemination site (only with `TSE_AMBIENTE=fake`); not in the Coolify compose |
| `migrate` | `alembic upgrade head`, once | local compose only; on Coolify `api` runs the migrations itself, through `backend/entrypoint-api.sh` (`MIGRAR_AO_SUBIR: "true"`) |
| `api` | `uvicorn app.core.main:app` (2 workers in both compose files) | REST routes under `/api/v1`, the WebSocket `/api/v1/ws`, `/health`, the OpenAPI docs at `/api/docs` |
| `collector` | `python -m app.collector.main` | downloads the TSE files, verifies them, puts them on the queue |
| `worker` | `python -m app.worker.main` (2 replicas locally, `worker-1` and `worker-2` on Coolify) | consumes the queue, writes the database, detects events, publishes in real time |
| `web` | the frontend built with Vite, served by nginx (`frontend/Dockerfile`) | the dashboard SPA; nginx proxies `/api/`, `/api/v1/ws` and `/health` to `api:8000` |

Only `api` (and `web`, which proxies to it) is reachable from outside. The collector and the
workers have no HTTP port.

## Data flow

```
TSE (resultados.tse.jus.br)  or  tse-fake (mock, same URL structure)
        |  HTTP, rate limit TSE_MAX_RPS, ETag / If-None-Match
        v
collector  (app/collector)  -- catalog, results, tracking, on-demand sections
        |  JWS check (Ed25519) or plain .json fallback; raw copy in DIR_BRUTOS
        |  Redis queue: queue:priority / queue:files  (zlib-compressed messages)
        v
worker     (app/worker)     -- one unit of work per message: write, detect events, publish
        |  SQL in one transaction (PostgreSQL)           Redis pub:<topic> after the commit
        v                                                 v
PostgreSQL  <--  api (app/core + app/modules)  <--  Redis pub/sub  -->  api WebSocket hub
                  REST /api/v1/...                                       /api/v1/ws
                        |                                                  |
                        +------------------ web (SPA) <--------------------+
```

- **Collector to worker**: the queue is in Redis (`app/infra/queue/__init__.py`). Two lists:
  `queue:priority` (national and state totals, tracking, municipalities open in a dashboard) is
  always drained first; `queue:files` holds the rest. A message with a key (a TSE file) keeps its
  body in the hash `queue:pending` and the list holds only a reference: a newer version of the same
  file replaces the older one. The collector stops downloading municipalities while `queue:files`
  is above `FILA_MAX` (the brake in `Collector._queue_full`).
- **Worker to clients**: a job collects its realtime messages in an `Outbox`
  (`app/worker/jobs/publishing.py`) and publishes them only after its commit, so a rolled-back
  job announces nothing. Publication is `PUBLISH pub:<topic>` (`app/infra/realtime/topics.py`).
- **API hub**: at startup `Hub` (`app/infra/realtime/hub.py`) subscribes to `pub:*` and fans each
  message out to the WebSocket connections subscribed to its topic (and to `user:<id>` topics).
  Subscriptions are registered in the sorted set `ws:topics` (score = expiry, refreshed every 15 s
  for 45 s), which tells the worker and the collector which geo areas are being watched.
- **Requests**: the REST routes read the database through the unit of work (`DbSession`, see
  below); the public routes may read Redis for the current status and metrics.

The collector and the worker never call each other; Redis and PostgreSQL are the only contracts.

## Lifecycle

**Start-up order** (enforced by `depends_on` with `condition: service_healthy`):
`db` and `redis` healthy, then the migrations (`migrate` locally; the entrypoint of `api` on Coolify),
then `api` (healthy when `/health` returns 200), then `collector`, the workers and `web`.

**api**: `create_app()` (`app/core/main.py`) builds the FastAPI app. The lifespan calls
`configure_logging()` (see [Logging](#logging)), logs `api.starting`, creates the `Hub` on
`app.state.hub`, starts its two tasks (listener and heartbeat) and stops them on shutdown. There are no other background loops in the API.

**collector**: `Collector.run()` (`app/collector/collector.py`) first waits for leadership: it
takes the Redis key `collector:leader` with `SET NX EX 30`; the leader renews it every 10 s
(`_renew_leadership`), so only one collector instance runs the loops. Then it runs four loops in parallel:
`catalogo` (`INTERVALO_CATALOGO`), `principal` (`INTERVALO_PRINCIPAL`: national, state and
municipality totals), `acompanhamento` (`INTERVALO_ACOMPANHAMENTO`: the tracking file), and
`sob_demanda` (every 3 s: the polling places and sections opened in a dashboard or watched by an
alert). The `collector:paused` key (set from the admin routes) pauses every loop.

**worker**: `app/worker/main.py` starts `WORKER_CONCORRENCIA` consumers that share one `Processor`
(`app/worker/jobs/processor.py`). Each consumer blocks on `BRPOP` of the two queues, runs the job
of the message type (`result`, `tracking`, `ballot`) and counts `ok:<type>` or `erro:<type>` in the
Redis hash `worker:metrics`. A failed job is logged and counted; it is not re-queued by the worker.

**Shutdown**: every container has `init: true` (tini forwards SIGTERM to Python) and
`stop_grace_period: 10s`. Redis runs without persistence on Coolify, so a restart starts it empty;
the database keeps what was committed.

## Core: `backend/app/core/`

The shared kernel. Every module and infra package may import `app.core`; `core` imports nothing
from the upper layers except the two aggregators named below.

### `backend/app/core/config.py`: settings

`Settings(BaseSettings)` with `env_file=".env"`, `extra="ignore"`, `frozen=True`,
`validate_by_name=True`. Each field reads its variable through `validation_alias`: the field name
follows the code (English), the variable keeps the name the server already has (never renamed).
`get_settings()` is `@lru_cache`; tests clear it. A model validator refuses to build the settings
when `ENVIRONMENT=production` and `JWT_SECRET` is shorter than 32 bytes or equals a value of
`EXAMPLE_SECRETS` (the two `troque-este-...` values of `.env.example`); it raises `SettingsError`.
A missing `JWT_SECRET` fails validation in every environment (it has no default).

| Field | Variable (read by alias) | Default | Meaning |
|---|---|---|---|
| `environment` | `ENVIRONMENT` | `local` | `local`, `production` or `test`; `production` runs the secret checks and writes JSON logs (see [Logging](#logging)); the Coolify compose sets `production` |
| `database_url` | `DATABASE_URL` | `postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes` | SQLAlchemy async URL |
| `redis_url` | `REDIS_URL` | `redis://redis:6379/0` | Redis for the queue, pub/sub, collector state |
| `tse_environment` | `TSE_AMBIENTE` | `fake` | `fake` (local mock), `simulado` or `oficial`; selects the JWS key and the `Election` rows |
| `tse_base_url` | `TSE_BASE_URL` | `http://tse-fake:8080/oficial` | base URL, environment included |
| `tse_max_rps` | `TSE_MAX_RPS` | `90.0` | requests per second the collector sends to the TSE |
| `tse_concurrency` | `TSE_CONCORRENCIA` | `16` | concurrent HTTP requests to the TSE |
| `tse_verify_jws` | `TSE_VERIFICAR_JWS` | `true` | check the Ed25519 signature of the `.jws` files |
| `tse_use_jws` | `TSE_USAR_JWS` | `true` | try the `.jws` first; when off, only the plain `.json` is read |
| `interval_catalog` | `INTERVALO_CATALOGO` | `60.0` | seconds between catalog refreshes (compose sets 30) |
| `interval_main` | `INTERVALO_PRINCIPAL` | `10.0` | seconds between primary (totals) cycles (compose sets 5) |
| `interval_follow_up` | `INTERVALO_ACOMPANHAMENTO` | `10.0` | seconds between tracking cycles (compose sets 5) |
| `interval_min_municipality` | `INTERVALO_MIN_MUNICIPIO` | `30.0` | minimum seconds between two downloads of the same municipality (compose sets 20) |
| `collect_sections` | `COLETAR_SECOES` | `true` | collect polling sections (auxiliary file and ballot box reports) |
| `section_mode` | `MODO_SECOES` | `sob_demanda` | `sob_demanda` (only sections opened or watched) or `todas` (sweeps every section: hours) |
| `collect_zones` | `COLETAR_ZONAS` | `true` | collect electoral zones (compose sets `false`: too much volume) |
| `queue_max` | `FILA_MAX` | `3000` | items in `queue:files` above which the collector stops downloading municipalities |
| `collector_municipality_workers` | `COLETOR_WORKERS_MUNICIPIO` | `8` | municipalities downloaded in parallel |
| `collector_section_workers` | `COLETOR_WORKERS_SECAO` | `16` | sections downloaded in parallel |
| `worker_concurrency` | `WORKER_CONCORRENCIA` | `4` | consumers per worker process |
| `tse_fake_kid` | `TSE_FAKE_KID` | `fake-eleicoes-dashboard` | `kid` expected in the mock's JWS |
| `tse_fake_public_key` | `TSE_FAKE_CHAVE_PUBLICA` | `""` | public key (base64url) of the mock; empty uses the deterministic key of `tse_fake/key.py` |
| `tse_fake_control_url` | `TSE_FAKE_CONTROLE_URL` | `http://tse-fake:8080/_fake` | the mock's control endpoints (speed, time) used by the admin |
| `polling_places_url` | `LOCAIS_VOTACAO_URL` | `http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv` | open-data CSV of polling places (`.csv` or `.zip`) |
| `raw_dir` | `DIR_BRUTOS` | `/data/brutos` | where the raw TSE files are kept (volume `brutos`) |
| `photo_cache_dir` | `DIR_CACHE_FOTOS` | `/data/fotos` | candidate photo cache (volume `fotos`) |
| `jwt_secret` | `JWT_SECRET` | none (required) | HS256 key of the login tokens; `SecretStr` |
| `jwt_expire_min` | `JWT_EXPIRA_MIN` | `10080` (7 days) | token lifetime in minutes |
| `cors_origins` | `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8081` | comma-separated allowed origins (the compose files set them explicitly) |
| `log_level` | `LOG_LEVEL` | `INFO` | level of every log, structlog and stdlib alike |
| `login_max_failures` | `LOGIN_MAX_FAILURES` | `5` | failed logins allowed per e-mail and per IP within the window |
| `login_window_seconds` | `LOGIN_WINDOW_SECONDS` | `900` | length of the failed-login window |

Tests that load the settings must list the real variable names (aliases included); see
`backend/tests/unit/test_settings.py::test_fields_read_the_server_variables`. Secrets are never
given a default in code. `.env.example` is the template of local values (copied to `.env` by
`make env`).

### `backend/app/core/db.py`: engine, unit of work, ownership

- `Base` (declarative, with the `NAMING_CONVENTION` that names every constraint from its table and
  columns, so the migrations are stable) and the `Timestamps` mixin (`created_at`, `updated_at`,
  both `timestamptz` with `now()`).
- `get_engine()` builds one async engine (pool 10 + 20 overflow, `pool_pre_ping`) and the
  `async_sessionmaker` with `expire_on_commit=False`. `configure_engine()` swaps it (tests).
- `unit_of_work(factory=None)`: one session and one transaction; commits on a clean exit, rolls
  back and re-raises otherwise. Background tasks and the CLI use it; the worker and the tests pass
  their own `factory`.
- `get_session(factory)`: the request's unit of work, built on `unit_of_work`. Routes do not call
  `commit()`; `tests/unit/test_architecture.py::test_only_the_unit_of_work_commits` enforces it.
- `get_owned(session, model, key, user, what)`: loads a record by id and checks `user_id`. A
  missing record and another user's record give the same 404 (`<table>/not_found`). It is the only
  way a route loads a user's record by id.

### `backend/app/core/deps.py`: request dependencies

- `DbSession = Annotated[AsyncSession, Depends(get_session, scope="function")]`. The
  `scope="function"` matters: with the default scope the code after a dependency's `yield` runs
  after the response has left, so a failing commit would reach the client as 200. With it the
  commit runs before the response and a failure is a 500.
- `parse_time(value, name)`: an ISO 8601 query parameter (`Z` accepted, naive means UTC); empty
  means `None` (live); an invalid value raises `AppError` 422 `query/invalid_time`.

### `backend/app/core/errors.py`: problem+json

One error format: `application/problem+json` (RFC 9457). `AppError(status_code, title, detail,
type, extras, headers)` is the domain error: `detail` must not be empty (a `ValueError` otherwise),
`type` must match `domain/reason` in lowercase. `title` and `detail` are product text in
Portuguese; `type` is the English code. `problem(...)` builds the response. One handler
(`handle_error`, installed by `install_error_handlers`) covers `AppError`,
`StarletteHTTPException` (so FastAPI's own 404 and 405 too) and `RequestValidationError` (422 with
an `errors` list of `loc`, `msg`, `type`). Any other exception is a 500 from FastAPI's default
handling. Extra headers of an error (for example `Retry-After` on a 429) go in `AppError.headers`.

### `backend/app/core/health/`: `/health`

`backend/app/core/health/probes.py` mounts `GET /health` at the root (outside `/api/v1`). It checks
the database (`select 1`) and Redis (`PING`) in parallel, each with a 2 s timeout. Body:
`{"status": "ok"|"degraded", "database": "up"|"down", "redis": "up"|"down"}`. HTTP 200 when both
are up, 503 otherwise. It does not look at the data (see Points of attention).

### `backend/app/core/redis.py`

`create_redis(url)` builds a `BlockingConnectionPool` (64 connections, waits up to 30 s for one,
socket and health-check settings), so tasks wait for a connection instead of failing.
`get_redis()` is the process singleton; `configure_redis()` swaps it (tests).

### `backend/app/core/security.py`

Password hashing with argon2 (`hash_password`, `verify_password`; a bad hash is `False`, never an
exception). Login tokens: `create_token(user_id)` is an HS256 JWT with `sub`, `iat`, `exp`
(`JWT_EXPIRA_MIN`) signed with `JWT_SECRET`; `read_token(token)` returns the `sub` or `None` for any
invalid token. Tokens travel in the `Authorization: Bearer` header (`modules/accounts/deps.py`);
the backend sets no cookies.

### `backend/app/core/main.py`: the application

`create_app()` (a factory: tests and `tools/openapi.py` use it) sets the title, `ORJSONResponse` as
default response, the docs at `/api/docs` and `/api/openapi.json`, then:

- `GZipMiddleware` (from 1 KB);
- `CORSMiddleware` with `CORS_ORIGINS`, credentials allowed, all methods and headers;
- `install_error_handlers(app)`;
- routers of `public`, `accounts`, `alerts`, `admin` and the WebSocket router of `public`, each
  under `/api/v1`; the `health` router at the root;
- `RequestIdMiddleware` last, so it is the outermost: a pure ASGI middleware (HTTP and WebSocket)
  that sets the `x-request-id` header and the log context. Its code and rules are in
  [Logging](#logging).

`app = create_app()` is the module-level object uvicorn loads (`app.core.main:app`). The lifespan
is described under Lifecycle.

### `backend/app/core/models.py`: the metadata aggregator

Imports the models of every module (`accounts`, `alerts`, `ballot_reports`, `elections`, `events`,
`geography`, `results`) so `Base.metadata` is complete for Alembic (`alembic/env.py`) and for the
migration test. Nothing else is defined here. The import is one of the allowed exceptions of the
layer contract (see below).

## Infra: `backend/app/infra/`

Adapters to the outside world, with no business rules. One line each; the details are in the
domain files.

- `backend/app/infra/queue/`: the collector-to-worker Redis queue (priority list, file list,
  pending hash, zlib messages). See [collection.md](collection.md) and [processing.md](processing.md).
- `backend/app/infra/realtime/`: `topics.py` (topic names, `ws:topics` registry, `publish`) and
  `hub.py` (WebSocket connections, Redis pub/sub listener, fan-out).
- `backend/app/infra/tse/`: the TSE formats. `urls.py` builds the dissemination URLs from the
  catalog's templates; `jws.py` verifies the compact Ed25519 JWS; `keys.py` gives the public key
  per environment; `catalog.py` parses the election catalog (`ele-c`); `ballot_box.py` decodes the
  ballot box report (BU, ASN.1 with `asn1/bu.asn1`); `numbers.py` converts the TSE number, date and
  decimal-comma formats; `parsers/` has one module per file kind (`municipalities`, `sections`,
  `results`, `tracking`, `auxiliary`, shared `common`).

## Module layers and import contracts

`backend/pyproject.toml` declares two `import-linter` contracts (`make boundaries`, in CI):

1. **layers: processes -> modules -> infra -> core.** `app.collector | app.worker` may import the
   modules, infra and core; `app.modules` may import infra and core; `app.infra` may import core;
   `app.core` imports none of them, apart from the aggregators named below. Three exceptions are listed as `ignore_imports`:
   `app.core.main -> app.modules.**` and `app.core.main -> app.infra.**` (the aggregator of routers
   and of the realtime hub), and `app.core.models -> app.modules.**` (the aggregator of models).
2. **modules: lower modules never import upper ones.** Inside `app.modules` the packages are
   layered from the top: `admin`, `public`, `alerts`, `accounts`, `results`, `events`,
   `ballot_reports`, `elections`, `geography`. A module imports the ones below it; `accounts` sits
   above the others only for its `CurrentUser` and `Admin` dependencies, which the modules above
   it use. Other modules are reached through their package (`app.modules.<name>`), never through
   a submodule of another module; the architecture test enforces that too.

The other rules that the tooling enforces (`[tool.function-size]`, `[tool.ruff]`,
`[tool.mypy] strict`) are in `backend/pyproject.toml`: functions of at most 30 lines and files of
at most 300 lines (`tools/function_size.py`), strict mypy over `app`, `tse_fake` and `tools`,
ruff with `ANN`, `S`, `B`, `RUF` and others, and line length 110.

## Database

PostgreSQL 16 with the extensions `pg_trgm` and `unaccent` (created by migration `0001`) for
accent-insensitive and trigram search. The schema is created by the migrations only (no
`create_all`); the test `backend/tests/integration/test_migrations.py::test_migrations_go_up_down_and_match_models`
checks that `upgrade head` and `downgrade base` both work and that the result matches the models.

Tables (English names, as of migration `0004`):

| Table | Module (model) | Holds |
|---|---|---|
| `states`, `municipalities`, `electoral_zones`, `polling_places`, `polling_sections` | geography | reference geography: UFs (seeded by `0001`), municipalities with IBGE codes, zones, polling places (with coordinates), sections |
| `elections`, `election_offices`, `candidates` | elections | the election catalog, the offices (`office_code`) and the candidates |
| `result_snapshots`, `current_results`, `progress_snapshots`, `current_progress` | results | the tally of each geo area and office over time (snapshots) and its latest value (current) |
| `ballot_box_reports`, `polling_place_results` | ballot_reports | the ballot box reports (BU) and the polling place tallies |
| `events` | events | detected events (lead change, elected, milestone) with a JSON `payload` |
| `alerts` | alerts | user alerts with JSON `params` |
| `users`, `preferences`, `dashboards`, `shares`, `favorites` | accounts | accounts, per-user preferences (JSON `data`), dashboards (JSON `config`), shared links, favorites |

The model of each table lives in the module's `models.py` (`__tablename__`). The per-table columns
are described in the domain files.

### Migrations (`backend/alembic/versions/`)

Run in order; `head` is `0004`. `alembic/env.py` loads `app.core.models` so autogenerate sees every
model. The migrations never drop and recreate data: renames preserve rows.

| Revision | File | What it does |
|---|---|---|
| `0001` | `backend/alembic/versions/0001_inicial.py` | first schema, still with Portuguese names: creates the extensions `pg_trgm` and `unaccent`, the 21 tables (`uf`, `municipio`, `zona`, `local_votacao`, `secao`, `eleicao`, `eleicao_cargo`, `candidato`, `resultado_local`, `boletim_urna`, `resultado_atual`, `snapshot_resultado`, `progresso_atual`, `snapshot_progresso`, `evento`, `usuario`, `painel`, `preferencia`, `compartilhamento`, `favorito`, `alerta`), their indexes, the trigram GIN indexes on `municipio`, `local_votacao` and `candidato` names, and seeds the states (UFs) |
| `0002` | `backend/alembic/versions/0002_english_names.py` | renames, in place, the 21 tables (`usuario` -> `users`, `painel` -> `dashboards`, `boletim_urna` -> `ballot_box_reports`, `resultado_local` -> `polling_place_results`, `uf` -> `states`, `secao` -> `polling_sections`, and so on), their columns, constraints, indexes and the two `id` sequences; widens `level` from 10 to 16 characters in five tables; converts the stored values (`br`/`uf`/`municipio`/`zona`/`local`/`secao` -> `country`/`state`/`municipality`/`zone`/`polling_place`/`section`, and `shares.mode` `ao_vivo`/`congelado` -> `live`/`frozen`, and the stored values of other columns, such as `candidates`). The downgrade reverses every step |
| `0003` | `backend/alembic/versions/0003_english_json_keys.py` | rewrites the keys of the user's JSON: `alerts.params` (`cargo` -> `office_code`, `nivel` -> `level` with the level values, `id` -> `geo_area_id`, `sqcand` -> `tse_candidate_id`, `limite` -> `threshold`, `local_id` -> `polling_place_id`) and `preferences.data` (`tema` -> `theme`, `densidade` -> `density`, `animacoes` -> `animations`, `cores_candidatos` -> `candidate_colors`, `notificacoes` -> `notifications` with `virada`/`eleito`/`marco` -> `lead_change`/`elected`/`milestone`). `dashboards.config` is deliberately not rewritten: it is shared by link |
| `0004` | `backend/alembic/versions/0004_event_payload_keys.py` | rewrites the keys of `events.payload` (`sqcand` -> `tse_candidate_id`, `marco` -> `milestone`, `novo_lider` -> `new_leader`, `lider_anterior` -> `previous_leader`); the feed and the alert rules already read the English keys |

Tests: `backend/tests/integration/test_migrations.py::test_0002_keeps_data_and_converts_values_both_ways`
and `::test_0003_renames_alert_and_preference_keys` load data at each revision and check that it
survives the upgrade and the downgrade.

### Running migrations

- Locally, the `migrate` service runs `alembic upgrade head` once; `api`, `collector` and `worker`
  start after it completes. `make migrate` runs it again; `make revision m="..."` creates an
  autogenerate revision in `backend/alembic/versions/`.
- On Coolify, the `api` service sets `MIGRAR_AO_SUBIR: "true"` and its `command` is plain `uvicorn`:
  `backend/entrypoint-api.sh` runs `alembic upgrade head` first, then `exec`s the command. The
  other services wait for `api` to be healthy. No `alembic` runs inline in any command.
- The same entrypoint is the only place that reads `MIGRAR_AO_SUBIR` (not a `Settings` field); it
  is `false` when unset, so the local `api` does not migrate on start.

### Redis keys

| Key | Type | Written by | Read by | Meaning |
|---|---|---|---|---|
| `queue:priority`, `queue:files` | list | collector (`queue.enqueue`) | worker (`queue.dequeue`, BRPOP) | the job queue; priority first |
| `queue:pending` | hash | collector | worker (Lua take) | body of a keyed message (a TSE file), replaced by newer versions |
| `ws:topics` | sorted set | API hub (heartbeat, subscribe) | collector, worker | topics watched, score = expiry |
| `pub:<topic>` | pub/sub channel | worker (`topics.publish`) | API hub (`psubscribe pub:*`) | realtime messages |
| `collector:leader` | string, TTL 30 s | collector | collector | the leader instance |
| `collector:paused` | string | admin routes | collector | pauses every loop |
| `collector:metrics`, `collector:last_collection` | string, TTL 60 s / 3600 s | collector | admin, public status | metrics and last collection time |
| `worker:metrics` | hash | worker (`ok:<type>`, `erro:<type>`) | admin health report | processed and failed messages |
| `sections:demand` | sorted set (score = expiry) | public demand route (`modules/public/demand/section_request.py` via `ballot_reports/demand/registry.py`) | collector (`sob_demanda`) | polling places and sections requested on demand |

## Logging

`backend/app/core/log/` (`configure_logging(settings)`, in `configure.py`) configures structlog and the root logger. It is a package, not a module, because `app/core` may hold at most 8 Python files (`test_architecture.py`).
It is called by the API lifespan (`backend/app/core/main.py`), by `backend/app/collector/main.py`
and by `backend/app/worker/main.py`, at the level `LOG_LEVEL`.

- **Renderer, by `ENVIRONMENT`.** `production`: `JSONRenderer`, one object per line, with `event`,
  `level`, `logger`, `timestamp` (ISO 8601, UTC) and the bound fields; an exception becomes an
  `exception` string. Any other value: `ConsoleRenderer`, for reading in a terminal.
- **Stdlib too.** `logging.getLogger(...)` calls (the collector's, `httpx`, uvicorn's loggers) go
  through the same processors through a `ProcessorFormatter`, so they come out in the same format
  and no call has to change. uvicorn's `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers
  are routed to the root once the lifespan runs; the lines uvicorn prints before it (the start-up
  banner) keep uvicorn's own format.
- **Request id.** `RequestIdMiddleware` (`backend/app/core/main.py`) takes the caller's
  `x-request-id` when it has 1 to 128 characters of `A-Za-z0-9._-`, and generates a 32-character hex
  id otherwise, so a caller cannot put arbitrary text in the logs. The id goes back in the
  `x-request-id` response header (also the WebSocket handshake). The middleware binds `request_id`,
  `route` (the route template, such as `/api/v1/...{id}`; `unmatched` for a path with no route) and
  `method` to the context, so every line written while the request runs carries them. It is
  cleared when the request ends.
- **Event names.** `domain.action` with named fields, not sentences: `api.starting`
  (`environment`), `worker.started` (`consumers`), `worker.queue_read_failed` and `worker.job_failed`
  (`consumer`, `type`, `source`, `error`, the error text cut to 300 characters). The other log
  calls (the collector's `falha no laço ...`, `falha no município`, `falha na seção`; the
  processor's messages; `hub.py`) keep their Portuguese text: they were not rewritten.
- `httpx` is set to `WARNING` in the collector.

## Tests

`backend/tests/`:

- `conftest.py`: sets the environment before the app is imported (`TEST_DATABASE_URL`,
  `TEST_REDIS_URL`, `TSE_AMBIENTE=fake`, `JWT_SECRET`, `DIR_BRUTOS` and `DIR_CACHE_FOTOS` under
  `/tmp`), downgrades and upgrades the schema once per session (`migrated_db`), configures the
  engine and Redis with the test ones, and provides the fixtures `engine`, `redis_cliente`,
  `clean_db` (truncates the table list and flushes Redis), and `session`.
- `unit/`: no database, except that the session fixture of `conftest.py` migrates it (so the unit
  tests run inside `make test`). `test_logging.py` covers the request id (generated, echoed,
  replaced when unsafe), the JSON lines of production, the request context on structlog and stdlib
  records, and the console output elsewhere. `test_architecture.py` is the structural guard: it walks the `ast` of
  `app/` and fails on any `commit()` outside `app/core/db.py`
  (`::test_only_the_unit_of_work_commits`), on SQL strings outside the query builder
  (`::test_sql_is_built_with_the_query_builder`, `ALLOWED_SQL` is empty), on a folder with more
  than 8 `.py` files (`::test_each_folder_holds_at_most_eight_python_files`), and on imports between
  modules that skip the package (`::test_modules_import_each_other_through_their_package`).
  `test_settings.py` covers the settings rules; the other unit files cover the TSE formats, the JWS,
  the collector's HTTP client and the fake TSE.
- `integration/`: needs PostgreSQL and Redis. Migrations, the queue, the realtime hub and
  WebSocket, the publication after the commit, and the users and dashboards.
- Markers in `backend/pyproject.toml`: `integration` (needs the database) and `golden`.
  `make test-unit` runs `-m "not integration"`.

Commands: `make test` (`docker-compose.test.yml`: runs `ruff check`, `ruff format --check` and
`pytest` with `--cov=app`, which must reach 85 %); `make lint` (ruff, format, function size, import
contracts, and that each compose file parses: `docker-compose.yml`, `docker-compose.test.yml`,
`docker-compose.coolify.yml`); `make types` (mypy strict); `make docs` (documentation coverage, below).
CI (`.github/workflows/ci.yml`) runs the backend lint, the docs check, mypy and pytest against a
PostgreSQL 16 and Redis 7 service, then checks that the frontend types generated from the OpenAPI
are up to date.

## Documentation guarantee

`backend/tools/docs_coverage.py` (`make docs`, CI) reads `[tool.docs-coverage]` in
`backend/pyproject.toml`. DOC001: every path of `require` (core modules, core packages, infra
packages, modules, collector, worker, `tse_fake`, migrations, frontend routes and modules) must be
cited in backticks in some file of `docs/system/`. DOC002: every repository path cited in
backticks must exist, and every `tests/x.py::name` must point to a real `def name`.

## Compose files and Dockerfiles

| File | Use | Notes |
|---|---|---|
| `docker-compose.yml` | the full system, locally, against the TSE mock | `name: eleicoes`; `env_file: [.env]`; ports `5432`, `8089` (mock), `8000` (api), `8080` (web); `migrate` service; `worker` with 2 replicas; `redis` with `--appendonly yes` and the volume `redisdata`; the database password is `eleicoes` (local only) |
| `docker-compose.dev.yml` | development, on top of the file above | mounts `./backend` (uvicorn `--reload`) and `./frontend` (Vite dev server on `5173`, `Dockerfile.dev`, `VITE_API_PROXY=http://api:8000`) |
| `docker-compose.override.yml` | alternative host ports (`25432`, `28000`, `28089`, `28080`) | uses the `!override` tag, so it needs a Compose v2 release that supports it; for a machine where the default ports are busy |
| `docker-compose.test.yml` | the backend test suite | `name: eleicoes-test`; `db-test` on `tmpfs`, `redis-test`; the `api-test` service builds the `test` target of `backend/Dockerfile`; runs the lint and pytest commands with `ENVIRONMENT=test` |
| `docker-compose.coolify.yml` | production on Coolify, against the real TSE | no host ports, no `.env`; `ENVIRONMENT: production` in the `x-backend` anchor; `MIGRAR_AO_SUBIR: "true"` on `api`; `db` takes `PG_SHARED_BUFFERS` (default `256MB`); secrets generated by Coolify; see [`docs/deploy-coolify.md`](../deploy-coolify.md) |

`backend/Dockerfile` (`python:3.12-slim`, uv): stages `base`, `deps` (locked dependencies without
the project, cached until `uv.lock` changes), `deps-dev`, `runtime` (copies `app/`, `tse_fake/`,
`tools/`, `alembic/`, `alembic.ini`, the entrypoint; runs as user `app`; `EXPOSE 8000`;
`ENTRYPOINT entrypoint-api`; `CMD` is uvicorn with `--proxy-headers --forwarded-allow-ips *`)
and `test` (adds `tests/` and the dev tools; `CMD pytest -q`). The same image serves `api`,
`collector`, `worker`, `migrate` and `tse-fake`; only the `command` differs.

`backend/entrypoint-api.sh`: runs `alembic upgrade head` when `MIGRAR_AO_SUBIR` is `true` (set on
`api` in the Coolify compose), then `exec "$@"`.

`frontend/Dockerfile`: stage `build` (`node:22-alpine`, the same major as CI, `npm ci`,
`npm run build`), stage `runtime`
(`nginx:alpine`, the built `dist` in `/usr/share/nginx/html`, `frontend/nginx.conf` as the
default site, an image healthcheck with `wget`).

`frontend/nginx.conf`: port 80; `resolver 127.0.0.11` and `set $api_upstream http://api:8000`
so the API's container can change address; WebSocket upgrade on `/api/v1/ws` (read timeout 3600 s);
`/health` and `/api/` proxied to the API with `X-Forwarded-*` headers; `/assets/` cached for a
year (hashed files); `/geo/` cached for 7 days; everything else is the SPA fallback to
`index.html` with `no-cache`. Gzip is on for the JSON, JS, CSS and GeoJSON types.

## Points of attention

Divergences between the code and the specs, and pitfalls. The specs are not rewritten; these are
the places where the code is the truth.

- **`/health` does not report the data.** The project standard asks for the state of the data
  (missing optional data as `missing`, not as a failure); the specs do not fix it. `probes.py` reports only the database and Redis, and answers 503 when either
  is down.
- **No recovery of interrupted work at start-up.** The project standard asks for tasks left
  "running" by a dead process to be marked as errors at start-up; the lifespan does not do it. The queue and the collector's state are rebuilt by the loops instead (the
  queue is in Redis without persistence on Coolify; the database keeps what was committed).
- **Default `CORS_ORIGINS` differs from `.env.example`.** The code defaults to ports `5173` and
  `8081`; `.env.example` and the local compose use `8080`. The compose files always set it.
- **The first account is the administrator, and registration is open.** `accounts/auth/credentials.py`
  sets `is_admin` on the first user ever created, and `POST /api/v1/auth/register` is public. On a
  new deploy whoever registers first becomes admin; there is no seed or CLI to create one.
- **The JWS public keys are unconfirmed.** `backend/app/infra/tse/keys.py` says "CONFIRM against the
  official manual": the `simulado` and `oficial` keys were transcribed from a third-party project.
  With `TSE_VERIFICAR_JWS=true` a key mismatch falls back to the plain `.json` without the verified
  mark (`backend/app/collector/steps/request.py`), so a wrong key degrades silently instead of
  stopping the collection.
- **Redis without persistence on Coolify.** `maxmemory 1500mb` with `noeviction`: when full, Redis
  refuses writes and the calls fail with an error that the loops log. The queue is not durable
  across a Redis restart by design.
- **The `tse-fake` default speed differs.** `tse_fake/main.py` reads `FAKE_VELOCIDADE` with a default
  of `10`; `.env.example` sets `5`. The `.env` value wins in the local compose.
- **`docker-compose.coolify.yml` duplicates `init` and `stop_grace_period`** in the `x-backend`
  anchor and in each service. It is harmless; the anchor's values apply everywhere.
