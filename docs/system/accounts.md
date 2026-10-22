# Accounts, alerts and admin

Who the visitor is and what is theirs: sign-up and sign-in (JWT), the dashboards (painéis) and
their public share links, favorites, preferences, the alerts the worker fires, and the admin
routes (collector pause and resume, health, control of the fake TSE). It came from
`specs/04-requirements.md` (RF-08 personalization, RF-09 alerts, RF-12 administration) and the
account part of `specs/11-api-contract.md`. Everything here is behind the `CurrentUser` or `Admin`
dependency, except the register, login and shared-dashboard routes.

## Where it is

| File | Role |
|---|---|
| `backend/app/modules/accounts/routes.py` | every account route (auth, dashboards, shares, favorites, preferences) |
| `backend/app/modules/accounts/schemas.py` | inputs (`*Create`, `*Update`) and responses (`*Dto`) of the account API |
| `backend/app/modules/accounts/models.py` | `User`, `Preference`, `Dashboard`, `Share`, `Favorite` |
| `backend/app/modules/accounts/deps.py` | `optional_user`, `current_user` (`CurrentUser`), `require_admin` (`Admin`) |
| `backend/app/modules/accounts/auth/credentials.py` | register and authenticate |
| `backend/app/modules/accounts/auth/tokens.py` | JWT and the response DTOs |
| `backend/app/modules/accounts/auth/login_limit.py` | failed-login limit per e-mail and per IP (Redis) |
| `backend/app/modules/accounts/dashboards/records.py`, `shares.py` | CRUD of dashboards; share links |
| `backend/app/modules/accounts/favorites/records.py`, `preferences/records.py` | favorites; preferences with defaults |
| `backend/app/modules/alerts/routes.py` | the user's alert routes |
| `backend/app/modules/alerts/models.py`, `schemas.py` | `Alert` and its DTOs (`AlertType` literal) |
| `backend/app/modules/alerts/records/user_alerts.py` | list, create, replace, delete of alerts |
| `backend/app/modules/alerts/evaluation/` | `cache.py` (live alerts), `rules.py` (conditions), `triggers.py` (mark fired) |
| `backend/app/modules/admin/routes.py` | `/admin` routes (prefix `/api/v1/admin`) |
| `backend/app/modules/admin/health/report.py` | health report: collector, worker, queue, row counts |
| `backend/app/modules/admin/fake_tse/control.py` | translates our control fields to the mock's vocabulary |
| `backend/app/modules/admin/schemas.py` | health and fake TSE DTOs |
| `backend/app/core/security.py` | `create_token`, `read_token`, password hashing (used here) |
| `backend/alembic/versions/0001_inicial.py` ... `0003_english_json_keys.py` | tables of this file (created, renamed, JSON keys rewritten) |
| `backend/tests/integration/test_users_dashboards.py` | accounts, alerts, preferences and admin, end to end |

## Data

| Table | Columns that matter | Created by | Notes |
|---|---|---|---|
| `users` | `id` (uuid), `email` (unique, 200), `name`, `password_hash`, `is_admin`, timestamps | `0001` (`usuario`), renamed in `0002` | the first registered user is admin |
| `preferences` | `user_id` (PK, FK cascade), `data` (JSONB) | `0001` (`preferencia`), `0002`, `0003` (keys) | one document per user |
| `dashboards` | `id`, `user_id` (FK cascade, indexed), `name` (120), `position`, `is_default`, `schema_version`, `config` (JSONB), timestamps | `0001` (`painel`), `0002` | `config` is stored as sent |
| `shares` | `token` (PK, 40), `dashboard_id` (FK cascade, indexed), `mode`, `frozen_time`, `created_at` | `0001` (`compartilhamento`), `0002` | no revoke route |
| `favorites` | `user_id`, `type`, `ref` (PK together), `label` (160) | `0001` (`favorito`), `0002` | |
| `alerts` | `id`, `user_id` (FK cascade, indexed), `type` (32), `params` (JSONB), `active`, `triggered_at`, timestamps | `0001` (`alerta`), `0002`, `0003` (`params` keys) | `triggered_at` set when the worker fires |

Redis: `login:failures:email:<email>` and `login:failures:ip:<ip>`, sorted sets of failure
instants; each key expires after the window. The admin collector pause is the key
`collector:paused` (set to `1`). Admin health reads `collector:metrics` and `worker:metrics` (hash).

## Routes

Prefix `/api/v1`. "Auth" is `public` (none), `user` (`CurrentUser`: `Authorization: Bearer`,
otherwise 401) or `admin` (`Admin`: user and `is_admin`, otherwise 403).

| Method and path | Auth | What it does | Errors (problem+json type) |
|---|---|---|---|
| POST `/auth/register` | public | creates the user, returns `TokenDto` (201) | `auth/email_taken` 409, `request/invalid` 422 |
| POST `/auth/login` | public | checks the password, returns `TokenDto` | `auth/invalid_credentials` 401, `auth/too_many_attempts` 429 with `Retry-After` |
| GET `/auth/me` | user | returns `UserDto` | `auth/required` 401 |
| GET `/dashboards` | user | the user's dashboards by `position`, then creation | `auth/required` |
| POST `/dashboards` | user | creates (201); `config` must have `widgets` (list) and `filtroGlobal` (object) | `request/invalid` 422 |
| GET `/dashboards/{dashboard_id}` | user | one dashboard | `dashboards/not_found` 404 (also for another user's) |
| PUT `/dashboards/{dashboard_id}` | user | replaces the whole dashboard | `dashboards/not_found`, `request/invalid` |
| DELETE `/dashboards/{dashboard_id}` | user | deletes (204) | `dashboards/not_found` |
| POST `/dashboards/{dashboard_id}/shares` | user | creates a share link, `ShareDto` with `url` `/p/<token>` | `share/frozen_time_required` 422, `dashboards/not_found` |
| GET `/shared/{token}` | public | the shared dashboard, its `mode` and `frozen_time` | `share/not_found` 404, `dashboards/not_found` 404 |
| GET `/favorites` | user | the user's favorites | |
| POST `/favorites` | user | adds, or relabels an existing `type`+`ref` (201) | `request/invalid` (type must be `candidate`, `geo_area`, `polling_place` or `section`) |
| DELETE `/favorites/{type}/{ref}` | user | removes (204); nothing to remove is also 204 | |
| GET `/preferences` | user | preferences merged over the defaults | |
| PUT `/preferences` | user | saves the sent fields, keeps the rest | `request/invalid` |
| GET `/alerts` | user | the user's alerts by creation | |
| POST `/alerts` | user | creates (201); `type` among `candidate_pct`, `lead_change`, `tally_threshold`, `elected`, `polling_place_tallied` | `request/invalid` |
| PUT `/alerts/{alert_id}` | user | replaces the alert and re-arms it (`triggered_at` cleared) | `alerts/not_found` 404 |
| DELETE `/alerts/{alert_id}` | user | deletes (204) | `alerts/not_found` 404 |
| GET `/admin/health` | admin | collector metrics, worker counters, queue size, row counts, environment | `auth/required`, `auth/admin_required` 403 |
| POST `/admin/collector/pause` | admin | sets `collector:paused` | |
| POST `/admin/collector/resume` | admin | deletes `collector:paused` | |
| GET `/admin/fake-tse` | admin | the mock's clock state, translated to our names | `admin/not_fake` 409, `admin/fake_tse_unavailable` 502 |
| POST `/admin/fake-tse` | admin | `speed`, `paused`, `restart`, `go_to` sent to the mock | `admin/not_fake` 409, `admin/fake_tse_unavailable` 502 |

Health response (`AdminHealthDto`): `collector` (`CollectorMetricsDto` or null), `worker`
(counters `ok:<type>` and `erro:<type>`), `queue`, `database` (`result_snapshots`,
`ballot_reports`, `polling_places`, `events`), `environment`.

## How it works

**Sign-up** (`credentials.register`): the e-mail is lower-cased; a taken one is 409. The password
is hashed with `hash_password`. The user is admin when the table is empty, so the first account
is the administrator. The response is `token_dto` (JWT `sub` = user id, lifetime `JWT_EXPIRA_MIN`).

**Sign-in** (`credentials.authenticate`): `LoginLimiter.check(email, ip)` runs first and raises
429 when the e-mail or the IP has `LOGIN_MAX_FAILURES` failures inside `LOGIN_WINDOW_SECONDS`.
A wrong password or an unknown e-mail records one failure in both keys and answers the same 401.
A correct password resets the e-mail counter only. The IP is `request.client.host`.

**Token to user** (`deps.py`): `optional_user` reads `Authorization: Bearer`, decodes it with
`read_token` (HS256, `JWT_SECRET`) and loads the `User`. `current_user` turns a missing user into
401; `require_admin` checks `is_admin`.

**Dashboards** (`dashboards/records.py`): every read and write goes through `owned_dashboard`
(`get_owned`), so another user's id is the same 404 as a missing one. Creating with
`is_default` clears the previous default; `position` defaults to the count of the user's
dashboards. PUT replaces name, config, default flag and schema version (position only if sent).

**Shares** (`dashboards/shares.py`): `mode` `live` or `frozen`. `frozen` needs `frozen_time`
(parsed with `parse_time`) and is stored with the share; `live` ignores it. The token is
`secrets.token_urlsafe(16)`. `get_shared` is public and returns the dashboard DTO with the mode
and frozen instant; the backend does not filter data by time, the frontend applies `frozen_time`.

**Favorites and preferences**: a favorite is keyed by `(user, type, ref)`; adding an existing one
changes its label. Preferences are one JSONB document: `get_preferences` merges it over
`DEFAULT_PREFERENCES` (`theme` escuro, `density` confortavel, `animations` true, `candidate_colors`,
`notifications`); `save_preferences` merges the top-level keys sent (`None` values are ignored).

**Alerts** (`alerts/records/user_alerts.py`): create, replace and delete call `invalidate_cache`,
which clears the worker's cache of live alerts (in the same process only, see Points of attention).

**Alert firing** (called by the worker, `worker/jobs/result.py` and `worker/jobs/ballot_box.py`):
`active_alerts` returns the alerts with `active` true and `triggered_at` null, cached for 10 s.
For each tally `evaluate_result` checks `candidate_pct` (a candidate at or above `threshold` in
the same area), `tally_threshold` (area at or above `threshold` percent of sections), and the
events of the tally: `lead_change` and `elected` (`elected` also matches `mathematically_decided`
events of the candidate). For each polling place completion `evaluate_polling_place` checks
`polling_place_tallied` with status `tallied`. A fired alert is marked by `mark_triggered`
(`triggered_at` now, cache cleared) and sent to the user's topic `user:<id>` as an alert message.
The collector also asks for the polling places of `polling_place_tallied` alerts, so their
ballot boxes are fetched (`backend/app/collector/steps/demand.py`).

**Admin** (`admin/routes.py`): all routes need `Admin`. Pause and resume only set or delete
`collector:paused`; the collector reads it. Health gathers the collector metrics, the worker hash,
the queue size (`infra/queue`) and the row counts. The fake TSE routes are allowed only when
`TSE_AMBIENTE` is `fake` (409 otherwise); they call the mock at `TSE_FAKE_CONTROLE_URL` with the
mock's own keys (`estado`, `controle`; `velocidade`, `pausado`, `reiniciar`, `ir_para`) and
translate the answer back to English names. An unreachable mock is 502.

## Rules and guarantees

- The first account is admin, the next ones are not: `backend/tests/integration/test_users_dashboards.py::test_register_login_and_first_user_is_admin`.
- A non-admin gets 403 on the admin health route: same test, and `test_admin_collector` for pause and resume.
- Dashboards: CRUD, one default, sharing: `backend/tests/integration/test_users_dashboards.py::test_dashboards_crud_default_and_sharing`.
- Favorites, alerts and preferences round trip; an unknown alert type is 422: `backend/tests/integration/test_users_dashboards.py::test_favorites_alerts_preferences`.
- Another user's dashboard is a 404, not a 403 (`get_owned`): `backend/tests/integration/test_users_dashboards.py::test_dashboards_crud_default_and_sharing`.
- The sixth attempt is blocked with 429 and `Retry-After`, even with the right password: `backend/tests/integration/test_users_dashboards.py::test_attempt_limit_blocks_the_sixth_even_with_right_password`.
- A successful login clears the e-mail counter: `backend/tests/integration/test_users_dashboards.py::test_successful_login_clears_the_email_counter`.
- The block ends with the window, with no cleanup job: `backend/tests/integration/test_users_dashboards.py::test_login_works_again_after_the_window`.
- `candidate_pct` and `tally_threshold` alerts are evaluated by the worker against a real tally: `backend/tests/integration/test_full_flow.py::test_alerts_fire_in_worker`.
- Problem+json shape for 404 and 422: `backend/tests/integration/test_users_dashboards.py::test_404_and_422_as_problem_json`.
- The production process refuses a short or example `JWT_SECRET`: `backend/tests/unit/test_settings.py::test_production_refuses_missing_short_or_example_secret`.

## Settings

| Variable (field) | Default | Used by |
|---|---|---|
| `JWT_SECRET` (`jwt_secret`) | none (required) | token signing; 32+ bytes and not the example value in production |
| `JWT_EXPIRA_MIN` (`jwt_expire_min`) | `10080` (7 days) | token lifetime |
| `LOGIN_MAX_FAILURES` (`login_max_failures`) | `5` | failures before the block, per e-mail and per IP |
| `LOGIN_WINDOW_SECONDS` (`login_window_seconds`) | `900` | failure window and block length |
| `TSE_AMBIENTE` (`tse_environment`) | `fake` | fake TSE routes allowed only when `fake` |
| `TSE_FAKE_CONTROLE_URL` (`tse_fake_control_url`) | `http://tse-fake:8080/_fake` | base URL of the mock's control |
| `REDIS_URL` (`redis_url`) | `redis://redis:6379/0` | login counters, collector pause, metrics |

## Points of attention

- **Real client IP behind the proxy.** The containers run uvicorn with `--proxy-headers
  --forwarded-allow-ips '*'` (`backend/Dockerfile`, `docker-compose.yml`). The IP used by the login
  limit is then taken from `X-Forwarded-For`, which a client can set. Anyone can bypass the per-IP
  limit; the per-e-mail limit still holds. Restrict `forwarded-allow-ips` to the proxy's address.
- **Shared IP counts together.** Five failures from one IP, for any e-mails, block that IP for the
  window, including people behind the same NAT. This is by design of `LoginLimiter`.
- **Alert cache is per process.** `invalidate_cache` clears only the cache of the process that
  calls it. The API creates or deletes an alert, the worker keeps its cached list for up to 10 s,
  so a new alert can start firing late and a deleted one can fire once more. The fired alert is
  still written with `mark_triggered`, so the damage is bounded. The docstring of `cache.py`
  ("clear the cache at once") overstates it.
- **First-user admin is not atomic.** `register` counts the users and then inserts; two first
  sign-ups at the same instant can both become admin.
- **No revoke for shares.** A share link lives until its dashboard is deleted (cascade).
- **Dashboard `config` is only shape-checked** (`widgets` list and `filtroGlobal` object). The rest
  of the JSON is not validated, which is intended (`config` is the frontend's contract).
- **Preferences `notifications` is replaced, not merged** (only the top level merges).
- **Spec names diverge.** `specs/11-api-contract.md` uses `/auth/registro`, `/paineis`,
  `/compartilhados`, `/favoritos`, `/alertas`, `/preferencias`, `/admin/saude`, `/admin/coletor/pausar`,
  `/admin/fake`, `ao_vivo|congelado`, `pct_candidato`, `virada`, `apuracao`, `eleito`, `local_apurado`.
  The code uses the glossary names listed above (`live|frozen`, `candidate_pct`, `lead_change`,
  `tally_threshold`, `elected`, `polling_place_tallied`). The spec is kept as history.
- **Section alerts are not implemented.** RF-09 asks for "a seção/local X for apurado"; only
  `polling_place_tallied` exists.
- **Admin health does not cover RF-12.** The spec asks for request rates by status code, ingestion
  delay, JWS failures and section coverage in the admin page (the collector metrics have some of
  it); the buttons to switch environment and reprocess raw files do not exist.
- **Fake TSE control has no test.** `backend/tests/unit/test_fake_tse.py` tests the mock itself;
  no test calls `/admin/fake-tse`.
- **Failed logins for unknown e-mails are counted** (the same as for real accounts), so the
  e-mail key also fills up for addresses that do not exist; this avoids telling them apart.
