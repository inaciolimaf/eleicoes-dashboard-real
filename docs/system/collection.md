# Collection

The collector polls the TSE dissemination files, checks their JWS signature, and hands the raw bodies to the worker through a Redis queue. It is the only process that talks to the TSE. `backend/app/infra/tse/` holds the TSE formats (URLs, catalog, parsers, keys, ballot box), `backend/app/infra/queue/` the queue, and `backend/tse_fake/` a mock of the TSE for development and tests. Spec: `specs/02-tse-data-sources.md` (sources, formats, JWS, rate limit) and `specs/03-section-granularity.md` (zone, polling place and section levels).

## Where it is

| File | Role |
|---|---|
| `backend/app/collector/main.py` | Entrypoint of the `collector` container |
| `backend/app/collector/collector.py` | `Collector`: leadership, loops, consumers, pause, metrics |
| `backend/app/collector/fetcher.py` | `TokenBucket`, `Fetcher` (ETag, 404 memory, retries, 429 pause), `Metrics` |
| `backend/app/collector/steps/base.py` | `CollectorBase` (shared attributes), `SectionRef`, `STATES`, job tuples |
| `backend/app/collector/steps/request.py` | `RequestSteps.fetch_file`: `.jws` then `.json`, JWS check, raw archive |
| `backend/app/collector/steps/catalog.py` | `CatalogSteps`: catalog, rounds, municipalities, polling places, sections of a state |
| `backend/app/collector/steps/results.py` | `ResultSteps`: `primary_cycle`, `fetch_result`, `process_municipality` |
| `backend/app/collector/steps/sections.py` | `SectionSteps`: `process_section` (auxiliary, then BU) |
| `backend/app/collector/steps/tracking.py` | `TrackingSteps`: `tracking_cycle`, `schedule_municipality` |
| `backend/app/collector/steps/demand.py` | `DemandSteps`: `on_demand_cycle` (sections opened in the dashboard or alerted) |
| `backend/app/collector/steps/__init__.py` | Package docstring only |
| `backend/app/collector/__init__.py` | Package marker |
| `backend/app/infra/tse/urls.py` | `UrlBuilder`: every dissemination URL, from the catalog templates |
| `backend/app/infra/tse/catalog.py` | `parse_catalog` (EA11), `Catalog`, `Catalog.resolver` |
| `backend/app/infra/tse/keys.py` | `KEYS` per environment, `key_for_environment` |
| `backend/app/infra/tse/jws.py` | `verify`, `sign`, `decode_unverified`, `JwsKey`, `JwsError` |
| `backend/app/infra/tse/numbers.py` | Conversions: TSE strings to int/decimal/datetime (decimal comma, `dd/mm/yyyy`) |
| `backend/app/infra/tse/ballot_box.py` | BU `decode` and `encode` (ASN.1 BER via `asn1tools`) |
| `backend/app/infra/tse/asn1/bu.asn1` | ASN.1 schema of the BU (`ModuloBU`) |
| `backend/app/infra/tse/parsers/__init__.py` | Re-exports the parsers |
| `backend/app/infra/tse/parsers/common.py` | `generation_id` (`idg`, or the generation date when missing) |
| `backend/app/infra/tse/parsers/auxiliary.py` | EA18 `parse_auxiliary`, `UrnFileTSE.tallied`, `ballot_box_tallied` |
| `backend/app/infra/tse/parsers/municipalities.py` | EA12 `parse_municipalities` |
| `backend/app/infra/tse/parsers/sections.py` | EA16 `parse_sections` |
| `backend/app/infra/tse/parsers/results.py` | EA20 `parse_result` (office, alliances, candidates, totals) |
| `backend/app/infra/tse/parsers/tracking.py` | EA14/EA15 `parse_tracking` (progress by state and municipality) |
| `backend/app/infra/queue/__init__.py` | `enqueue`, `dequeue`, `size`, `low_priority_size`, `message`, `read` |
| `backend/tse_fake/main.py` | FastAPI app: the TSE URLs, `Clock`, `/_fake` control endpoints |
| `backend/tse_fake/key.py` | Deterministic Ed25519 key of the mock (not a secret) |
| `backend/tse_fake/data.py` | Fixed data: states, capitals, parties, name lists |
| `backend/tse_fake/scenario/core.py` | `Scenario(seed, scale)`: builds the synthetic election |
| `backend/tse_fake/scenario/model.py` | Dataclasses and codes (`ELECTION_EVENT_CODE`, `CYCLE`, ...) |
| `backend/tse_fake/scenario/geography.py` | Municipalities, zones, polling places and sections |
| `backend/tse_fake/scenario/timing.py` | Tally time of each section (lognormal by region) |
| `backend/tse_fake/scenario/votes.py` | Majoritarian offices: President, governor, senator |
| `backend/tse_fake/scenario/proportional.py` | Proportional offices: federal and state deputies |
| `backend/tse_fake/scenario/helpers.py` | Names, numbers, parties, vote distribution |
| `backend/tse_fake/scenario/__init__.py` | Re-exports of the scenario |
| `backend/tse_fake/publication/core.py` | `Publication`: documents at a simulated instant, caches |
| `backend/tse_fake/publication/results.py` | Result document (EA20) and tracking document (EA14/15) |
| `backend/tse_fake/publication/status.py` | Who is elected: majoritarian rules, seat allocation |
| `backend/tse_fake/publication/section_files.py` | Auxiliary document, BU bytes, section hash and BU name |
| `backend/tse_fake/publication/documents.py` | Catalog, municipalities, section tree, places CSV, photo SVG |
| `backend/tse_fake/publication/formatting.py` | `START`, `PERIOD`, `round_of`, TSE number and date formats |
| `backend/tse_fake/publication/__init__.py` | Re-exports of the publication |

## Data

Redis keys (written or read by the collector):

| Key | Type, TTL | Written by | Read by / meaning |
|---|---|---|---|
| `queue:priority` | list | `queue.enqueue` (`high_priority`) | Worker `dequeue`, first. State and national totals, tracking, watched municipalities |
| `queue:files` | list | `queue.enqueue` | Worker `dequeue`, second. Everything else. Also counted by `_queue_full` |
| `queue:pending` | hash `key -> message` | `queue.enqueue` with `key` | Latest body of each keyed file not yet taken by the worker |
| `collector:leader` | string, 30 s | `_wait_for_leadership`, `_renew_leadership` | Instance id of the leader |
| `collector:paused` | string | Admin pause route (`app/modules/admin/routes.py`) | `_refresh_watched` every 5 s; the loops stop while it exists |
| `collector:metrics` | JSON, 60 s | `_publish_metrics` every 3 s | Admin health and public status |
| `collector:last_collection` | ISO time, 1 h | `_publish_metrics` | Public status |
| `diag:section:<section id>` | JSON, 1 h | `process_section` | Diagnostic of the last attempt (the worker writes `diag:section:<id>:worker`) |
| `sections:demand` | sorted set, score = expiry | API (`ballot_reports.demand.register`) | `ballot_reports.demand.pending` in `on_demand_cycle` |
| `ws:topics` | sorted set, score = expiry | Real time (`topics.register_active`) | `topics.active`: watched municipalities and sections |

Files on disk: every raw body fetched with `archive=True` (catalog, results, tracking, auxiliary files and BUs) is written to `DIR_BRUTOS` (default `/data/brutos`) as `<DIR_BRUTOS>/<TSE_AMBIENTE>/<URL path after the host>.<idg or unix time>`, see `RequestSteps._archive`. The write is best effort (`OSError` ignored) and nothing cleans the folder. `backend/app/data/municipalities.json` (names and IBGE coordinates) is read by `CatalogSteps.load_municipalities`.

Database writes done by the collector through the ingestion of `app/modules/results/ingestion`: `ingest_catalog` (elections), `ingest_municipalities`, `ingest_sections`, `import_polling_places` (polling places from the open-data CSV, only when the table is empty).

## Routes

The collector has no HTTP routes. Its pause and resume are admin routes that set and delete `collector:paused` (`pause_collector`, `resume_collector` in `backend/app/modules/admin/routes.py`).

The mock TSE serves these routes (`backend/tse_fake/main.py`). Unknown names return a plain FastAPI `404`:

| Method and path | What it does | Errors |
|---|---|---|
| GET `/oficial/comum/config/ele-c.{json,jws}` | Catalog (EA11) | 404 for another extension |
| GET `/oficial/ele2026/{election}/config/mun-e{election}-cm.{json,jws}` | Municipalities (EA12) | 404 when the election differs |
| GET `/oficial/ele2026/{election}/dados/{uf}/{uf}-e{election}-ab.{json,jws}` | Tracking (EA14/EA15) | 404 for an unknown state |
| GET `/oficial/ele2026/{election}/dados/{uf}/...-c{office}-e{election}-u.{json,jws}` | Result (EA20), also `-e` (only elected) | 404 when there is no such office or area, or before the tally of the round |
| GET `/oficial/ele2026/{election}/fotos/{uf}/{sqcand}.jpeg` | Candidate photo (SVG content) | 404 unknown candidate |
| GET `/oficial/ele2026/arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito}-cs.json` | Section tree of a state (EA16) | 404 unknown state |
| GET `/oficial/ele2026/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/...-aux.json` | Auxiliary of a section (EA18) | 404 unknown section |
| GET `.../{secao}/{hash}/{name}` | `.bu` (binary); other files of the urn answer `MOCK` | 404 wrong hash, or the section is not tallied yet |
| GET `/dadosabertos/eleitorado_local_votacao_2026.csv` | Polling places, latin-1 CSV | none |
| GET `/_fake/estado` | Simulated clock, speed, pause, percent of sections tallied | none |
| POST `/_fake/controle` | Body `{"velocidade"?, "pausado"?, "reiniciar"?, "ir_para"?}`; `ir_para` is `HH:MM` (Brasilia) or minutes after 17h | none |
| GET `/saude` | Health check (used by the compose healthcheck) | none |

## How it works

**Start (`Collector.run`).** `_wait_for_leadership` takes `collector:leader` with `SET NX EX 30`; a non-leader waits and retries every 10 s. The leader renews the key every 10 s (`_renew_leadership`). Then it loops `refresh_catalog` until the catalog loads (retry every 5 s). Then it starts, with `asyncio.gather`: `_renew_leadership`, `_publish_metrics` (3 s), `_refresh_watched` (5 s), the loops `catalogo` (`INTERVALO_CATALOGO`), `principal` (`INTERVALO_PRINCIPAL`), `acompanhamento` (`INTERVALO_ACOMPANHAMENTO`), `sob_demanda` (fixed 3 s), and the consumers of the two priority queues (`COLETOR_WORKERS_MUNICIPIO`, `COLETOR_WORKERS_SECAO`). `_loop` runs a step only when not paused and the catalog is known; it sleeps the rest of the interval (minimum 0.5 s) and logs exceptions.

**Catalog (`refresh_catalog`).** Fetches `<TSE_BASE_URL>/comum/config/ele-c` through `fetch_file`, parses it with `parse_catalog`, takes the most recent event (`current_election_event`) and builds `UrlBuilder` from the catalog templates. `ingest_catalog` stores the elections. When the generation id (`idg`) changes, it clears the 404 memory and reloads the municipalities and, if the table is empty, the polling places.

**Rounds.** `rounds()` comes from the catalog. For round 2 and later the collector only polls when `round_published` gets a sentinel file (the national President total, or else the first office of `sp`), so a round not yet published does not produce a flood of 404.

**Primary results (`primary_cycle`, every `INTERVALO_PRINCIPAL`).** For each election of the round, `_primary_tasks` requests the national President total, the President of every state and the code `zz`, and the other offices per state (`offices_of_state`: the Senate is not elected in the DF, district deputies only in the DF). `fetch_result` marks the request high priority when it is a national total or a watched municipality, and enqueues the body with `key=url`, so a newer version of the same file replaces the pending one (`TYPE_RESULT`, context: round, election id, office, level, geo area id, parent id, `jws_verified`, `captured_at`).

**Municipalities (`process_municipality`).** Municipalities that a tracking file marked as changed are consumed from `municipality_queue`. Each office of each election is requested for the municipality and, when `COLETAR_ZONAS` and the municipality has more than one zone, for each zone. In `todas` mode it then loads the section tree of the state and schedules its sections.

**Tracking (`tracking_cycle`, every `INTERVALO_ACOMPANHAMENTO`).** For `br` and each state, the EA14/EA15 file is queued (`TYPE_TRACKING`, key `tracking:<round>:<state>`). `_track_items` compares, per state and per municipality, the pair (`sections_tallied`, `tallied_at`) with the last seen; a changed municipality goes to `schedule_municipality`. If the state file has no municipality list, every municipality of the state is scheduled. `schedule_municipality` keeps a minimum gap of `INTERVALO_MIN_MUNICIPIO` between two collections of the same municipality (divided by 3 when watched) and gives priority 0 to watched municipalities, 1 to the others.

**Sections, on demand (`on_demand_cycle`, default `MODO_SECOES=sob_demanda`).** Every 3 s it reads `ballot_reports.demand.pending` (the `sections:demand` set plus the watched topics) and the active alerts of type `polling_place_tallied`. Polling places are expanded to their sections (`PollingSection`). A section is skipped when its ballot report is already in `BallotBoxReport`, when it was downloaded recently, when it is already pending, or when it was attempted within `INTERVALO_MIN_MUNICIPIO / 3`. The rest enter `section_queue` with priority 0.

**Sections, sweep (`MODO_SECOES=todas`).** After the municipality's results, `schedule_municipality_sections` queues every section of the municipality (priority 0 when watched, 2 otherwise). `_section_done` is permanent in this mode.

**One section (`process_section`).** Fetches the auxiliary file without ETag (a BU that failed once must not keep answering 304). `parse_auxiliary` and `ballot_box_tallied` pick the most recent urn whose status starts with "totalizad" and has a `.bu` file. The `.bu` is fetched without ETag, archived, the section is marked done (`sections_done`, so a failed worker run is retried later), and enqueued as `TYPE_BALLOT` without key (no coalescing). `diag:section:<id>` records each step.

**File fetch (`RequestSteps.fetch_file`).** If `TSE_USAR_JWS` is on, the process has not disabled JWS, and the URL ends in `.json`, it first asks for the `.jws`. A `200` goes to `_verify_jws`; a `404` falls back to the `.json`; any other status is returned as is. `_verify_jws` returns the payload of `jws.verify` with the key of the environment when `TSE_VERIFICAR_JWS` is on, or the unverified payload when it is off. On `JwsError` it counts `metrics.jws_failures`, drops the ETag of that URL, sets `jws_disabled = True` for the rest of the process, logs an error and uses the `.json`.

**HTTP (`Fetcher.get`).** Every attempt waits for `pause_until`, then takes a token. `TokenBucket(TSE_MAX_RPS)` has a burst of 10% of the rate; high-priority requests hold their own lock and low-priority ones wait while one is waiting. Two semaphores: low priority `TSE_CONCORRENCIA`, high priority `max(4, TSE_CONCORRENCIA // 3)`. A `304` answers with the stored ETag; `If-None-Match` is sent when `use_etag` and the URL has an ETag. A `404` is remembered for 120 s. `5xx` and `429` retry up to 3 attempts with 1 s, then 2 s backoff; a `429` also sets `pause_until` 30 s ahead for every request. Network errors count in `network_errors` and end as status `599`.

**Queue (`app/infra/queue`).** The message is JSON `{type, z, context}` with `z` = base64 of zlib(body). Without key the message is `LPUSH`ed to `queue:priority` or `queue:files`. With key, the body goes into the `queue:pending` hash; only the first pending enqueue pushes a `ref:<key>` entry to the list, later ones just replace the body. `dequeue` (used by the worker) pops priority first and resolves references with a Lua `HGET`+`HDEL`. `_queue_full` is the brake: when `queue:files` is above `FILA_MAX`, municipality consumers wait (2 s steps) unless the municipality is watched, so the TSE is not downloaded faster than the worker consumes.

**Pause.** `collector:paused` stops the loops and the consumers; `_refresh_watched` reads it every 5 s, so a pause takes up to 5 s.

**Metrics (`_publish_metrics`).** Every 3 s: requests per second (10 s window), status counts, network and JWS failures, queue sizes, sections collected, municipalities, section mode, watched count, paused, environment, base URL, max RPS, leader id. Stored in `collector:metrics` (60 s TTL).

### Fake TSE (`backend/tse_fake/`)

Only for `TSE_AMBIENTE=fake` (default). The `tse-fake` compose service runs `uvicorn tse_fake.main:app` on port 8080 (host 8089; `docker-compose.override.yml` maps 28089 in development).

- **Scenario.** `Scenario(seed, scale)` builds a synthetic 2026 election from the seed: geography from the real municipality list and the real states (`data.py`), sections in flat numpy arrays, tally time per section (`timing.py`: lognormal by region, capitals 25% faster, 0.4% late sections between 200 and 380 minutes), and votes per office (`votes.py`, `proportional.py`, `helpers.py`). Codes: election event 9001, federal 9100, state 9102, cycle `ele2026`.
- **Clock.** `Clock` in `main.py` runs in simulated time from 17h Brasilia (`START`, `FAKE_INICIO_MIN` = -2, so 16h58), at `FAKE_VELOCIDADE` times real time. Files change only per round: `round_of` rounds the time to `PERIOD` = 30 simulated seconds, and the generation id is `170000000 + rounds`.
- **Publication.** `Publication(scenario)` builds the documents for an instant: `results.py` (EA20 and EA14/15), `status.py` (elected flags, second round, seat allocation with electoral quotient and averages), `section_files.py` (auxiliary, BU bytes encoded by `app.infra.tse.ballot_box.encode`, names `o09001-<municipality><zone><section>`), `documents.py` (catalog, municipalities, sections, places CSV, photo SVG). Numbers use the decimal comma of the TSE.
- **Signing and cache.** `_response` signs every `.jws` with `tse_fake/key.py`: an Ed25519 key derived from a fixed SHA-256 seed, with `kid` from `TSE_FAKE_KID`. It is for development only and is not a secret. Responses are cached per file in an `OrderedDict` of at most 60000 entries, keyed by generation; `ETag` is the generation id and `If-None-Match` returns `304`.
- **Makefile targets** (port 8089): `make fake-status` (GET `/_fake/estado`), `make fake-velocidade v=20` (POST `velocidade`), `make fake-reiniciar` (POST `reiniciar: true`), `make fake-ir h=19:30` (POST `ir_para`). `make up-oficial` points the collector to the real TSE instead.

## Rules and guarantees

- Only the leader collects: `collector:leader` with a 30 s lease, renewed every 10 s. No test found.
- Never more than `TSE_MAX_RPS` requests per second, with a burst of 10%: `backend/tests/unit/test_collector_http.py::test_token_bucket_does_not_exceed_the_limit`.
- High-priority requests take tokens first: `backend/tests/unit/test_collector_http.py::test_token_bucket_high_priority_goes_first`.
- A `304` costs a token and does not re-download: `backend/tests/unit/test_collector_http.py::test_etag_304_consumes_a_token_and_is_not_downloaded_again`.
- A `404` is not asked again within its TTL: `backend/tests/unit/test_collector_http.py::test_404_is_not_requested_again`.
- `5xx` is retried: `backend/tests/unit/test_collector_http.py::test_retries_on_5xx_error`. A `429` pauses the collector: `backend/tests/unit/test_collector_http.py::test_429_pauses_the_collector`.
- A bad signature falls back to the JSON: `backend/tests/unit/test_collector_http.py::test_jws_with_wrong_key_falls_back_to_the_json`.
- A section whose ballot report failed is tried again: `backend/tests/unit/test_collector_http.py::test_section_retries_the_ballot_report_if_it_failed`.
- Priority and coalescing of file versions: `backend/tests/integration/test_queue.py::test_queue_prioritizes_high_and_coalesces_versions`. Compression, and reading of uncompressed messages: `backend/tests/integration/test_queue.py::test_queue_compresses_and_reads_uncompressed_message`.
- JWS: a valid token passes (`backend/tests/unit/test_jws_ballot_box.py::test_jws_valid`), one changed byte is rejected (`backend/tests/unit/test_jws_ballot_box.py::test_jws_um_byte_alterado_e_rejeitado`), wrong `kid` or `alg` is rejected (`backend/tests/unit/test_jws_ballot_box.py::test_jws_kid_e_algoritmo_errados`), and the mock key is the one of the fake environment (`backend/tests/unit/test_jws_ballot_box.py::test_mock_key_matches_fake_environment`).
- BU encoding and decoding round trip: `backend/tests/unit/test_jws_ballot_box.py::test_ballot_box_round_trip`.
- Formats: `backend/tests/unit/test_tse_formats.py::test_tse_number_strings`, `backend/tests/unit/test_tse_formats.py::test_datas_brasilia_para_utc`, `backend/tests/unit/test_tse_formats.py::test_catalog_resolves_by_office_not_state`, `backend/tests/unit/test_tse_formats.py::test_file_urls`, `backend/tests/unit/test_tse_formats.py::test_parse_result_unificado`, `backend/tests/unit/test_tse_formats.py::test_parse_result_tolerante_a_campos_ausentes`, `backend/tests/unit/test_tse_formats.py::test_parse_tracking_auxiliary_sections_municipalities`, `backend/tests/unit/test_tse_formats.py::test_polling_place_csv_zip_uses_brazil_csv`, `backend/tests/unit/test_tse_formats.py::test_missing_generation_id_uses_generation_time`.
- Mock: `backend/tests/unit/test_fake_tse.py::test_scenario_is_deterministic`, `backend/tests/unit/test_fake_tse.py::test_idg_so_muda_quando_o_conteudo_muda`, `backend/tests/unit/test_fake_tse.py::test_final_presidente_e_proporcional`, `backend/tests/unit/test_fake_tse.py::test_tracking_and_ballot_report`, `backend/tests/unit/test_fake_tse.py::test_municipality_sum_matches_brazil`.
- End to end, through the mock: `backend/tests/integration/test_full_flow.py::test_sections_on_demand`, `...::test_polling_place_and_section_from_ballot_report`, `...::test_partial_tally_and_snapshots`, `...::test_before_17h_results_are_zero`, `...::test_simulated_clock`, `...::test_catalog_municipalities_and_places_loaded`.
- Admin pause: `backend/tests/integration/test_users_dashboards.py::test_admin_collector`.

## Settings

Names from `backend/app/core/config.py`. Defaults in brackets.

| Variable | Field | Meaning |
|---|---|---|
| `TSE_AMBIENTE` | `tse_environment` | `fake`, `simulado`, `oficial` [fake]. Also the folder of the raw archive |
| `TSE_BASE_URL` | `tse_base_url` | Base with the environment included [`http://tse-fake:8080/oficial`] |
| `TSE_MAX_RPS` | `tse_max_rps` | Requests per second, all requests included [90] |
| `TSE_CONCORRENCIA` | `tse_concurrency` | Concurrent requests [16]. High priority gets `max(4, n // 3)` |
| `TSE_VERIFICAR_JWS` | `tse_verify_jws` | Check the JWS signature [true] |
| `TSE_USAR_JWS` | `tse_use_jws` | Ask for `.jws` before `.json` [true] |
| `TSE_FAKE_KID` | `tse_fake_kid` | `kid` of the mock key [`fake-eleicoes-dashboard`] |
| `TSE_FAKE_CHAVE_PUBLICA` | `tse_fake_public_key` | Public key of the mock; empty = the deterministic key [empty] |
| `TSE_FAKE_CONTROLE_URL` | `tse_fake_control_url` | Control URL of the mock [`http://tse-fake:8080/_fake`] |
| `LOCAIS_VOTACAO_URL` | `polling_places_url` | Open-data CSV of polling places [mock URL] |
| `DIR_BRUTOS` | `raw_dir` | Raw archive [`/data/brutos`] |
| `INTERVALO_CATALOGO` | `interval_catalog` | Seconds between catalog checks [60] |
| `INTERVALO_PRINCIPAL` | `interval_main` | Seconds between primary results [10] |
| `INTERVALO_ACOMPANHAMENTO` | `interval_follow_up` | Seconds between tracking files [10] |
| `INTERVALO_MIN_MUNICIPIO` | `interval_min_municipality` | Minimum seconds between two collections of a municipality [30] |
| `COLETAR_SECOES` | `collect_sections` | Collect sections at all [true] |
| `MODO_SECOES` | `section_mode` | `sob_demanda` or `todas` [sob_demanda] |
| `COLETAR_ZONAS` | `collect_zones` | Collect zone results [true] |
| `FILA_MAX` | `queue_max` | Worker low queue size above which municipalities pause [3000] |
| `COLETOR_WORKERS_MUNICIPIO` | `collector_municipality_workers` | Parallel municipality consumers [8] |
| `COLETOR_WORKERS_SECAO` | `collector_section_workers` | Parallel section consumers [16] |
| `REDIS_URL` | `redis_url` | Queue and collector state [`redis://redis:6379/0`] |

Mock only, read in `backend/tse_fake/main.py` with `os.getenv` (not in `Settings`): `FAKE_SEMENTE` [2026], `FAKE_ESCALA` [1.0], `FAKE_VELOCIDADE` [10], `FAKE_INICIO_MIN` [-2].

## Points of attention

- **JWS fallback is permanent for the process.** After one `JwsError`, `jws_disabled` stays set until restart, and all later files come from the `.json` without a signature check (their queue context says `jws_verified: false`). Spec 02 section 2.6 requires the check before a snapshot is accepted; the code accepts it unverified instead.
- **Keys are not confirmed.** `keys.py` says the `simulado` and `oficial` keys were transcribed from a third-party project and must be confirmed in the official manual. Spec 02 has the same open `[CONFIRMAR]`.
- **Rate limit reaction.** Spec 02 section 2.7 says exceeding 100 requests per second blocks the IP for 10 minutes. The code reacts to `429` with a 30 s pause for all requests and no escalation.
- **Leader renewal is unconditional.** `_renew_leadership` does `SET` without checking the owner, so after a lease expires two instances can both act as leader.
- **Raw archive grows without limit.** `DIR_BRUTOS` is written for every file and BU and never cleaned. In `todas` mode that is close to a million BUs per round.
- **BU decoding is partial.** `ballot_box.decode` ignores `seguranca` (an encrypted envelope would fail) and does not verify the BU hash or signature. Spec 03 section 3.3 marks verification as optional for v1, and `assinatura.asn1` and `rdv.asn1` are not in the repo.
- **Section aggregator is parsed but unused.** `parsers/sections.py` keeps `aggregator` (`nsp`), and nothing in the collector reads it. Spec 03 section 3.2 still has it as `[CONFIRMAR]`.
- **Coalescing keeps the first priority.** A keyed message that is already in a list keeps its list when a higher-priority version arrives; only the body is replaced.
- **Two election resolvers.** `Catalog.resolver` (used by tests) and `CatalogSteps.election_for_office` (used by the collector) do the same lookup.
- **Sweep interval is fixed.** The `sob_demanda` loop runs every 3 s and is not configurable.
- **Stale notes.** `backend/tse_fake/scenario/core.py` says the arguments `semente` and `escala` are kept for `tests/integration/test_fluxo_completo.py`; the real names are `seed` and `scale` and the file is `test_full_flow.py`. Several modules end with "Name used before the English rename" comments with no alias behind them (`infra/tse/urls.py`, `catalog.py`, `keys.py`, `ballot_box.py`, `jws.py`, `parsers/__init__.py`). `docs/glossary.md` says `COLETOR_WORKERS_*` are read with `getenv` in `collector/coletor.py`; they are `Settings` fields now.
