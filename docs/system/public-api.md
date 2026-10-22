# Public API

The read side of the system: everything an anonymous visitor (or the frontend) calls to see the
count. Results of a level, children tables, the progress of the count, polling places and
sections, candidates and their photos, search, events, timeline, exports, and the WebSocket that
pushes changes. It came from `specs/11-api-contract.md`, whose Portuguese paths and field names
were renamed to English by the glossary (see Points of attention). Authentication is only needed by
the account routes (`accounts.md`).

## Where it is

| File | Role |
|---|---|
| `backend/app/modules/public/routes.py` | every public HTTP route (HTTP only, delegates to the subdomains) |
| `backend/app/modules/public/schemas.py` | shared DTOs: status, elections, geo areas, events, search, timeline, filters |
| `backend/app/modules/public/deps.py` | `TimeDep`: the `at` query parameter (instant, empty = live) |
| `backend/app/modules/public/results/dtos.py` | results, series, children, progress DTOs |
| `backend/app/modules/public/candidates/` | `dtos.py` (list, detail), `photo.py` (cached TSE photo) |
| `backend/app/modules/public/polling_places/dtos.py` | polling place, section, map marker and diagnostics DTOs |
| `backend/app/modules/public/diagnostics/polling_place.py` | why a polling place's sections do not show |
| `backend/app/modules/public/demand/section_request.py` | opening a place or section asks the collector for its ballot boxes |
| `backend/app/modules/public/status/current.py`, `metrics.py` | `/status` and the Redis metrics reader |
| `backend/app/modules/public/exports/download.py`, `rows.py` | CSV and JSON files of results and children |
| `backend/app/modules/public/realtime/websocket.py` | `/ws` endpoint (protocol below); the hub is `backend/app/infra/realtime/` |
| `backend/app/modules/results/queries/` | read queries behind the routes (the subpackages are listed below) |
| `backend/app/modules/results/queries/__init__.py` | the names the routes and the worker import |
| `backend/tests/integration/test_full_flow.py`, `backend/tests/integration/test_realtime.py` | end to end API and WebSocket tests |

## Data

Read only. The public API never writes, except the on-demand request (a Redis signal) and the
photo cache (a file).

| Table (migration) | Read by |
|---|---|
| `elections`, `election_offices` (`0001`, renamed in `0002`) | `/elections`, `/status` (release start), office names |
| `candidates` (`0001`/`0002`) | `/candidates`, `/candidates/{id}`, `/search`, colors and photos |
| `current_results` (`0001`/`0002`) | live results (`at` absent) of country, state, municipality, zone |
| `result_snapshots` (`0001`/`0002`) | results "as of" `at`, `/results/series`, `/timeline` |
| `current_progress`, `progress_snapshots` (`0001`/`0002`) | `/progress`, `/status` (`pct_sections_br`), `/timeline` |
| `ballot_box_reports` (`0001`, was `boletim_urna`) | zone, polling place and section sums (`fonte` `soma_bu`), section detail |
| `polling_places`, `polling_sections`, `electoral_zones`, `municipalities`, `states` (`0001`/`0002`) | geography, map, children tables, search |
| `events` (`0001`/`0002`; payload keys in `0004`) | `/events`, `/timeline`, `/results/series` events |

Redis (written by the collector and the worker, read here): `collector:metrics` (JSON),
`collector:last_collection`, `diag:section:<section_id>` and `diag:section:<section_id>:worker`
(diagnostics, kept about 1 hour). The on-demand registry of `backend/app/modules/ballot_reports/demand/registry.py`
(entries expire after 120 s by default).

Files on disk: the photo cache, `DIR_CACHE_FOTOS/<tse_candidate_id>` (bytes) and a sidecar
`<tse_candidate_id>.tipo` (media type).

## Routes

All paths have the prefix `/api/v1`. Query parameters are the English names; `round` is the
election round (turno), `office` the office code (cargo), `at` an ISO 8601 instant (absent = live),
`level` and `id` the geo area (`country`, `state`, `municipality`, `zone`, `polling_place`, `section`).

| Method and path | Query parameters | Response (DTO) | Errors (problem+json type) |
|---|---|---|---|
| GET `/status` | none | `StatusDto` | none |
| GET `/elections` | none | `list[ElectionDto]` | none |
| GET `/results` | `level`, `id`, `office`=1, `round`=1, `at` | `ResultsDto` (`no_data` true or false) | `geo_area/invalid` 422, `query/invalid_time` 422 |
| GET `/results/series` | `level`, `id`, `office`, `round`, `from`, `to`, `max_points` (10-2000, 300) | `SeriesDto` | `geo_area/invalid`, `query/invalid_time`, `request/invalid` |
| GET `/geo-areas/children` | `level`, `id`, `at`, `office`, `round`, `child_level`, `candidates` (comma list) | `ChildrenDto` | `geo_area/invalid`, `geo_area/invalid_child_level` 422 |
| GET `/progress` | `round`, `at` | `ProgressDto` | `query/invalid_time` |
| GET `/maps/polling-places` | `round`, `office`, `state_code`, `municipality`, `bbox` (minLon,minLat,maxLon,maxLat), `limit` (1-100000, 20000), `at` | `MapPollingPlacesDto` | `map/invalid_bbox` 422, `query/invalid_time` |
| GET `/polling-places/{polling_place_id}` | `round` | `PollingPlaceDto` | `polling_places/not_found` 404 |
| GET `/diagnostics/polling-places/{polling_place_id}` | `round` | `PollingPlaceDiagnosticsDto` | none (an unknown id answers with `polling_place_in_db` false) |
| GET `/polling-sections/{polling_section_id}` | `round` | `PollingSectionDto` | `polling_sections/invalid_id` 422, `polling_sections/not_found` 404 |
| GET `/candidates` | `round`, `office`, `state_code` | `list[CandidateDto]` | none |
| GET `/candidates/{tse_candidate_id}` | `round`, `at` | `CandidateDetailDto` | `candidates/not_found` 404 |
| GET `/candidates/{tse_candidate_id}/photo` | none | image (`image/*`), `Cache-Control` 1 day | `candidates/photo_not_found` 404 |
| GET `/search` | `q` (max 80), `limit` (1-50, 20) | `SearchDto` | `request/invalid` |
| GET `/events` | `round`, `since`, `until`, `limit` (1-1000, 100), `types` (comma list), `office`, `level`, `geo_area_id` | `list[EventDto]` | `query/invalid_time` |
| GET `/timeline` | `round` | `TimelineDto` | none |
| GET `/exports` | `resource` (`results` or `children`), `format` (`csv` or `json`), `office`, `round`, `level`, `id`, `child_level`, `at` | CSV or JSON file (attachment) | `export/invalid_resource` 422, `geo_area/invalid` 422 |
| WS `/ws` | see protocol below | JSON frames | `error` frame (`JSON inválido`, `op desconhecida`) |

Errors every route can return: `request/invalid` 422 (FastAPI validation, with an `errors` list)
and `http/<status>` for HTTP errors such as an unknown path (`http/404`). The `detail` text is
Portuguese product text.

## How it works

**Time parameter.** `TimeDep` parses `at` with `parse_time` (ISO 8601, `Z` accepted). Without `at`
the query reads `current_results` / `current_progress` (live). With `at` it reads the latest
`result_snapshots` (or `progress_snapshots`, one per `geo_area_id`) with `tallied_at <= at`.

**Results** (`GET /results` to `build_result` in `results/queries/tally/result.py`). The line
comes from `get_line` in `tally/lines.py`: for country, state and municipality it is the TSE row
(`tse_line`); for zone it tries the TSE row and falls back to the sum of ballot boxes; for
polling place and section it is always `ballot_box_line`, which sums the `votes[office]` of each
ballot box (`sum_ballot_boxes`). The line says `source` (`tse` or `soma_bu`) and, for the sum,
`coverage` (sections collected out of total). Each candidate's status comes from
`elections/status/rules.py` (`calculate`): `ELECTED` only when the TSE marked the final tally,
`MATHEMATICALLY_ELECTED` when the TSE decided before 100%, `LEADING` is computed here while
undecided, otherwise `COUNTING`, `NOT_ELECTED`, `SUB_JUDICE`. Alliances are returned only for
proportional offices (`voting_system` other than `majoritario`).

**Demand.** `GET /results`, `/geo-areas/children`, `/polling-places/{id}` and `/polling-sections/{id}`
first call `request_sections` (`public/demand/section_request.py`), which registers the place or
section in Redis. Only `polling_place` and `section` levels are kept (`LEVELS` in the registry).
A failure to register is logged and never breaks the read.

**Children** (`results/queries/children/query.py`). `CHILD_LEVEL` gives the child level of each
level (or `child_level` from the query). `_dimension` lists the children (`dimensions.py`),
`build_item` (`items.py`) merges each one with its line, `wins` counts how many children each
candidate leads. `candidates=` adds the requested candidates to every item (`valores`).

**Series** (`tally/series.py`). Reads `result_snapshots` in the window, thins them to `max_points`
evenly (always keeping the last one), keeps the top 12 candidates of the last point, and attaches
the events of the same area (`events.list_events`, limit 200).

**Progress and status** (`status.py`, `public/status/current.py`). `progress` returns the country
row and one item per state; `/status` returns `live` = collector metrics exist and are not paused,
the last tally (`max(tallied_at)` of the country), the last collection (Redis), the release start
and `pct_sections_br`.

**Polling place map** (`polling/maps.py`). `MapQuery` filters by state, municipality and `bbox`,
reads at most `limit` places, returns the result of each (official `current_results` row or the
ballot box sum for `at`), and reports `total` and `truncated`.

**Polling place and section detail** (`polling/place.py`, `sections.py`). The section detail
lists, office by office, the nominal votes (matched to candidates by ballot number) and the
legend votes (`legenda`). Status is `tallied` when a ballot box exists, otherwise `not_received`.

**Search** (`search.py`). Accent-free, case-insensitive `ILIKE` through `unaccent(lower(...))`
over states (name, or two letters for the code), municipalities, candidates (name, ballot name,
and the number when the query is only digits), polling places (name, neighborhood, address), and
numbered zones and sections (`zona 12`, `secao 120`, optional municipality). Queries shorter than
two characters return an empty list. Results are capped at `3 * limit`.

**Exports** (`exports/download.py`). Builds the same payload as the route, then CSV with `;`
separator and UTF-8 BOM (`rows.py` names the columns) or JSON. The file name is
`<resource>-<office>-<area id>`.

**Candidate photo** (`candidates/photo.py`). Non-digit ids are 404. A cached file is served at
once; otherwise the photo is downloaded from the TSE URL built by `UrlBuilder.foto` (from
`TSE_BASE_URL`), stored in the cache (best effort) and served. Any TSE failure is a 404.

**WebSocket** (`realtime/websocket.py`, hub in `backend/app/infra/realtime/hub.py`). Client
frames: `{"op":"subscribe","topics":[...]}`, `unsubscribe`, `{"op":"auth","token"}` (sets the
connection's user, answers `{"type":"auth","ok"}`), `ping` (answers `pong`), `resume` (answers
`{"type":"resync"}`). Server frames: `{"type","topic","seq","data"}`. Topic names are built in
`backend/app/infra/realtime/topics.py`: `results:<round>:<office>:<level>:<id>`,
`children:...` (with optional child level), `polling_places:<round>:<office>:<municipality>`,
`events:<round>`, `progress:<round>`, `user:<user id>` (alerts, only after `auth`). The hub sends a
topic only to connections subscribed to it (at most 200 topics per subscribe, names under 120
characters).

## Rules and guarantees

- Unknown geo area, child level or bbox is a 422 with a stable type, never a 500:
  `backend/tests/unit/test_domain.py::test_geo_area_details_and_invalid_ids`.
- Before the simulated count starts, the country line exists with zero sections and zero valid votes: `backend/tests/integration/test_full_flow.py::test_before_17h_results_are_zero`.
- Results "as of" a time come from the snapshots, and the partial tally is consistent with them:
  `backend/tests/integration/test_full_flow.py::test_partial_tally_and_snapshots`.
- A ballot box sum gives the polling place and section status and results:
  `backend/tests/integration/test_full_flow.py::test_polling_place_and_section_from_ballot_report`.
- Opening a section in on-demand mode triggers collection: `backend/tests/integration/test_full_flow.py::test_sections_on_demand`.
- Elected and runoff statuses come from the TSE; `LEADING` is computed only while the TSE has not decided:
  `backend/tests/unit/test_domain.py::test_status_comes_from_tse`, `backend/tests/unit/test_domain.py::test_leading_is_computed_only_while_tse_has_not_decided`.
- Events (start, milestones, lead change, elected, runoff): `backend/tests/unit/test_domain.py::test_events_start_milestones_and_lead_change`, `backend/tests/unit/test_domain.py::test_events_elected_and_runoff`.
- The API answers every route end to end (results, maps, children, progress, events, timeline,
  search, export, zone, polling place, section, series): `backend/tests/integration/test_full_flow.py::test_api_results_and_maps`,
  `backend/tests/integration/test_full_flow.py::test_api_progress_events_timeline_search_export`,
  `backend/tests/integration/test_full_flow.py::test_api_zone_polling_place_section_and_series`,
  `backend/tests/integration/test_full_flow.py::test_children_for_maps`.
- Errors are `application/problem+json` with a `domain/reason` type: `backend/tests/integration/test_users_dashboards.py::test_404_and_422_as_problem_json`.
- The WebSocket delivers a publication to a subscriber and only to subscribers:
  `backend/tests/integration/test_realtime.py::test_websocket_subscribes_and_receives_publication`,
  `backend/tests/integration/test_realtime.py::test_hub_dispatches_only_to_subscribers`,
  `backend/tests/integration/test_realtime.py::test_topic_names`.

## Settings

| Variable (field) | Default | Used by |
|---|---|---|
| `TSE_AMBIENTE` (`tse_environment`) | `fake` | `/status` (`tse_environment`) |
| `TSE_BASE_URL` (`tse_base_url`) | `http://tse-fake:8080/oficial` | photo URL of the candidate |
| `DIR_CACHE_FOTOS` (`photo_cache_dir`) | `/data/fotos` | photo cache |
| `MODO_SECOES` (`section_mode`) | `sob_demanda` | collector side of the on-demand requests |
| `DATABASE_URL`, `REDIS_URL` | local compose values | every query, status, diagnostics |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8081` | browser access to the API |

## Points of attention

- **Spec names diverge (by design).** `specs/11-api-contract.md` uses Portuguese paths and fields
  (`/resultados`, `/recortes/filhos`, `/mapas/locais`, `/secoes/{id}`, `/locais/{id}`, `/busca`,
  `/fotos/{sqcand}`, `/linha-do-tempo`, `/export?recurso=`), the code uses the glossary names
  (`/results`, `/geo-areas/children`, `/maps/polling-places`, `/polling-sections/{id}`,
  `/polling-places/{id}`, `/search`, `/candidates/{id}/photo`, `/timeline`, `/exports?resource=`).
  Fields follow the same rule: `sem_dados` is `no_data`, `nivel` is `level`, `turno` is `round`,
  `cargo` is `office`, `t` is `at`, `uf` is `state_code`. The spec is history; this file is the contract.
- **Search types differ from the spec:** the code returns `state`, `municipality`, `candidate`,
  `polling_place`, `zone`, `section` (the spec said `uf`, `municipio`, `local`, `zona`, `secao`).
- **WebSocket protocol differs from the spec.** The spec uses `op: sub|unsub`, `topicos`, `tipo`,
  `dados`, and topic names `res:`/`filhos:`/`locais:`. The code uses `subscribe|unsubscribe`,
  `topics`, `type`, `data` and the topics above. `resume` does not replay anything: it only
  answers `resync`, so the requirement of RF-06 (recover what was lost, from the last `seq`) is not
  implemented server side.
- **Release start is off by three hours.** `_release_start` in `public/status/current.py` builds
  `20:00:00+00:00` (17:00 in Brasília), while its docstring says "20:00 (Brasília)". The spec
  example uses `20:00Z` too. Decide which one is right and fix the code or the docstring.
- **`pct_sections_br` always reads round 1.** `current_status` calls `pct_country` without the
  round, so `/status` ignores the round of the election.
- **Export `format` is not validated.** Any value other than `json` returns CSV. `resource` is
  validated, and `child_level` is ignored for `results`.
- **Diagnostics never 404.** An unknown polling place answers 200 with `polling_place_in_db` false.
- **Photos are cached forever.** There is no eviction in `DIR_CACHE_FOTOS`; a changed TSE photo
  is served until the file is removed by hand.
- **Search needs the `unaccent` extension**, created by `0001` (`CREATE EXTENSION IF NOT EXISTS unaccent`).
- **The on-demand request is a GET side effect.** Opening a page writes to Redis; by design
  (`request_sections` never raises), but a crawler that visits polling places triggers collection.
