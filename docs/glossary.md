# Domain glossary (pt-BR to en)

It maps every domain term of the product (Portuguese) to the name the code uses (English). The
product (UI text, screen URLs, error messages) stays in Portuguese. This version matches the code
as it is (checked 2026-10-22). Where the code still uses a Portuguese name, the row says so.

## Conventions

- **Python**: `snake_case` for functions, variables, modules and columns; `PascalCase` for classes.
- **TypeScript**: `camelCase` for functions, variables and object keys; `PascalCase` for components,
  types and interfaces. Component files are `PascalCase.tsx`. Other files are not uniform yet:
  `kebab-case.ts` (most of `frontend/src/lib/` and `frontend/src/modules/dashboards/`) and
  `camelCase.ts` (for example `frontend/src/modules/results/candidates-list/candidatesList.ts`).
- **Database**: tables are plural `snake_case` (`elections`, `polling_sections`); columns are
  `snake_case` and singular. Primary keys are `id` unless the natural key is the TSE id or the key is
  composite (`election_offices`, `polling_place_results`, `current_results`, `favorites`).
- **API routes**: kebab-case and plural resources (`/api/v1/polling-places`,
  `/api/v1/candidates/{tse_candidate_id}`). Action routes use a verb as the last segment
  (`/api/v1/admin/collector/pause`).
- **Error types**: `domain/reason`, all lowercase, `snake_case` reason. For not-found errors the domain
  is the table name (`dashboards/not_found`, `polling_places/not_found`); the other domains are words
  (`auth/invalid_credentials`, `geo_area/invalid`). The HTTP `detail` message stays in Portuguese (see
  the next section).
- **Acronym**: the TSE acronym is kept as `tse` (`tse_environment`, `tse_base_url`, package
  `backend/app/infra/tse/`).
- **Numbers and codes**: "number" is the ballot or sequence number of an item (`number`,
  `ballot_number`); "code" is an identifier issued by the TSE or the IBGE (`office_code`, `tse_code`,
  `ibge_code`).
- **Geographic level values**: `country`, `state`, `municipality`, `zone`, `polling_place`, `section`.
  The id of the country area stays `br`, as the TSE writes it (see Decision 1).

## Stays in Portuguese on purpose

These names do not change in the conversion.

**Screen URLs (frontend routes, `frontend/src/App.tsx`)**

`/`, `/p/:token`, `/tv`, `/paineis`, `/paineis/:id`, `/explorar`, `/explorar/:nivel`,
`/explorar/:nivel/:id`, `/mapas`, `/locais/:id`, `/secoes/:id`, `/secoes/:uf/:mun/:zona/:secao`,
`/candidatos`, `/candidatos/:sqcand`, `/eventos`, `/alertas`, `/conta`, `/entrar` (redirects to
`/conta`), `/admin`.

**UI text**: every label, title and message shown to the user (`LEVEL_LABELS` and
`LEVEL_PLURAL_LABELS` in `frontend/src/lib/geo-areas.ts`, widget titles, button texts, and the names
`Placar`, `Rosca`, `Hemiciclo` when displayed).

**Error `detail` messages** returned by the API, for example `e-mail já cadastrado`,
`JSON inválido`, `op desconhecida: {op}`, `modo congelado exige 'frozen_time'`. The error type
(`domain/reason`) is in English, the message is not.

**Environment variables and config values**: the variable names below stay. Config values such as
`oficial`, `simulado`, `fake`, `sob_demanda`, `todas` also stay.

**Environment variables** are read by `backend/app/core/config.py` (class `Settings`, through
`pydantic-settings`). Each field reads its variable through `validation_alias`: the variable name is the
server's and does not change, the field name is the code name. `validate_by_name` is on, so the field
name also works as an input name.

| Variable | Settings field | Default |
|---|---|---|
| `ENVIRONMENT` | `environment` | `local` (`local`, `production`, `test`) |
| `DATABASE_URL` | `database_url` | `postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes` |
| `REDIS_URL` | `redis_url` | `redis://redis:6379/0` |
| `TSE_AMBIENTE` | `tse_environment` | `fake` (`fake`, `simulado`, `oficial`) |
| `TSE_BASE_URL` | `tse_base_url` | `http://tse-fake:8080/oficial` |
| `TSE_MAX_RPS` | `tse_max_rps` | `90` |
| `TSE_CONCORRENCIA` | `tse_concurrency` | `16` |
| `TSE_VERIFICAR_JWS` | `tse_verify_jws` | `true` |
| `TSE_USAR_JWS` | `tse_use_jws` | `true` |
| `INTERVALO_CATALOGO` | `interval_catalog` | `60` (seconds) |
| `INTERVALO_PRINCIPAL` | `interval_main` | `10` (seconds) |
| `INTERVALO_ACOMPANHAMENTO` | `interval_follow_up` | `10` (seconds) |
| `INTERVALO_MIN_MUNICIPIO` | `interval_min_municipality` | `30` (seconds) |
| `COLETAR_SECOES` | `collect_sections` | `true` |
| `MODO_SECOES` | `section_mode` | `sob_demanda` (`sob_demanda`, `todas`) |
| `COLETAR_ZONAS` | `collect_zones` | `true` |
| `FILA_MAX` | `queue_max` | `3000` |
| `COLETOR_WORKERS_MUNICIPIO` | `collector_municipality_workers` | `8` |
| `COLETOR_WORKERS_SECAO` | `collector_section_workers` | `16` |
| `WORKER_CONCORRENCIA` | `worker_concurrency` | `4` |
| `TSE_FAKE_KID` | `tse_fake_kid` | `fake-eleicoes-dashboard` |
| `TSE_FAKE_CHAVE_PUBLICA` | `tse_fake_public_key` | empty |
| `TSE_FAKE_CONTROLE_URL` | `tse_fake_control_url` | `http://tse-fake:8080/_fake` |
| `LOCAIS_VOTACAO_URL` | `polling_places_url` | `http://tse-fake:8080/dadosabertos/eleitorado_local_votacao_2026.csv` |
| `DIR_BRUTOS` | `raw_dir` | `/data/brutos` |
| `DIR_CACHE_FOTOS` | `photo_cache_dir` | `/data/fotos` |
| `JWT_SECRET` | `jwt_secret` | none (required; 32+ bytes in production) |
| `JWT_EXPIRA_MIN` | `jwt_expire_min` | `10080` (minutes) |
| `CORS_ORIGINS` | `cors_origins` | `http://localhost:5173,http://localhost:8081` |
| `LOG_LEVEL` | `log_level` | `INFO` |
| `LOGIN_MAX_FAILURES` | `login_max_failures` | `5` |
| `LOGIN_WINDOW_SECONDS` | `login_window_seconds` | `900` |

The fake TSE reads four variables with `os.getenv` in `backend/tse_fake/main.py`; they are not
`Settings` fields: `FAKE_SEMENTE` (`2026`, seed), `FAKE_ESCALA` (`1.0`, scale), `FAKE_VELOCIDADE`
(`10`, clock speed), `FAKE_INICIO_MIN` (`-2`, start offset in minutes).

**Makefile targets** (`Makefile`): `help`, `env`, `up`, `up-oficial`, `dev`, `down`, `reset`, `logs`,
`ps`, `migrate`, `revision`, `test`, `test-unit`, `lint`, `format`, `types`, `docs`, `boundaries`,
`web-test`, `web-format`, `web-types`, `web-build`, `web-coverage`, `e2e`, `e2e-flows`, `mobile`,
`fake-status`, `fake-velocidade`, `fake-reiniciar`, `fake-ir`. The `fake-*` targets are Portuguese words
and stay as they are.

**TSE external data (formats that come from the TSE, not from us)**

These are the JSON keys and file layouts read by `backend/app/infra/tse/` (`parsers/`, `ballot_box.py`,
`catalog.py`, `urls.py`, `jws.py`, `keys.py`). They are read as they are. The code maps them to the
English code names in the tables below. The short keys must not be renamed in the parser.

Result file keys (EA20 `-u`, EA14 `-ab`, EA16 `-cs`, EA18 `-aux`), from `backend/app/infra/tse/parsers/`
(the format is described in `specs/02-tse-data-sources.md`):

| Key | Meaning |
|---|---|
| `ele` | election code |
| `t` | round (turno) |
| `f` | phase or environment: `s` simulado, `o` oficial |
| `dg`, `hg` | generation date and time of the file |
| `dt`, `ht` | tally date and time |
| `idg` | generation id, changes on every rewrite, equals the HTTP ETag. Key of the snapshot |
| `v.tv`, `v.vv`, `v.vb`, `v.vn` / `v.tvn` | total, valid, blank and null votes (`tvn` is read first) |
| `s.ts`, `s.st`, `s.pst` / `s.pstn` | sections total, tallied, percentage (2 decimals or full) |
| `e.te`, `e.est` | electorate: total, in tallied sections |
| `e.c`, `e.pc` / `e.pcn`, `e.a`, `e.pa` / `e.pan` | turnout and its percentage, abstention and its percentage |
| `tf` | final tally (`s`/`n`) |
| `md` | mathematically decided (`s`/`n`) |
| `and` | progress code (`f` finished, other values to confirm) |
| `munf`, `munpt`, `munnr` | municipalities finished, partial, not received |
| `tpabr`, `cdabr` | geographic type and code of the file scope |
| `agr`, `agr[].tp`, `agr[].vag`, `agr[].n`, `agr[].nm` | alliance list, type (`i` isolated), seats, number, name |
| `carg`, `cd` | office list and office code |
| `par` | party |
| `cand`, `cand[].n`, `cand[].sqcand`, `cand[].nm`, `cand[].nmu` | candidate list, ballot number, stable id, civil name, ballot name |
| `cand[].vap`, `cand[].pvap`, `cand[].pvapn` | votes, percentage (2 decimals or full) |
| `cand[].dvt` | vote destination (`Válido`, `Anulado`, `Anulado sub judice`) |
| `cand[].e`, `cand[].st` | elected (`s`/`n`) and status text (`Eleito`, `2º turno`, `Suplente`) |
| `vs` | vice and substitutes |
| `abr` | geographic scope list |
| `pl`, `cd`, `nm`, `ds`, `dt`, `tp`, `arq`, `dir`, `idg`, `uf`, `e`, `c`, `t` | catalog keys (`catalog.py`): event, code, name, description, date, type, file list, folder template |
| `ab`, `cm`, `cs`, `aux`, `ft`, `u`, `e` | file types in the URL templates |

Mixed-case or long keys in the BU (`.bu`) file, from `backend/app/infra/tse/ballot_box.py` (kept as they
are): `envelopeBoletimUrna`, `EntidadeBoletimUrna`, `EntidadeEnvelopeGenerico`, `tipoEnvelope`,
`dadosSecao`, `dadosSecaoSA`, `identificacaoSecao`, `identificacaoSecaoEleitoral`, `identificacao`,
`cabecalho`, `conteudo`, `secao`, `zona`, `municipio`, `municipioZona`, `local`, `urna`,
`numeroInternoUrna`, `numeroSerieFC`, `numeroSerieFV`, `tipoUrna`, `versaoVotacao`,
`identificadorGeradorMidia`, `serialCertificadoTPM`, `serialInstalacao`, `idPleito`, `idEleicao`,
`idEleitoral`, `dataHoraAbertura`, `dataHoraEncerramento`, `dataHoraCarga`, `dataHoraEmissao`,
`dataGeracao`, `codigoCarga`, `carga`, `codigoCargo`, `cargoConstitucional`, `cargoSemCandidato`,
`tipoCargo`, `historicoCodigosCarga`, `ordemGeracaoHash`, `ordemImpressao`, `qtdEleitoresAptos`,
`qtdEleitoresAptosSecao`, `qtdEleitoresAptosTTE`, `qtdEleitoresCompareceram`, `qtdComparecimento`,
`resultadosVotacao`, `resultadosVotacaoPorEleicao`, `totaisVotosCargo`, `votacaoUE`,
`votosVotaveis`, `ultimoHashVotosVotavel`, `assinaturaUltimoHashVotosVotavel`, `identificacaoVotavel`,
`tipoVoto`, `quantidadeVotos`, `codigo`, `nome`, `partido`, `legenda`, `nominal`, `branco`, `nulo`,
`correspondenciaResultado`, `tipoArquivo`, `hash`, `MOCK`, `oficial`, the office keys `presidente`,
`governador`, `senador`, `deputadoFederal`, `deputadoEstadual`, `deputadoDistrital`, `prefeito`,
`vereador`, `majoritario`, `proporcional`, and the office names `Presidente`, `Governador`, `Senador`,
`Deputado Federal`, `Deputado Estadual`, `Deputado Distrital`, `Prefeito`, `Vereador`.

Keys of the signed document (`backend/app/infra/tse/jws.py`): `alg` (`EdDSA`), `kid`, `typ` (`JOSE`).

TSE file layouts and URL templates (`backend/app/infra/tse/urls.py`, `catalog.py`,
`specs/02-tse-data-sources.md`):

| Layout | Example |
|---|---|
| Base | `https://resultados.tse.jus.br/oficial/ele2026/...` (cycle `ele2026`) |
| Municipalities (`cm`) | `config/mun-e{cd_eleicao:06}-cm.json` |
| Acompanhamento (`ab`) | `dados/{uf}/{uf}-e{cd_eleicao:06}-ab.json` |
| Resultado (`u`, `e`) | `dados/{uf}/{uf}{municipio:05}-z{zona:04}-c{cargo:04}-e{cd_eleicao:06}-{tipo}.json` |
| Fotos (`ft`) | `fotos/{uf}/{sqcand}.jpeg` |
| Configuração de seções (`cs`) | `arquivo-urna/{cd_pleito}/config/{uf}/{uf}-p{cd_pleito:06}-cs.json` |
| Auxiliar de seção (`aux`) | `arquivo-urna/{cd_pleito}/dados/{uf}/{municipio}/{zona}/{secao}/p{cd_pleito:06}-{uf}-m{municipio:05}-z{zona:04}-s{secao:04}-aux.json` |
| BU file | `arquivo-urna/.../{secao}/{hash}/{nome}` |
| Dados Abertos (locais) | `dadosabertos/eleitorado_local_votacao_2026.csv` or `.zip` |
| Control of the TSE (fake only) | `_fake/estado`, `_fake/controle` |

Other TSE values: the signing key environments `oficial`, `simulado`, `fake` (`keys.py`), the office
names above, the district and section ids in the file names (`sp71072`, `sp71072-z0001`,
`sp71072-z0001-l1015`, `sp71072-z0001-s0120`), and the TSE ballot ids such as `sqcand`.

**Fake TSE external URLs and paths** (`backend/tse_fake/main.py`, mimicking the TSE):
`/oficial/comum/config/ele-c.{ext}`, `/oficial/ele2026/{election}/config/{file}`,
`/oficial/ele2026/{election}/dados/{uf}/{file}`, `/oficial/ele2026/{election}/fotos/{uf}/{file}`,
`/oficial/ele2026/arquivo-urna/{election_event}/config/{uf}/{file}`,
`/oficial/ele2026/arquivo-urna/{election_event}/dados/{uf}/{mun}/{zona}/{secao}/{file}`,
`/dadosabertos/eleitorado_local_votacao_2026.csv`. Fake-only paths (not TSE): `/_fake/estado`,
`/_fake/controle`, `/saude`. The service name `tse-fake` stays in the docker-compose files and in the URLs.

**Other fixed names**: the Docker service names (`db`, `redis`, `tse-fake`, `api`, `web`), and the
Alembic migration `backend/alembic/versions/0001_inicial.py` (the file name is part of history).

---

## Tables by area

Columns are `Term (pt-BR) | Code name (en) | Meaning`. For a table, the "Code name" is the table name.
For a column, the "Code name" is the column name. Tables keep the TSE acronyms only when the TSE uses
them. The `round`, `office_code` and `state_code` columns (for `uf`) are the same in every table that
has them.

### Electoral system

Table `eleicao` is `elections` (model `Election`). Table `eleicao_cargo` is `election_offices`
(model `ElectionOffice`).

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| pleito | `election_event` | One election day (one date). A pleito can hold several elections. Column `cd_pleito` is `election_event_code` |
| eleição | `election` | An election inside a pleito (federal, state, municipal). Table `elections` |
| turno | `round` | First or second round (`round` in SQL is allowed) |
| cargo | `office` | An office being contested (President, Governor, Senator, deputy). Table `election_offices` |
| sistema (majoritário / proporcional) | `voting_system` | Values `majoritario`, `proporcional`: still Portuguese in code (see Decisions) |
| abrangência | `coverage` | Geographic coverage of an office (`br` for President, UF for governor) |
| vagas | `seats` | Seats to fill (proportional) |
| código do cargo (`cd_cargo`) | `office_code` | TSE office code (1, 3, 5, 6, 7, 8) |
| código da eleição (`cd_eleicao`) | `election_code` | TSE election code |
| `cd_eleicao_t2` | `runoff_election_code` | Election code of the second round |
| `cd_pleito` | `election_event_code` | TSE code of the pleito |
| ambiente | `tse_environment` | Source environment: `fake`, `simulado`, `oficial` |
| ciclo | `cycle` | Electoral cycle, for example `ele2026` |
| tipo (eleição) | `jurisdiction` | Values `federal`, `estadual`, `municipal` (as in TSE) |
| nome (eleição) | `name` | Name of the election (`elections.name`) or of the office (`election_offices.name`) |
| data | `date` | Date of the election (stored as `YYYY-MM-DD` text) |
| `eleicao_cargo.eleicao_id` | `election_id` | Foreign key to `elections` |

### Geography

Tables: `states`, `municipalities`, `electoral_zones`, `polling_places`, `polling_sections` (models in
`backend/app/modules/geography/models.py`).

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| UF (unidade federativa) | `state` | Brazilian state or the Federal District. Table `states`, column `code` is the two-letter code (`sp`, `rj`) |
| região | `region` | Region of the country (`sudeste`, ...) |
| município | `municipality` | Municipality. Table `municipalities` |
| id do município | `id` | Id with the format `sp71072` (state code + 5-digit TSE code) |
| `cd_tse` | `tse_code` | TSE code of the municipality |
| `cd_ibge` | `ibge_code` | IBGE code of the municipality |
| capital | `is_capital` | State capital (boolean) |
| `lat`, `lon` | `lat`, `lon` | Coordinates (degrees) |
| eleitorado (município) | `electorate` | Number of eligible voters |
| zona eleitoral | `electoral_zone` | Electoral zone inside a municipality. Table `electoral_zones`; id `sp71072-z0001`, column `number` |
| local de votação (colégio) | `polling_place` | Building where sections vote. Table `polling_places`, id `sp71072-z0001-l1015`. "colégio" is the informal name used in text |
| endereço, bairro, CEP | `address`, `neighborhood`, `zip_code` | Address, neighborhood, postal code |
| `aproximado` | `is_approximate` | Position is approximate (boolean) |
| eleitores aptos (local, seção) | `eligible_voters` | Eligible voters in the polling place or section (see Decisions) |
| qtd. de seções (local) | `section_count` | Number of sections in the polling place |
| seção eleitoral | `polling_section` | Section (urna). Table `polling_sections`, id `sp71072-z0001-s0120`, column `number` |
| `secao.local_id` | `polling_place_id` | Foreign key to `polling_places` (may be null) |
| `secao.agregadora` | `aggregator_section` | Aggregating section number (when it exists) |
| recorte | `geo_area` | A geographic slice used in queries, URLs and results: a level plus an id (for example `sp` or `sp71072-z0001`). Code: package `backend/app/modules/geography/geo_area/`, class `GeoArea`, column `geo_area_id` |
| recorte pai | `parent_id` | Id of the geo area one level up |
| nível | `level` | `country` (`br`), `state` (`uf`), `municipality`, `zone`, `polling_place` (`local`), `section` (`secao`) |

### Candidates and parties

Table `candidato` is `candidates` (model `Candidate`). Parties and alliances are columns of
`candidates`; there is no table for them.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| candidato | `candidate` | A candidate in an election. Table `candidates` |
| `sqcand` | `tse_candidate_id` | Stable id given by the TSE (photo file names, API path) |
| número (urna) | `ballot_number` | Ballot number of the candidate (Decision 5) |
| nome | `name` | Civil name |
| nome de urna | `ballot_name` | Name shown on the ballot |
| partido (sigla) | `party_abbreviation` | Party abbreviation |
| partido (número) | `party_number` | Party ballot number |
| agremiação | `alliance` | Isolated party or coalition, as the TSE writes it (`i` is isolated) |
| cor | `color` | Color used for the candidate in charts (hex) |
| vices e suplentes | `vice_and_substitutes` | JSONB list of `{nome, tipo}`; `tipo` is `vice` or `suplente` (still Portuguese in code) |
| situação geral | `overall_status` | Status of the candidate. Values: `ELECTED`, `RUNOFF`, `MATHEMATICALLY_ELECTED`, `LEADING`, `SUBSTITUTE`, `NOT_ELECTED`, `SUB_JUDICE`, `COUNTING` (`modules/elections/status/rules.py`) |
| eleito | `elected` | Elected (boolean) |
| atualizado em | `updated_at` | Last update |
| foto | `photo_url` | Photo URL in the API, served by `/candidates/{tse_candidate_id}/photo` |

### Results and counting

Tally (apuração / totalização) is the process of adding each section's ballot box report to the
official total; in this system the two Portuguese words name the same process (`tally`). Snapshot
tables keep the history; "current" tables keep the latest state. Models: `backend/app/modules/results/models.py`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| apuração, totalização | `tally` | The counting process, and adding a section to the official total (modules `results/ingestion/tally.py`, `results/queries/tally/`) |
| totalizado | `tallied` | Has been added to the tally (value of `polling_place_results.status`) |
| totalizado em | `tallied_at` | Official time of the tally (the time axis for history) |
| totalização final | `final_tally` | Final tally flag (`tf`) |
| resultado | `result` | A result line for a geo area, election and office |
| snapshot (histórico) | `result_snapshots` | Table of one row per new version of a result. Progress: `progress_snapshots` |
| estado atual | `current_results` | Latest result per area. Progress: `current_progress` |
| capturado em | `captured_at` | When this system fetched the data |
| verificado por JWS | `jws_verified` | The data passed the JWS signature check |
| fonte, arquivo | `source`, `source_file` | Source of the data (`tse`), name of the TSE file the line came from |
| eleitorado apurado | `tallied_electorate` | Eligible voters in tallied sections |
| seções (total, totalizadas) | `sections_total`, `sections_tallied` | Sections in the geo area and already tallied |
| % de seções | `pct_sections` | Percentage of sections tallied |
| comparecimento, % comparecimento | `turnout`, `pct_turnout` | Voters who showed up, and its percentage |
| abstenção, % abstenção | `abstention`, `pct_abstention` | Eligible voters who did not vote, and its percentage |
| votos (total, válidos) | `total_votes`, `valid_votes` | Total votes (valid + blank + null), valid votes (nominal and legend) |
| % válidos | `pct_valid` | Percentage of valid votes |
| brancos, % brancos | `blank_votes`, `pct_blank` | Blank votes and its percentage |
| nulos, % nulos | `null_votes`, `pct_null` | Null votes and its percentage |
| matematicamente definido | `mathematically_decided` | The result cannot change any more (TSE `md`) |
| líder | `leader_candidate_id`, `leader_votes`, `leader_pct`, `leader_party` | First-placed candidate (TSE `lider_*` columns) |
| segundo colocado | `second_candidate_id`, `second_votes`, `second_pct` | Second-placed candidate |
| margem (pontos percentuais) | `margin_pp` | Gap between the first and second place, in percentage points |
| candidatos (JSON) | `candidates` | Candidate lines inside a result (JSONB keys `sq`, `v`, `p`, `e`, `st`, `d`, as the TSE writes them) |
| agremiações (JSON) | `alliances` | Alliance lines inside a result (JSONB keys `nome`, `partidos`, `v`, `vag`) |
| andamento | `progress_code` | TSE progress code (`and`) |
| municípios finalizados, parciais, não recebidos | `municipalities_completed`, `municipalities_partial`, `municipalities_not_received` | Municipalities with the final tally, partial tally, no data yet |
| id da geração (`idg`) | `generation_id` | TSE id of a file generation (changes on each rewrite). Part of the snapshot key |

### Ballot box reports and sections

A ballot box report (boletim de urna, BU) is the printed result of one section, decoded from the
`.bu` file published by the TSE (`backend/app/infra/tse/ballot_box.py`). Model `BallotBoxReport`,
table `ballot_box_reports`. Table `polling_place_results` (model `PollingPlaceResult`) is the sum of the
BUs of one polling place.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| boletim de urna (BU) | `ballot_box_report` | Result of one section (one urna). Table `ballot_box_reports` |
| `boletim_urna.secao_id` | `polling_section_id` | Section of the report |
| `boletim_urna.local_id` | `polling_place_id` | Polling place of the report (may be null) |
| `boletim_urna.zona_id`, `municipio_id` | `electoral_zone_id`, `municipality_id` | Zone and municipality of the report |
| hash | `hash` | Hash of the BU file |
| status (BU) | `status` | Status of the report as published by the TSE |
| emitido em | `issued_at` | When the BU was issued by the urna |
| assinatura OK | `signature_valid` | The signature of the BU was verified (may be null) |
| url | `url` | Source URL of the BU file |
| votos (JSONB) | `votes` | Votes per office, key `"1"` is the President: `comp`, `b`, `n`, `nom`, `leg` (nominal and party votes by ballot number) |
| local de votação (agregado) | `polling_place_results` | Sum of the BUs of a polling place |
| seções (total do local) | `sections_total` | Sections of the polling place |
| seções totalizadas (local) | `sections_tallied` | Sections of the polling place already tallied |
| status do local | `status` | `not_received`, `partial`, `tallied` (values of `polling_place_results.status`; in English since migration 0002) |
| votos (local, JSONB) | `votes` | Same format as the BU `votes`, summed |

### Collector and worker

The collector (`coletor`) polls the TSE and puts the files on a queue. The worker consumes the queue,
parses the files and writes the database.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| coletor | `collector` | Process that fetches the TSE files on a schedule. Class `Collector` (`backend/app/collector/collector.py`) |
| fila | `queue` | Redis lists in `backend/app/infra/queue/`: `queue:files` (the rest), `queue:priority` (national and state totals, tracking, open municipalities), `queue:pending` |
| trabalhador (worker) | `worker` | Process that consumes the queue and writes results. `backend/app/worker/` |
| tarefa (job) | `job` | Handler for one file type. Package `backend/app/worker/jobs/` |
| processador | `Processor` | Class that handles one message of the queue (`worker/jobs/processor.py`) |
| catálogo | `catalog` | List of TSE files and elections (`infra/tse/catalog.py`, `collector/steps/catalog.py`) |
| acompanhamento | `tracking` | Tracking files: progress by UF and municipality (`collector/steps/tracking.py`, `tracking_cycle`) |
| principal | `primary` | The main results feed (`primary_cycle` in `collector/steps/results.py`). The loop label is still `"principal"` in `collector/collector.py` |
| resultados (coletor) | `results` | `collector/steps/results.py` (class `ResultSteps`) |
| seções (coletor) | `sections` | `collector/steps/sections.py`. Collects section configuration and BUs |
| demanda | `demand` | On-demand section fetching: `collector/steps/demand.py` (`on_demand_cycle`) |
| sob demanda | `on_demand` | Section mode: only fetch the polling places opened in the dashboard or with an active alert. Config value `sob_demanda` stays |
| todas (seções) | `all` | Section mode: scan all sections. Config value `todas` stays |
| modo de seções | `section_mode` | Setting `MODO_SECOES` |
| intervalo | `interval_catalog`, `interval_main`, `interval_follow_up`, `interval_min_municipality` | Seconds between runs (see the environment variables) |
| coletar zonas, coletar seções | `collect_zones`, `collect_sections` | Settings `COLETAR_ZONAS`, `COLETAR_SECOES` |
| requisição | `request` | `collector/steps/request.py` (class `RequestSteps`). HTTP request to the TSE |
| buscador (fetcher) | `fetcher` | `collector/fetcher.py`, class `Fetcher`, with the rate limit `TokenBucket` |
| métricas | `Metrics` | Class in `collector/fetcher.py`; Redis hash `worker:metrics`, written by `worker/main.py` (`ok:<type>`, `erro:<type>` counters) |
| município (coletor) | `municipality` | Municipality as a unit of collection (`backend/app/data/municipalities.json`) |
| coleta | `collection` | One run of the collector |
| dados brutos | `raw_dir` | Raw files folder (`DIR_BRUTOS`) |
| cache de fotos | `photo_cache_dir` | Photo cache folder (`DIR_CACHE_FOTOS`) |
| pausar / retomar | `pause` / `resume` | Admin actions for the collector (`pause_collector`, `resume_collector`) |

### Real-time

Topic names and the hub are in `backend/app/infra/realtime/` (`topics.py`, `hub.py`, classes `Hub` and
`Connection`). The frontend has the same names in `frontend/src/modules/realtime/topics.ts`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| tópico | `topic` | A subscription key (for example `results:1:1:country:br`) |
| tópicos ativos (`ws:topicos`) | `ws:topics` | Redis sorted set of topics with viewers (score = expiry). Functions `register_active`, `active`, `is_active` |
| publicação | `publish` | Function `publish` sends a message on the Redis channel `pub:{topic}` (prefix `pub:` kept: it is the wire name) |
| resultados (topic) | `results` | `results:{round}:{office}:{level}:{id}` |
| filhos (topic) | `children` | `children:{round}:{office}:{level}:{id}[:{child_level}]` (children of a geo area) |
| locais (topic) | `polling_places` | `polling_places:{round}:{office}:{municipality}` |
| eventos (topic) | `events` | `events:{round}` |
| progresso (topic) | `progress` | `progress:{round}` |
| status (topic) | `status` | Topic `status` (always on) |
| usuário (topic) | `user` | `user:{id}` (always on for the session) |
| operação (ws `op`) | `op` | Client to server: `subscribe`, `unsubscribe`, `auth`, `ping`, `resume` |
| mensagem (ws `type`) | `type` | Server to client: `auth`, `pong`, `resync` (answer to `resume`), `error` |
| mensagem (ws `message`) | `message` | Error text (Portuguese text stays in the message, for example `JSON inválido`) |
| fields of a topic message | `type`, `topic`, `seq`, `data` | Message envelope; `data` is the payload |
| evento (feed) | `event` | An event of the results feed. Table `events`, model `Event` |
| tipo (evento) | `type` | `start`, `milestone`, `lead_change`, `elected`, `mathematically_decided`, `runoff` (values in English since migration 0002) |
| ocorrido em, criado em | `occurred_at`, `created_at` | When the event happened (official time), when the row was written |
| título, descrição | `title`, `description` | Event title and description (shown in the UI, Portuguese text) |
| payload | `payload` | Extra data of the event (JSONB). Keys in English since migration 0004 (`tse_candidate_id`, `milestone`, ...) |
| alerta (tipo) | `type` | `candidate_pct`, `tally_threshold`, `lead_change`, `elected`, `polling_place_tallied` |
| parâmetros do alerta | `params` | JSONB in `alerts.params`, keys `office_code`, `level`, `geo_area_id`, `tse_candidate_id`, `threshold`, `polling_place_id` (migration 0003) |
| ativo (alerta) | `active` | Alert is enabled (boolean) |
| disparado em | `triggered_at` | When the alert last fired |

### Users, dashboards (painéis), widgets, favorites

Table `usuario` is `users`. Table `preferencia` is `preferences`. Table `painel` is `dashboards`.
Table `compartilhamento` is `shares`. Table `favorito` is `favorites`. Table `alerta` is `alerts`.
Models: `backend/app/modules/accounts/models.py` and `backend/app/modules/alerts/models.py`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| usuário | `user` | A registered person. Table `users` |
| e-mail | `email` | Unique login (`String` in the model) |
| nome | `name` | Name of the user |
| senha (hash) | `password_hash` | Hashed password |
| administrador | `is_admin` | Admin flag |
| criado em, atualizado em | `created_at`, `updated_at` | Creation and update time (`Timestamps` in `backend/app/core/db.py`) |
| preferências | `preferences` | Table `preferences`: one JSON document per user |
| `preferencia.dados` | `data` | JSONB with the keys `theme`, `density`, `animations`, `candidate_colors`, `notifications` (keys in English since migration 0003) |
| tema, densidade (values) | `theme`, `density` values | `escuro`, `claro`, `auto`; `confortavel`, `compacta`: still Portuguese in code (see Decisions) |
| notificações (keys) | `notifications` | `lead_change`, `elected`, `milestone` |
| painel | `dashboard` | A saved set of widgets. Table `dashboards` |
| ordem (painel) | `position` | Order in the list of dashboards |
| padrão | `is_default` | Default dashboard flag |
| versão do schema | `schema_version` | Version of the dashboard JSON schema |
| configuração (painel) | `config` | JSONB with the dashboard definition (see below) |
| compartilhamento | `share` | A public link to a dashboard. Table `shares` |
| token | `token` | Public token of the share (URL `/p/:token` stays) |
| modo | `mode` | `live` (`ao_vivo`) or `frozen` (`congelado`), in English since migration 0002 |
| tempo (compartilhamento) | `frozen_time` | Time the frozen share shows |
| favorito | `favorite` | A saved candidate, geo area, polling place or section. Table `favorites` |
| tipo (favorito) | `type` | `candidate`, `geo_area`, `polling_place`, `section` |
| ref (favorito), rótulo | `ref`, `label` | Id of the favorite item, and the label shown for it |
| alerta | `alert` | A rule that notifies the user. Table `alerts`. Its `type` is in the Real-time section |
| widget | `widget` | A tile on a dashboard. Folder `frontend/src/modules/dashboards/widgets/` |
| tipo (widget) | `type` | Stored id, still Portuguese in the saved JSON (Decision 8): `placar` (scoreboard), `totais` (totals), `kpi`, `mapa` (map), `evolucao` (evolution), `tabela` (table), `comparativo` (comparison), `hemiciclo` (hemicycle), `rosca` (donut), `heatmap`, `eventos` (events), `candidato` (candidate), `local` (polling place), `secao` (section), `relogio` (clock), `texto` (text) |
| posição (widget) | `pos` | Grid position `{x, y, w, h}` (JSON key) |
| herda (widget) | `herda` | The widget inherits the global filter (JSON key) |
| filtro global | `filtroGlobal` | Dashboard-level filter (JSON key) |
| filtros (widget) | `filtros` | Widget-level filter (JSON key) |
| configuração (widget) | `config` | Widget settings (JSON key) |
| nível dos filhos | `nivelFilhos` | Key in the widget config |
| métrica, eixo X | `metrica`, `eixoX` | Keys in the widget config (for example `metrica: "lider"`, `eixoX: "pct_secoes"`) |
| filtro efetivo | `effective_filter` | Filter after merging the global one and the widget one (`frontend/src/lib/effective-filter.tsx`) |
| gaveta de widgets, gaveta de config | `WidgetDrawer`, `ConfigDrawer` | Side panels to add and configure widgets (`frontend/src/modules/dashboards/panels/`) |
| grade | `Grid` | Layout grid (`frontend/src/modules/dashboards/grid/Grid.tsx`) |
| modelo (template) | `templates` | Ready-made dashboards: `frontend/src/modules/dashboards/templates.ts` (`TEMPLATES`) |
| editor | `editor` | Dashboard editor state (`frontend/src/modules/dashboards/editor.ts`) |
| ver painel | `DashboardView` | Read-only view (`frontend/src/modules/dashboards/view/DashboardView.tsx`) |

Dashboard JSON (`dashboards.config`): the keys are `id`, `nome`, `schemaVersion`, `filtroGlobal`,
`widgets`, `layouts`; each widget has `id`, `tipo`, `pos`, `config`, `filtros`, `herda`. The schema is
`frontend/src/modules/dashboards/schema.ts`. Renaming these keys requires a `schemaVersion` bump and a
read path for the old format (see Decision 8).

### Fake TSE

Folder `backend/tse_fake/`. It mimics the TSE files with a simulated clock and a scenario.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| tse-fake (mock do TSE) | `tse_fake` | Mock service that serves TSE-like files. Docker service name `tse-fake` stays |
| cenário | `Scenario` | Package `backend/tse_fake/scenario/` (class `Scenario` in `core.py`): the generated election |
| cargo proporcional | `ProportionalOffice` | Class in `scenario/model.py` |
| partido | `Party` | Class in `scenario/model.py` |
| candidato | `Candidate` | Class in `scenario/model.py` |
| cargo UF | `StateOffice` | Class in `scenario/model.py` |
| município | `Municipality` | Class in `scenario/model.py` |
| zona | `Zone` | Class in `scenario/model.py` |
| local | `PollingPlace` | Class in `scenario/model.py` |
| dados | `data` | Module `backend/tse_fake/data.py`; `state_seats(...)` gives the seats of a state |
| chave | `key` | Module `backend/tse_fake/key.py` (`private_key_fake()`, `public_key_fake()`) |
| divulgação | `publication` | Package `backend/tse_fake/publication/` (class `Publication`): publishes the generated TSE files on a clock |
| controle | `/_fake/controle` | `POST` endpoint that changes the fake clock and scenario |
| estado | `/_fake/estado` | `GET` endpoint with the state of the mock |
| velocidade | `speed` | `FAKE_VELOCIDADE`, the speed of the simulated clock (class `Clock` in `main.py`) |
| início (min) | `start_offset_min` | `FAKE_INICIO_MIN` |
| semente | `seed` | `FAKE_SEMENTE` |
| escala | `scale` | `FAKE_ESCALA` |

---

## Code layout

The code is grouped by the folders below. Old Portuguese module names map to the names in the tables
above. The folders listed in `[tool.docs-coverage]` of `backend/pyproject.toml` must stay documented.

### Backend

| Folder | Code name (en) | Meaning |
|---|---|---|
| `backend/app/core/` | `core` | `config.py` (`Settings`), `db.py` (`Base`, `Timestamps`), `redis.py`, `security.py` (tokens), `deps.py`, `errors.py`, `models.py` (imports all models for Alembic), `main.py` (app factory, routers under `/api/v1`), `log/`, `health/` (`/health`, outside `/api/v1`) |
| `backend/app/infra/tse/` | `infra/tse` | TSE formats: `urls.py`, `catalog.py`, `jws.py`, `keys.py`, `ballot_box.py` (with `asn1/bu.asn1`), `numbers.py`, `parsers/` (`common`, `auxiliary`, `municipalities`, `results`, `sections`, `tracking`) |
| `backend/app/infra/queue/` | `infra/queue` | Redis queue: `enqueue`, `dequeue`, `size`, `low_priority_size` |
| `backend/app/infra/realtime/` | `infra/realtime` | Real-time hub and topic names: `hub.py`, `topics.py` |
| `backend/app/modules/accounts/` | `modules/accounts` | Users and personal data: `auth/`, `dashboards/`, `favorites/`, `preferences/`, `routes.py`, `schemas.py`, `models.py` |
| `backend/app/modules/admin/` | `modules/admin` | Admin API: `fake_tse/`, `health/`, `routes.py`, `schemas.py` |
| `backend/app/modules/alerts/` | `modules/alerts` | Alerts: `evaluation/` (`rules.py`, `triggers.py`, `cache.py`), `records/`, `routes.py`, `schemas.py`, `models.py` |
| `backend/app/modules/ballot_reports/` | `modules/ballot_reports` | Ballot box reports: `demand/registry.py`, `models.py` |
| `backend/app/modules/elections/` | `modules/elections` | Elections, offices, candidates: `colors/` (`palette.py`, `resolve.py`), `status/rules.py`, `models.py` |
| `backend/app/modules/events/` | `modules/events` | Event detection: `detection.py`, `models.py` |
| `backend/app/modules/geography/` | `modules/geography` | Geography: `geo_area/` (`area.py`, `ids.py`), `deps.py`, `models.py` |
| `backend/app/modules/public/` | `modules/public` | Public read-only API: `candidates/`, `demand/`, `diagnostics/`, `exports/`, `polling_places/`, `realtime/websocket.py`, `results/`, `status/`, `routes.py`, `schemas.py` |
| `backend/app/modules/results/` | `modules/results` | Results: `ingestion/` (catalog, candidates, geography, ballot reports, progress, results, tally), `queries/` (`tally/`, `children/`, `polling/`, `events.py`, `search.py`), `models.py` |
| `backend/app/collector/` | `collector` | `collector.py` (class `Collector`), `fetcher.py`, `main.py`, `steps/` (`base`, `catalog`, `demand`, `request`, `results`, `sections`, `tracking`) |
| `backend/app/worker/` | `worker` | `main.py` (consumers), `jobs/` (`processor.py`, `ballot_box.py`, `diagnostics.py`, `publishing.py`, `result.py`, `shared.py`, `tracking.py`) |
| `backend/app/data/` | `data` | `municipalities.json` (municipality list) |
| `backend/alembic/versions/` | `alembic/versions` | Migrations `0001` to `0004`. The file names are part of history |
| `backend/tse_fake/` | `tse_fake` | Mock of the TSE: `main.py`, `data.py`, `key.py`, `scenario/`, `publication/` |
| `backend/tools/` | `tools` | Project checks: docs_coverage.py, function_size.py, openapi.py |

### Frontend

| Folder | Code name (en) | Meaning |
|---|---|---|
| `frontend/src/routes/` | `routes` | One component per screen URL: `DashboardPage.tsx`, `DashboardsPage.tsx`, `ExplorePage.tsx`, `MapsPage.tsx`, `PollingPlacePage.tsx`, `PollingSectionPage.tsx`, `CandidatesPage.tsx`, `CandidatePage.tsx`, `EventsPage.tsx`, `AlertsPage.tsx`, `AccountPage.tsx`, `AdminPage.tsx`, `SharedPage.tsx`, `TvPage.tsx`, `HomePage.tsx`, `NotFoundPage.tsx` |
| `frontend/src/modules/accounts/` | `accounts` | Login, account and preferences: `components/`, `store.ts` (browser favorites), `hooks.ts` |
| `frontend/src/modules/admin/` | `admin` | Admin screen: collector and fake TSE cards |
| `frontend/src/modules/alerts/` | `alerts` | Alerts screen and table, `rules.ts` |
| `frontend/src/modules/charts/` | `charts` | Charts: `Donut.tsx`, `Hemicycle.tsx`, `Evolution.tsx`, `ProgressHeatmap.tsx`, `EChart.tsx`; options in the `*Option.ts` files; `echarts.ts` |
| `frontend/src/modules/dashboards/` | `dashboards` | Dashboards: `screens/`, `grid/`, `panels/`, `modals/`, `view/`, `widgets/`, `shared/`, `schema.ts`, `repo.ts`, `editor.ts`, `templates.ts` |
| `frontend/src/modules/events/` | `events` | Event feed: `EventFeed.tsx`, `EventsScreen.tsx` |
| `frontend/src/modules/maps/` | `maps` | Electoral map: `ElectoralMap.tsx`, `Legend.tsx`, `MapCanvas.tsx`, the `map*.ts` helpers and the `use*.ts` hooks |
| `frontend/src/modules/polling-places/` | `polling-places` | Polling place screen and detail |
| `frontend/src/modules/realtime/` | `realtime` | WebSocket: `socket.ts`, `topics.ts`, `apply.ts` (applies messages to the stores), `useLive.ts` |
| `frontend/src/modules/results/` | `results` | Results: `scoreboard/` (`Scoreboard.tsx`), `explore/`, `geo-area-table/`, `candidate-page/`, `candidates-list/`, `components/` (`CandidateCard.tsx`, `TotalsBlock.tsx`, `StatusBadge.tsx`, `DataSource.tsx`, `WithResults.tsx`, ...) |
| `frontend/src/modules/sections/` | `sections` | Section screen and detail |
| `frontend/src/modules/shell/` | `shell` | Layout: `Navbar.tsx`, `Header.tsx`, `AppLayout.tsx`, `FilterBar.tsx`, `Search.tsx`, `TimeSlider.tsx`, `LiveIndicator.tsx`, `Selectors.tsx` |
| `frontend/src/api/` | `api` | `client.ts` (HTTP client), `models.ts` (DTO types from the OpenAPI schema), `query-keys.ts`, `types.ts` |
| `frontend/src/components/` | `components` | Shared components: `Num.tsx`, `States.tsx` (loading, empty and error states) |
| `frontend/src/lib/` | `lib` | Stores (`auth-store.ts`, `filter-store.ts`, `time-store.ts`, `ui-store.ts`, `prefs-store.ts`), `geo-areas.ts`, `offices.ts`, `palettes.ts` and `palettes/`, `useColor.ts`, `effective-filter.tsx`, `formatting.ts`, `time.ts`, `export.ts` |
| `frontend/src/App.tsx`, `AppProviders.tsx`, `main.tsx` | same | Router, providers and entry point |

### API routes

Prefix `/api/v1`, except the health route `/health` (outside `/api/v1`). Route modules are in
`backend/app/modules/` (one `routes.py` per module, `public/routes.py` for the public API); the OpenAPI document is at
`/api/openapi.json`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| `/status` | `/status` | Global status of the collector and the data |
| `/eleicoes` | `/elections` | Elections and offices |
| `/resultados` | `/results` | Results for a geo area |
| `/resultados/serie` | `/results/series` | Time series of a result |
| `/recortes/filhos` | `/geo-areas/children` | Child geo areas |
| `/progresso` | `/progress` | Count progress |
| `/mapas/locais` | `/maps/polling-places` | Polling place states for the map |
| `/locais/{local_id}` | `/polling-places/{polling_place_id}` | Polling place detail |
| `/diagnosticos/locais/{id}` | `/diagnostics/polling-places/{polling_place_id}` | Polling place diagnostics |
| `/secoes/{secao_id}` | `/polling-sections/{polling_section_id}` | Section detail |
| `/candidatos` | `/candidates` | Candidates list |
| `/candidatos/{sqcand}` | `/candidates/{tse_candidate_id}` | Candidate detail |
| `/candidatos/{sqcand}/foto` | `/candidates/{tse_candidate_id}/photo` | Photo (old `/fotos/{sqcand}`) |
| `/busca` | `/search` | Search |
| `/eventos` | `/events` | Events feed |
| `/linha-do-tempo` | `/timeline` | Timeline |
| `/export` | `/exports` | Export; the query parameter is `resource` (old `recurso`) |
| `/ws` | `/ws` | WebSocket |
| `/api/saude` | `/health` | Health of the database and Redis, at the root, outside `/api/v1` |
| `/admin/saude` | `/admin/health` | Health (admin) |
| `/admin/coletor/pausar` | `/admin/collector/pause` | Pause the collector |
| `/admin/coletor/retomar` | `/admin/collector/resume` | Resume the collector |
| `/admin/fake` | `/admin/fake-tse` | Fake TSE state (`GET`) and control (`POST`) |
| `/auth/registro` | `/auth/register` | Register |
| `/auth/login` | `/auth/login` | Login |
| `/auth/me` | `/auth/me` | Current user |
| `/paineis` | `/dashboards` | Dashboards |
| `/paineis/{pid}` | `/dashboards/{dashboard_id}` | One dashboard |
| `/paineis/{pid}/compartilhar` | `/dashboards/{dashboard_id}/shares` | Create a share |
| `/compartilhados/{token}` | `/shared/{token}` | Read a share |
| `/favoritos` | `/favorites` | Favorites |
| `/favoritos/{tipo}/{ref}` | `/favorites/{type}/{ref}` | Delete a favorite |
| `/alertas` | `/alerts` | Alerts |
| `/alertas/{aid}` | `/alerts/{alert_id}` | One alert (`PUT`, `DELETE`) |
| `/preferencias` | `/preferences` | Preferences |

Note: the screen URLs keep `/paineis` in the frontend (see "Stays in Portuguese").

---

## Decisions (reviewed 2026-10-22)

1. **Geographic level values**: `country` in code and in the database. The id of the country area stays
   `br`, as the TSE and the API default write it. Dashboards saved with the old values (`br`, `uf`,
   `municipio`, `zona`, `local`, `secao`) are still read (`LEGACY_LEVELS` in
   `frontend/src/modules/dashboards/schema.ts`).
2. **Stored enum values** (`situacao`, `status`, share `mode`, alert type, event type, favorite type)
   were renamed to English **by migration** `0002_english_names.py` (with `downgrade`); API and frontend
   changed in the same deploy. Not renamed yet: the `voting_system` values (`majoritario`,
   `proporcional`) and the preference values (see item 16).
3. **`pleito` → `election_event`.**
4. **`recorte` → `geo_area`.**
5. **Candidate number → `ballot_number`**; other numbers (`secao.numero`, `zona.numero`) → `number`.
6. **`agremiação` → `alliance`.**
7. **Redis topics and WebSocket fields** are English: `backend/app/infra/realtime/topics.py` and
   `frontend/src/modules/realtime/topics.ts` change together (internal wire, deployed together).
8. **Dashboard JSON stored in `dashboards.config`** (`filtroGlobal`, `herda`, `nivelFilhos`, widget type
   ids such as `placar`, `schemaVersion`, ...) and shared links keep their saved format: it is user data
   (database, shared links, `localStorage`), an outside consumer. Only the code identifiers that read it
   change. Migration `0003` does not touch `dashboards.config`.
9. **`sqcand` → `tse_candidate_id`** in code; the TSE key stays `sqcand`.
10. **`fake-*` Makefile targets and the `tse-fake` service** keep their names (people type them).
11. **Variables read with `getenv` outside `Settings`** move into `Settings`, read by alias with the
    same variable name. Done for `COLETOR_WORKERS_*` and `WORKER_CONCORRENCIA`. The `FAKE_*` variables
    stay read with `os.getenv` in `backend/tse_fake/main.py`: the mock is not part of the API settings.
12. **The models are the reference**: the `models.py` file of each module under `backend/app/modules/`,
    not the old spec `specs/06-data-model.md` (it may be out of date).
13. **`municipality`** in code; the TSE number is `tse_code`.
14. **`polling_place`** for local de votação; "colégio" is only a synonym in text.
15. **apuração and totalização → `tally`** (one concept).
16. **Not converted yet (still Portuguese in code)**: `voting_system` values `majoritario` and
    `proporcional`; preference values `escuro`, `claro`, `auto`, `confortavel`, `compacta`; the
    `vice_and_substitutes` item `tipo` values `vice`, `suplente`; the widget type ids; the frontend store
    key `coresCandidatos` and the query key `candidato`; the collector loop label `"principal"`. Each needs
    a decision: rename (with a migration for the stored values) or keep as the stored value.
17. **Eligible voters**: the same concept has two English names. `eligible_voters` is used for the
    voters of a polling place, a section and a BU; `electorate` for a municipality and a result line.
    Pick one (open) or keep both by table.
