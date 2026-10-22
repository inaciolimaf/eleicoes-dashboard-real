# Processing

What the worker does with the TSE files: it consumes the collector's queue, writes the snapshots, the current state, the polling place aggregates and the events, and publishes the changes through Redis pub/sub for the WebSocket hub of the API. It comes from `specs/05-architecture.md` (sections 5.4 and 5.6) and `specs/06-data-model.md`. The worker is a separate container; the hub runs inside the API process.

## Where it is

| File | Role |
|---|---|
| `backend/app/worker/main.py` | entrypoint: `worker_concurrency` consumers over the Redis queue |
| `backend/app/worker/jobs/` | `processor.py` (dispatch, caches), `result.py`, `tracking.py`, `ballot_box.py`, `publishing.py` (Outbox), `diagnostics.py`, `shared.py` |
| `backend/app/modules/results/ingestion/` | all writes: `catalog.py`, `candidates.py`, `results.py`, `progress.py`, `ballot_reports.py`, `tally.py`, `geography/` |
| `backend/app/modules/results/models.py` | snapshot and current tables of results and progress |
| `backend/app/modules/ballot_reports/` | `models.py` (BU, polling place aggregate), `demand/registry.py` (on-demand sections) |
| `backend/app/modules/elections/` | `models.py`, `status/rules.py`, `colors/` (palette and resolution) |
| `backend/app/modules/events/` | `models.py` (`Event`), `detection.py` |
| `backend/app/modules/geography/` | `models.py`, `geo_area/ids.py` (id builders), `geo_area/area.py` (parsing), `deps.py` |
| `backend/app/infra/realtime/` | `hub.py` (connections, fan-out), `topics.py` (names, active set, publish) |
| `backend/app/modules/public/realtime/websocket.py` | the `/api/v1/ws` route |

## Data

Tables. "Created as" is the Portuguese name in `backend/alembic/versions/0001_inicial.py`; `backend/alembic/versions/0002_english_names.py` (list `TABELAS`) renames it to the current name.

| Table | Created as | Model | Content |
|---|---|---|---|
| `elections` | `eleicao` | `Election` | one row per election; round 2 is its own row, unique (`tse_environment`, `election_code`) |
| `election_offices` | `eleicao_cargo` | `ElectionOffice` | office code, voting system, seats |
| `candidates` | `candidato` | `Candidate` | keyed by the TSE candidate id; colour, overall status, elected |
| `states` | `uf` | `State` | |
| `municipalities` | `municipio` | `Municipality` | id `sp71072`; `electorate` set by the president's result |
| `electoral_zones` | `zona` | `ElectoralZone` | id `sp71072-z0001` |
| `polling_places` | `local_votacao` | `PollingPlace` | id `sp71072-z0001-l1015`, lat/lon, `is_approximate`, `section_count` |
| `polling_sections` | `secao` | `PollingSection` | id `...-s0120`, polling place |
| `result_snapshots` | `snapshot_resultado` | `ResultSnapshot` | append-only, one row per generation |
| `current_results` | `resultado_atual` | `CurrentResult` | one row per (round, office, level, area) |
| `progress_snapshots` | `snapshot_progresso` | `ProgressSnapshot` | per generation; not written for municipalities |
| `current_progress` | `progresso_atual` | `CurrentProgress` | one row per (round, level, area) |
| `ballot_box_reports` | `boletim_urna` | `BallotBoxReport` | one BU per (round, section); votes in JSONB |
| `polling_place_results` | `resultado_local` | `PollingPlaceResult` | live sum of the BUs of a polling place, per round and office |
| `events` | `evento` | `Event` | event feed, index (`round`, `occurred_at`) |

Migration 0002 also renames the columns (lists `_RESULTADO`, `_PROGRESSO`), widens `level` from 10 to 16 characters (`_tamanho_nivel`, needed by `municipality`) and renames constraints and indexes. Migration 0004 (`backend/alembic/versions/0004_event_payload_keys.py`) rewrites `events.payload` keys: `sqcand` to `tse_candidate_id`, `marco` to `milestone`, `novo_lider` to `new_leader`, `lider_anterior` to `previous_leader`. Migration 0003 is about alert and preference keys, not these tables.

**Snapshots vs current.** `result_snapshots` and `progress_snapshots` keep history: a line is inserted with `ON CONFLICT DO NOTHING` on the unique key (round, office, level, area, `generation_id`), so the same TSE generation is never stored twice. `current_results` and `current_progress` hold the latest state; `_upsert_current` overwrites a row only when the new line has a later `tallied_at`, or the same `tallied_at` and a `generation_id` not lower. `polling_place_results` is recomputed from all BUs of the place on every BU.

Redis keys:

| Key | Type | Written by | TTL |
|---|---|---|---|
| `queue:files`, `queue:priority` | list | collector (`infra/queue/__init__.py::enqueue`) | none |
| `queue:pending` | hash (dedup key to message) | collector, read by the worker through `ref:<key>` items | none |
| `worker:metrics` | hash `ok:<type>` / `erro:<type>` | worker `main.py::consumer` | none |
| `diag:section:<section_id>:worker` | string (JSON) | worker `jobs/diagnostics.py` | 3600 s |
| `ws:topics` | sorted set (topic, expiry) | hub heartbeat and `topics.register_active` | 45 s, refreshed every 15 s |
| `sections:demand` | sorted set `<round>:<level>:<id>` | `ballot_reports/demand/registry.py::register` | 120 s |
| `pub:<topic>` | pub/sub channel | `topics.publish` | n/a |

## Routes

| Method and path | What it does | Errors |
|---|---|---|
| `WS /api/v1/ws` | real time: client sends `subscribe`, `unsubscribe`, `auth`, `ping`, `resume` | plain messages `{"type":"error","message":"JSON inválido"}` and `op desconhecida: <op>`, not problem+json |

## How it works

**Worker loop.** `worker/main.py::main` builds one `Processor` and starts `WORKER_CONCURRENCIA` (default 4) `consumer` coroutines that share it. `consumer` calls `queue.dequeue` (BRPOP on the priority list, then the normal list; `ref:` items are resolved through `queue:pending` with a Lua script), `queue.read` decodes the message (zlib + base64, plain `body` accepted), then `Processor.process` runs the job by type: `result` to `jobs/result.py`, `tracking` to `tracking.py`, `ballot` to `ballot_box.py`. An unknown type is logged and dropped. The counters go to `worker:metrics`.

**Caches.** `Processor` keeps per process, shared by the consumers: `office_settings` (voting system and seats per election and office; a missing office is majoritarian with one seat; never expires) and `ballot_numbers` (`(office, ballot number) -> TSE candidate id` per round and state, 60 s TTL, reloaded when empty).

**Unit of work and outbox.** Each job runs in one transaction (`backend/app/core/db.py::unit_of_work`). Realtime messages are collected in `jobs/publishing.py::Outbox` (`add`, `add_alert`) and sent by `Outbox.publish` after the commit. A job whose commit fails publishes nothing.

**Result job (EA20), `jobs/result.py::process`.**
1. `_context` builds `ingestion.ResultContext`; `parse_result` (`backend/app/infra/tse/parsers/`) reads the file.
2. `_statuses_before` reads the candidates' `overall_status` before the write, only when the line has nationwide scope (country for the President, state for other offices).
3. `ingestion/results.py::ingest_result` inserts the snapshot. A duplicate generation rolls the session back and returns None: the job ends without events or messages.
4. `ingestion/candidates.py::ensure_candidates` writes candidates when the scope is nationwide or a candidate id is new (`known_candidate_ids`, per process). Nationwide writes upsert the status columns; other scopes only insert. Statuses come from `status.calculate`.
5. `_previous_state` reads the current row (country and state levels only), then `_upsert_current` writes the new current row; municipality lines of the President update `municipalities.electorate`.
6. `_detect_events` (country and state levels) calls `events/detection.py::detect`, inserts each event into `events` and sends `events:<round>`.
7. `_publish_result` sends `results:` only when the topic is active, and `children:` to the parent (and to the municipality list of the country).
8. `_alerts_result` evaluates every active alert (`modules/alerts`), marks the triggered ones and sends `user:<id>` messages.

**Tracking job (EA14/EA15), `jobs/tracking.py`.** `ingest_progress` writes the lines whose `sections_tallied` or `tallied_at` changed (municipality lines skip the snapshot). `progress:<round>` is published only when a country or state line changed, with `results_queries.progress(round, None)`.

**Ballot box job (BU), `jobs/ballot_box.py`.** `infra/tse/ballot_box.py::decode` reads the BU. `ballot_reports.py::ingest_ballot_report` returns `[]` when the municipality is not in the database; otherwise it creates the polling place (lat/lon of the municipality, `is_approximate=True`) and the zone if missing, upserts the section and the report (`ON CONFLICT (round, polling_section_id)`), then `tally.recalculate_polling_place` sums the reports of the place into `polling_place_results` per office: nominal and party votes, status `tallied`, `partial` or `not_received` against `section_count` (or the sections in the database), and the leader's TSE id. For each changed (office, place): `polling_places:` item, `results:` for the polling place, section and zone, and the `children:...:zone:<zone_id>` item.

**Diagnostics, `jobs/diagnostics.py`.** `record_worker` writes `diag:section:<id>:worker` best effort (exceptions suppressed). The job writes `ballot_outcome` (ok, ballot fields, saved section id, changed places, a warning when nothing changed) or, on failure, `error` as `Type: message` before re-raising. `modules/public/diagnostics/polling_place.py` reads it next to the collector's `diag:section:<id>`.

**Ids.** `geo_area/ids.py` builds ids: `municipality_id_of` gives `sp71072`, `zone_id_of` adds `-z0001`, `polling_place_id_of` adds `-l1015` to the zone, `section_id_of` adds `-s0120`. `geo_area/area.py::parse` is the inverse: `br`, state `sp`, municipality, zone, polling place (`-l`) and section (`-s`); `GeoArea.parent` climbs the tree, `CHILD_LEVEL` gives the next level down, and `GeoAreaInvalid` becomes 422 `geo_area/invalid` in `deps.py::geo_area` (default `level=country`, `id=br`). `jobs/shared.py::ballot_ids` builds the municipality, zone and section ids of a BU.

**Catalog, `ingestion/catalog.py::ingest_catalog`.** From the current election event: each election is upserted by (`tse_environment`, `election_code`); a first round with a runoff code also yields a round-2 record with only the majoritarian offices 1, 3 and 11 (`SECOND_ROUND_OFFICES`). Seats: `SEATS_BY_MAJORITARIAN_OFFICE` = {1: 1, 3: 1, 5: 2, 11: 1}.

**Geography import, `ingestion/geography/`.** `areas.py::ingest_municipalities` (IBGE coordinates from a mapping; names corrected by `proper_name` unless given), `ingest_sections` (zones and sections in blocks). `polling_places.py::import_polling_places` reads the TSE open-data CSV (`read_polling_place_csv`: latin-1, `;`, a zip uses the `_BRASIL` file). Coordinates `-1` or `0` are missing: the place takes the municipality centroid and `is_approximate`. Sections are written in blocks of 3000.

**Candidate status, `elections/status/rules.py`.** `from_tse` maps the TSE fields: a destination other than valid gives `SUB_JUDICE`; "2º turno" gives `RUNOFF`; elected gives `ELECTED` (final tally) or `MATHEMATICALLY_ELECTED`; "suplente" gives `SUBSTITUTE`; "não eleito" gives `NOT_ELECTED`; otherwise None. `calculate` uses the TSE status at the office's own coverage; elsewhere the first `seats` candidates with votes are `LEADING` and the rest `COUNTING`. `Candidate.elected` is true for `ELECTED` and `MATHEMATICALLY_ELECTED`.

**Colours, `elections/colors/`.** `palette.py` holds `PARTIES` (number to abbreviation and colour), `BY_ABBREVIATION` (with the TSE spellings), a 12-colour `PALETTE` and `UNKNOWN_COLOR`. `resolve.candidate_color` tries the abbreviation, then the party number (the first digits of the candidate number), then `UNKNOWN_COLOR`. A party without a known colour gets `color_for_text` (md5 into the palette), stable across processes.

**Events, `events/detection.py::detect`.** Compares the previous current row with the new line. Types: `start` (first tallied section of the President, country level), `milestone` (10, 25, 50, 75, 90, 100 %; reference office only: President at country, governor at state), `lead_change` (majoritarian offices, at least 1 % tallied), `elected` and `mathematically_decided` (status reached in this line), `runoff` (majoritarian). `occurred_at` is the `tallied_at` of the line. Titles and descriptions are product text in Portuguese; type and payload keys are English (`milestone`, `new_leader`, `previous_leader`, `tse_candidate_id`).

**Real time, `infra/realtime/`.** `hub.py::Hub.start` runs `_listen` (`psubscribe pub:*`) and `_heartbeat` (every 15 s, `register_active` for the topics of the open connections). `dispatch` sends a message to each connection subscribed to its topic, or to `user:<id>` for the logged user. `Connection.send` adds `seq` and queues the JSON (2000 messages). `topics.py::is_active` is true for the prefixes `events:`, `status`, `progress:` and `user:`, and for any topic in `ws:topics` with an expiry in the future. The worker builds `results:` and `polling_places:` payloads only when active.

**Topics and messages.**

| Topic | Published by | Condition |
|---|---|---|
| `results:{round}:{office}:{level}:{id}` | result job, BU job | active |
| `children:{round}:{office}:{level}:{id}[:{child_level}]` | result job (parent; municipalities of the country), BU job (zone) | active |
| `polling_places:{round}:{office}:{municipality}` | BU job | active |
| `events:{round}` | result job | always |
| `progress:{round}` | tracking job | always, on a country or state change |
| `user:{user_id}` | result job and BU job (alerts) | always; delivered by user id, not by subscription |
| `status` | nothing in the worker | always (listed in `ALWAYS_ACTIVE`) |

Message on the wire: the publisher sends `{"type", "topic", "data"}`; the hub adds `seq` per connection. Client to server: `{"op": "subscribe", "topics": [...]}`, `unsubscribe`, `{"op": "auth", "token"}`, `ping` (answers `pong`), `resume` (answers `resync`). Alerts arrive as `{"type": "alert", "topic": "user:<id>", "data": {"title", "description", "alert_id"}}`.

## Rules and guarantees

| Rule | Test |
|---|---|
| Realtime messages go out only after the commit; a failed commit publishes nothing | `backend/tests/integration/test_publish_after_commit.py::test_job_publishes_only_after_its_commit`, `::test_job_whose_commit_fails_publishes_nothing` |
| The hub sends a topic only to the connections subscribed to it | `backend/tests/integration/test_realtime.py::test_hub_dispatches_only_to_subscribers` |
| WebSocket subscribe and receive | `backend/tests/integration/test_realtime.py::test_websocket_subscribes_and_receives_publication` |
| Topic names format | `backend/tests/integration/test_realtime.py::test_topic_names` |
| Tally of a polling place and section from a BU | `backend/tests/integration/test_full_flow.py::test_polling_place_and_section_from_ballot_report` |
| Partial tally, snapshots, current row | `backend/tests/integration/test_full_flow.py::test_partial_tally_and_snapshots` |
| Final result, elected and events | `backend/tests/integration/test_full_flow.py::test_final_elected_and_events` |
| On-demand sections are downloaded and watched | `backend/tests/integration/test_full_flow.py::test_sections_on_demand` |
| Alerts fire in the worker | `backend/tests/integration/test_full_flow.py::test_alerts_fire_in_worker` |
| Geo area ids and levels, invalid ids | `backend/tests/unit/test_domain.py::test_geo_areas`, `::test_geo_area_details_and_invalid_ids` |
| Candidate status from TSE; LEADING only while the TSE has not decided | `backend/tests/unit/test_domain.py::test_status_comes_from_tse`, `::test_leading_is_computed_only_while_tse_has_not_decided` |
| Events: start, milestones, lead change; elected and runoff | `backend/tests/unit/test_domain.py::test_events_start_milestones_and_lead_change`, `::test_events_elected_and_runoff` |
| Colours stable and by party | `backend/tests/unit/test_domain.py::test_colors_are_stable`, `::test_colors_by_party` |
| Polling place CSV uses the Brazil file | `backend/tests/unit/test_tse_formats.py::test_polling_place_csv_zip_uses_brazil_csv` |
| Queue: priority and coalescing; compressed and plain messages | `backend/tests/integration/test_queue.py::test_queue_prioritizes_high_and_coalesces_versions`, `::test_queue_compresses_and_reads_uncompressed_message` |
| Migration 0004 renames payload keys and back | `backend/tests/integration/test_migration_0004.py::test_0004_renames_payload_keys_and_back_on_downgrade` |

Rules without a dedicated test: a duplicate generation is ignored; the snapshot is unique per generation; a BU of an unknown municipality is not stored.

## Settings

| Variable | Read in | Effect |
|---|---|---|
| `WORKER_CONCORRENCIA` | `backend/app/core/config.py` (`worker_concurrency`, default 4) | number of consumers in the worker |
| `LOG_LEVEL` | `backend/app/core/config.py` | log level of the worker |
| `MODO_SECOES` | `backend/app/core/config.py` (`section_mode`) | `sob_demanda` or `todas`: which BUs are collected |
| `TSE_AMBIENTE` | `backend/app/core/config.py` (`tse_environment`) | value stored in `elections.tse_environment` |

## Points of attention

- **Lost messages.** `queue.dequeue` removes the message before the job runs. A job that raises is logged and counted in `erro:<type>`, never retried.
- **Duplicate generation rolls back.** `ingest_result` calls `session.rollback()` when the snapshot exists. It is safe only because nothing is written before it in the result job.
- **Diagnostic written before the commit.** `ballot_box._ballot` writes `ok: true` inside the unit of work. If the commit fails, the error path overwrites the same key, so the final state is correct, but for a moment the diagnostic says ok.
- **Alerts for one office only.** `ballot_box._publish_ballot` evaluates the polling place alerts for `changed[0]` only. The other changed offices do not trigger them.
- **`runoff_election_code` is never stored.** `catalog._upsert_election` writes `None` and its `set_` does not include the column; the round-2 record is still created from the catalog event.
- **Candidates of other scopes are frozen.** Non-nationwide candidates use `ON CONFLICT DO NOTHING`, so their status and colour keep the first value written in this process or the database.
- **Silent drops in the hub.** A connection whose queue is full (2000) loses messages without telling the client; the client gets no gap signal. `Hub.subscribe` sends no current state, so a client needs the REST endpoints for the initial view.
- **Alerts query on every line.** `_alerts_result` loads all active alerts for each result line, including municipalities.
- **Divergence from `specs/05-architecture.md` (5.4, 5.5).** The spec names channels `res:`, `prog:`, `mapa:` and `eventos`; the code uses `results:`, `progress:`, `events:{round}` and no `mapa:` topic. The spec's WebSocket message (`topico`, `idg`, `totalizado_em`, `diff`, `sub`, `unsub`) is `{type, topic, seq, data}` with the full payload. `resume` does not replay from Redis Streams: it returns `resync`. The `status` topic exists in `ALWAYS_ACTIVE` but nothing publishes it.
- **Divergence from `specs/06-data-model.md`.** `boletim_votos`, `snapshot_candidato`, `snapshot_agremiacao` and `resultado_local_candidato` were not created: votes are JSONB columns. Polling place status values are English (`not_received`, `partial`, `tallied`), not the spec's Portuguese. The spec's `geom` columns are absent (lat/lon instead).
- **Stale docstring.** `backend/app/infra/realtime/topics.py` cites a frontend `topics.ts` that does not exist; `docs/refactoring-contract.md` (the other reference) does exist.
