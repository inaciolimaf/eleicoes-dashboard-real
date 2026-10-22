# Domain glossary (pt-BR to en)

Draft glossary for the conversion of the code from Portuguese to English. It lists every domain
term found in the backend (`backend/`) and the frontend (`frontend/src/`), with the proposed English
code name. The product (UI text, screen URLs, error messages) stays in Portuguese.

Status: **draft**. Items in [Open questions](#open-questions) still need a decision.

## Conventions

- **Python**: `snake_case` for functions, variables, modules and columns; `PascalCase` for classes.
- **TypeScript**: `camelCase` for functions, variables and object keys; `PascalCase` for components,
  types and interfaces. Files of components use `PascalCase.tsx`; other modules use `camelCase.ts`
  (already the case for `lib/`, `store/`, `api/`).
- **Database**: tables are plural `snake_case` (`elections`, `polling_sections`); columns are
  `snake_case` and singular. Primary keys are `id` unless the natural key is the TSE id.
- **API routes**: kebab-case and plural resources (`/api/v1/polling-places`, `/api/v1/candidates/{tse_candidate_id}`).
  Routes that are actions use a verb as the last segment (`/admin/collector/pause`).
- **Error types**: `domain/reason`, all lowercase, `snake_case` reason (for example
  `auth/invalid_credentials`, `dashboard/not_found`). The HTTP `detail` message stays in Portuguese
  (see the next section).
- **Acronym**: the TSE acronym is kept as `tse` (`tse_environment`, `tse_base_url`, `tse` module).
- **Numbers and codes**: "number" is the ballot or sequence number of an item (`number`);
  "code" is an identifier issued by the TSE or the IBGE (`office_code`, `tse_code`, `ibge_code`).
- **Geographic level values**: `country`, `state`, `municipality`, `zone`, `polling_place`, `section`
  (see [Open questions](#open-questions) about the TSE `br` value).

## Stays in Portuguese on purpose

These names do not change in the conversion.

**Screen URLs (frontend routes, `App.tsx`)**

`/`, `/p/:token`, `/tv`, `/paineis`, `/paineis/:id`, `/explorar`, `/explorar/:nivel/:id`, `/mapas`,
`/locais/:id`, `/secoes/:id`, `/secoes/:uf/:mun/:zona/:secao`, `/candidatos`, `/candidatos/:sqcand`,
`/eventos`, `/alertas`, `/conta`, `/entrar`, `/admin`.

**UI text**: every label, title and message shown to the user (`NIVEL_ROTULO`, `NIVEL_PLURAL`,
widget titles, button texts, the `Placar`, `Rosca`, `Hemiciclo` names when displayed).

**Error `detail` messages** returned by the API, for example `e-mail já cadastrado`,
`e-mail ou senha inválidos`, `painel não encontrado`, `modo congelado exige 'tempo'`, `JSON inválido`,
`op desconhecida: {op}`. The error type (`domain/reason`) is in English, the message is not.

**Environment variables** (read by `backend/app/core/config.py` through `pydantic-settings`; the name
is the field name in upper case). Config values such as `oficial`, `simulado`, `fake`, `sob_demanda`,
`todas` also stay.

| Variable | Read in | Notes |
|---|---|---|
| `ENVIRONMENT` | `config.py` | `local`, `production`, `test`. Not in `.env.example` |
| `DATABASE_URL` | `config.py` | |
| `REDIS_URL` | `config.py` | |
| `TSE_AMBIENTE` | `config.py`, `.env.example` | `fake`, `simulado`, `oficial` |
| `TSE_BASE_URL` | `config.py`, `.env.example` | |
| `TSE_MAX_RPS` | `config.py`, `.env.example` | |
| `TSE_CONCORRENCIA` | `config.py`, `.env.example` | |
| `TSE_VERIFICAR_JWS` | `config.py`, `.env.example` | |
| `TSE_USAR_JWS` | `config.py` | Not in `.env.example` |
| `TSE_FAKE_KID` | `config.py` | Not in `.env.example` |
| `TSE_FAKE_CHAVE_PUBLICA` | `config.py` | Not in `.env.example` |
| `TSE_FAKE_CONTROLE_URL` | `config.py`, `.env.example` | |
| `INTERVALO_CATALOGO` | `config.py`, `.env.example` | seconds |
| `INTERVALO_PRINCIPAL` | `config.py`, `.env.example` | seconds |
| `INTERVALO_ACOMPANHAMENTO` | `config.py`, `.env.example` | seconds |
| `INTERVALO_MIN_MUNICIPIO` | `config.py`, `.env.example` | seconds |
| `COLETAR_SECOES` | `config.py`, `.env.example` | |
| `MODO_SECOES` | `config.py`, `.env.example` | `sob_demanda` (default), `todas` |
| `COLETAR_ZONAS` | `config.py`, `.env.example` | |
| `LOCAIS_VOTACAO_URL` | `config.py`, `.env.example` | |
| `DIR_BRUTOS` | `config.py` | raw data folder |
| `DIR_CACHE_FOTOS` | `config.py` | photo cache folder |
| `JWT_SECRET` | `config.py`, `.env.example` | 32+ bytes in production |
| `JWT_EXPIRA_MIN` | `config.py` | |
| `CORS_ORIGINS` | `config.py`, `.env.example` | |
| `LOG_LEVEL` | `config.py`, `.env.example` | |
| `WORKER_CONCORRENCIA` | `.env.example`, `worker/main.py` | Read with `getenv`, not in `Settings` |
| `COLETOR_WORKERS_MUNICIPIO` | `collector/coletor.py` | Read with `getenv`, not in `Settings` |
| `COLETOR_WORKERS_SECAO` | `collector/coletor.py` | Read with `getenv`, not in `Settings` |
| `FAKE_VELOCIDADE` | `tse_fake/main.py`, `.env.example` | |
| `FAKE_INICIO_MIN` | `tse_fake/main.py`, `.env.example` | |
| `FAKE_SEMENTE` | `tse_fake/main.py`, `.env.example` | |
| `FAKE_ESCALA` | `tse_fake/main.py`, `.env.example` | |

**Makefile targets** (`Makefile`): `help`, `env`, `up`, `up-oficial`, `dev`, `down`, `reset`, `logs`,
`ps`, `migrate`, `revision`, `test`, `lint`, `format`, `types`, `docs`, `boundaries`, `web-test`,
`web-format`, `web-types`, `web-build`, `web-coverage`, `mobile`, `fake-status`, `fake-velocidade`,
`fake-reiniciar`, `fake-ir`. The `fake-*` targets are Portuguese words and stay as they are.

**TSE external data (formats that come from the TSE, not from us)**

These are the JSON keys and file layouts parsed by `backend/app/tse/parsers.py`, `bu.py`,
`catalogo.py`, `urls.py`, `jws.py` and `chaves.py`. They are read as they are. The code maps them
to the English code names in the tables below. The short keys must not be renamed in the parser.

Result file keys (EA20 `-u`, EA14 `-ab`, EA16 `-cs`, EA18 `-aux`):

| Key | Meaning (see `docs/02-fontes-de-dados-tse.md`) |
|---|---|
| `ele` | election code |
| `t` | round (turno) |
| `f` | phase or environment: `s` simulado, `o` oficial |
| `dg`, `hg` | generation date and time of the file |
| `dt`, `ht` | tally date and time |
| `idg` | generation id, changes on every rewrite, equals the HTTP ETag. Key of the snapshot |
| `v.tv`, `v.vv`, `v.vb`, `v.vn` / `v.tvn` | total votes, valid, blank, null |
| `s.ts`, `s.st`, `s.pst` / `s.pstn` | sections total, tallied, percentage (2 decimals or full) |
| `e.te`, `e.est`, `e.esnt` | electorate: total, in tallied sections, in non-tallied sections |
| `e.c`, `e.pc`, `e.a`, `e.pa` | turnout and abstention (absolute and percentage) |
| `tf` | final tally (`s`/`n`) |
| `md` | mathematically decided (`s`/`n`) |
| `and` | progress code (`f` finished, other values to confirm) |
| `munf`, `munpt`, `munnr`, `pmunf` | municipalities finished, partial, not received, percentage |
| `tpabr`, `cdabr` | geographic type and code of the file scope |
| `agr`, `agr[].tp`, `agr[].vag`, `agr[].n`, `agr[].nm` | alliance list, type (`i` isolated), seats |
| `carg`, `cd` | office list and office code |
| `par` | party |
| `cand`, `cand[].n`, `cand[].sqcand`, `cand[].nm`, `cand[].nmu` | candidate list, ballot number, stable id, civil name, ballot name |
| `cand[].vap`, `cand[].pvap`, `cand[].pvapn` | votes, percentage (2 decimals or full) |
| `cand[].dvt` | vote destination (`Válido`, `Anulado`, `Anulado sub judice`) |
| `cand[].e`, `cand[].st` | elected (`s`/`n`) and status text (`Eleito`, `2º turno`, `Suplente`) |
| `vs` | vice and substitutes |
| `abr` | geographic scope list |
| `pl`, `cd`, `nm`, `ds`, `dt`, `tp`, `arq`, `dir`, `idg`, `uf`, `e`, `c`, `t` | catalog keys (`catalogo.py`): event (`pl`), code, name, description, date, type, file list (`arq`), folder template (`dir`) |
| `ab`, `cm`, `cs`, `aux`, `ft`, `u`, `e` | file types in the URL templates |
| `sqcand` | TSE candidate id (used in photo file names) |
| `pc`, `pvap`, `vap` | percentages and votes (see above) |

Mixed-case or long keys in the BU (`.bu`) file, from `bu.py` (kept as they are):
`envelopeBoletimUrna`, `EntidadeBoletimUrna`, `EntidadeEnvelopeGenerico`, `tipoEnvelope`,
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
`correspondenciaResultado`, `tipoArquivo`, `hash`, `MOCK`, `oficial`, the office keys
`presidente`, `governador`, `senador`, `deputadoFederal`, `deputadoEstadual`, `deputadoDistrital`,
`prefeito`, `vereador`, `majoritario`, `proporcional`, and the office names `Presidente`,
`Governador`, `Senador`, `Deputado Federal`, `Deputado Estadual`, `Deputado Distrital`, `Prefeito`,
`Vereador`.

Keys of the signed document (`jws.py`): `alg` (`EdDSA`), `kid`, `typ` (`JOSE`).

TSE file layouts and URL templates (`urls.py`, `catalogo.py`, `docs/02`):

| Layout | Example |
|---|---|
| Base | `https://resultados.tse.jus.br/oficial/ele2026/...` (ciclo `ele2026`) |
| Municipalities (`cm`) | `config/mun-e{cd_eleicao:06}-cm.json` |
| Acompanhamento (`ab`) | `dados/{uf}/{uf}-e{cd_eleicao:06}-ab.json` |
| Resultado (`u`, `e`) | `dados/{uf}/{uf}{municipio:05}-z{zona:04}-c{cargo:04}-e{cd_eleicao:06}-{tipo}.json` |
| Fotos (`ft`) | `fotos/{uf}/{sqcand}.jpeg` |
| Configuração de seções (`cs`) | `arquivo-urna/{cd_pleito}/config/{uf}/{uf}-p{cd_pleito:06}-cs.json` |
| Auxiliar de seção (`aux`) | `arquivo-urna/{cd_pleito}/dados/{uf}/{municipio}/{zona}/{secao}/p{cd_pleito:06}-{uf}-m{municipio:05}-z{zona:04}-s{secao:04}-aux.json` |
| BU file | `arquivo-urna/.../{secao}/{hash}/{nome}` |
| Dados Abertos (locais) | `dadosabertos/eleitorado_local_votacao_2026.csv` or `.zip` |
| Control of the TSE (fake only) | `_fake/estado`, `_fake/controle` |

Other TSE values: the signing key environments `oficial`, `simulado`, `fake` (`chaves.py`), the
office names above, the district and section ids in the file names (`sp71072`, `sp71072-z0001`,
`sp71072-z0001-l1015`, `sp71072-z0001-s0120`), and the TSE ballot ids such as `sqcand`.

**Fake TSE external URLs and paths** (`backend/tse_fake/main.py`, mimicking the TSE):
`/oficial/comum/config/ele-c.{ext}`, `/oficial/ele2026/{ele}/config/{arquivo}`,
`/oficial/ele2026/{ele}/dados/{uf}/{arquivo}`, `/oficial/ele2026/{ele}/fotos/{uf}/{arquivo}`,
`/oficial/ele2026/arquivo-urna/{pleito}/config/{uf}/{arquivo}`,
`/oficial/ele2026/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{arquivo}`,
`/oficial/ele2026/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{hash_}/{arquivo}`,
`/dadosabertos/eleitorado_local_votacao_2026.csv`. Fake-only paths (not TSE): `/_fake/estado`,
`/_fake/controle`, `/saude`. The service name `tse-fake` stays in `docker-compose*.yml` and in the URLs.

**Other fixed names**: the Docker service names (`db`, `redis`, `tse-fake`, `api`, `web`), the
the Alembic migration `0001_inicial.py` (the file name is part of history).

---

## Tables by area

Columns are `Term (pt-BR) | Code name (en) | Meaning`. For a table, the "Code name" is the table name.
For a column, the "Code name" is the column name. Tables keep the TSE acronyms only when the TSE uses them.

### Electoral system

Table `eleicao` is `elections`. Table `eleicao_cargo` is `election_offices`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| pleito | `election_event` | One election day (one date). A pleito can hold several elections. Column `cd_pleito` is `election_event_code` |
| eleição | `election` | An election inside a pleito (federal, state, municipal). Table `elections` |
| turno | `round` | First or second round. Column `turno` is `round` (`round` in SQL is allowed) |
| cargo | `office` | An office being contested (President, Governor, Senator, deputy). Table `election_offices` |
| sistema (majoritário / proporcional) | `voting_system` | `majoritarian` or `proportional` |
| abrangência | `coverage` | Geographic coverage of an office (`br` for President, UF for governor) |
| vagas | `seats` | Seats to fill (proportional) |
| código do cargo (`cd_cargo`) | `office_code` | TSE office code (1, 3, 5, 6, 7, 8) |
| código da eleição (`cd_eleicao`) | `election_code` | TSE election code |
| `cd_eleicao_t2` | `runoff_election_code` | Election code of the second round |
| `cd_pleito` | `election_event_code` | TSE code of the pleito |
| ambiente | `tse_environment` | Source environment: `fake`, `simulado`, `oficial` (values stay Portuguese) |
| ciclo | `cycle` | Electoral cycle, for example `ele2026` |
| tipo (eleição) | `jurisdiction` | `federal`, `estadual`, `municipal` (values stay as in TSE) |
| nome (eleição) | `name` | Name of the election |
| data | `date` | Date of the election (stored as `YYYY-MM-DD` text) |
| `eleicao.id` | `id` | Surrogate key |
| `eleicao_cargo.eleicao_id` | `election_id` | Foreign key to `elections` |
| `eleicao_cargo.nome` | `name` | Name of the office |

### Geography

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| UF (unidade federativa) | `state` | Brazilian state or the Federal District. Table `states` |
| sigla | `code` | Two-letter code of the state (`sp`, `rj`). Column `uf.sigla` is `states.code` |
| região | `region` | Region of the country (`sudeste`, ...) |
| município | `municipality` | Municipality. Table `municipalities` |
| id do município | `id` | Id with the format `sp71072` (state code + 5-digit TSE code). Keeps the format |
| `cd_tse` | `tse_code` | TSE code of the municipality |
| `cd_ibge` | `ibge_code` | IBGE code of the municipality |
| capital | `is_capital` | State capital (boolean) |
| `lat`, `lon` | `lat`, `lon` | Coordinates (degrees) |
| eleitorado (município) | `electorate` | Number of eligible voters |
| `uf` (município) | `state_code` | Foreign key to `states.code` |
| zona eleitoral | `electoral_zone` | Electoral zone inside a municipality. Table `electoral_zones` |
| `zona.id` | `id` | Id with the format `sp71072-z0001` |
| `zona.municipio_id` | `municipality_id` | Foreign key to `municipalities` |
| `zona.numero` | `number` | Zone number |
| `zona.uf` | `state_code` | Foreign key to `states.code` |
| local de votação (colégio) | `polling_place` | Building where sections vote. Table `polling_places`. "colégio" is the informal name used in the code |
| `local_votacao.id` | `id` | Id with the format `sp71072-z0001-l1015` |
| `local_votacao.zona_id` | `electoral_zone_id` | Foreign key to `electoral_zones` |
| `local_votacao.numero` | `number` | Polling place number |
| `local_votacao.nome` | `name` | Name of the polling place |
| endereço | `address` | Address |
| bairro | `neighborhood` | Neighborhood |
| CEP | `zip_code` | Postal code |
| `aproximado` | `is_approximate` | Position is approximate (boolean) |
| eleitores aptos (local) | `eligible_voters` | Eligible voters in the polling place |
| qtd. de seções (local) | `section_count` | Number of sections in the polling place |
| seção eleitoral | `polling_section` | Section (urna). Table `polling_sections` |
| `secao.id` | `id` | Id with the format `sp71072-z0001-s0120` |
| `secao.local_id` | `polling_place_id` | Foreign key to `polling_places` (may be null) |
| `secao.numero` | `number` | Section number |
| `secao.eleitores_aptos` | `eligible_voters` | Eligible voters in the section |
| `secao.agregadora` | `aggregator_section` | Aggregating section number (when it exists) |
| recorte | `geo_area` | A geographic slice used in queries, URLs and results: a level plus an id (for example `sp` or `sp71072-z0001`). Column `recorte_id` is `geo_area_id` |
| recorte pai | `parent_geo_area` | Geographic area one level up (`pai_id` is `parent_id`) |
| nível | `level` | Level of a geo area: `country` (`br`), `state` (`uf`), `municipality`, `zone`, `polling_place` (`local`), `section` (`secao`) |
| abrangência do recorte (`uf`) | `state_code` | State of the geo area |

### Candidates and parties

Table `candidato` is `candidates`. Parties and alliances are columns of `candidates`; there is no table for them.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| candidato | `candidate` | A candidate in an election. Table `candidates` |
| `sqcand` | `tse_candidate_id` | Stable id given by the TSE (used in photo names and in the API path) |
| `eleicao_id` | `election_id` | Foreign key to `elections` |
| `turno` (candidato) | `round` | Round in which the candidate runs |
| `cd_cargo` (candidato) | `office_code` | TSE office code |
| `uf` (candidato) | `state_code` | State of the candidacy (`br` for President) |
| número | `number` | Ballot number (number in the urna) |
| nome | `name` | Civil name |
| nome de urna | `ballot_name` | Name shown on the ballot |
| partido (sigla) | `party_abbreviation` | Party abbreviation |
| partido (número) | `party_number` | Party ballot number |
| agremiação | `alliance` | Isolated party or federation/coalition. Values as in the TSE (`i` isolated) |
| cor | `color` | Color used for the candidate in charts (hex) |
| vices e suplentes | `vice_and_substitutes` | List of vice-presidents and substitutes (JSONB) |
| situação geral | `overall_status` | Overall status of the candidate (see status values below) |
| eleito | `elected` | Elected (boolean) |
| atualizado em | `updated_at` | Last update |
| situação | `status` | Status of the candidate or of a result line. Values: `ELECTED` (ELEITO), `RUNOFF` (SEGUNDO_TURNO), `MATHEMATICALLY_ELECTED` (MATEMATICAMENTE_ELEITO), `LEADING` (LIDERANDO), `SUBSTITUTE` (SUPLENTE), `NOT_ELECTED` (NAO_ELEITO), `SUB_JUDICE` (SUB_JUDICE), `COUNTING` (EM_APURACAO) |
| foto | `photo` | Photo of the candidate (served by the API, `photo_url` in JSON) |
| partido | `party` | Political party (concept, code name used in the API and frontend) |
| agremiação (concept) | `alliance` | See above |
| federação / coligação | `federation` / `coalition` | Kinds of alliance (values of `alliance`) |

### Results and counting

Tally (apuração / totalização) is the process of adding each section's ballot box report to the
official total; in this system the two Portuguese words name the same process. Snapshot tables keep the history; "current" tables
keep the latest state.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| apuração | `tally` | The counting process, from the first BU to the last section (same concept as totalização) |
| totalização | `tally` | Adding a section to the official total |
| totalizado | `tallied` | Has been added to the tally |
| totalizado em | `tallied_at` | Official time of the tally (the time axis for history) |
| totalização final | `final_tally` | Final tally flag (`tf`) |
| resultado | `result` | A result line for a geo area, election and office |
| snapshot (histórico) | `result_snapshots` | Table `snapshot_resultado`, one row per new version of a result |
| estado atual | `current_results` | Table `resultado_atual`, latest result per area |
| progresso (snapshot) | `progress_snapshots` | Table `snapshot_progresso` |
| progresso atual | `current_progress` | Table `progresso_atual` |
| capturado em | `captured_at` | When this system fetched the data |
| verificado por JWS | `jws_verified` | The data passed the JWS signature check |
| fonte | `source` | Source of the data (`tse`, ...) |
| arquivo | `source_file` | Name of the TSE file the line came from |
| eleitorado | `electorate` | Eligible voters in the geo area |
| eleitorado apurado | `tallied_electorate` | Eligible voters in tallied sections |
| seções (total) | `sections_total` | Number of sections in the geo area |
| seções totalizadas | `sections_tallied` | Sections already tallied |
| % de seções | `pct_sections` | Percentage of sections tallied |
| comparecimento | `turnout` | Voters who showed up |
| % comparecimento | `pct_turnout` | Turnout percentage |
| abstenção | `abstention` | Eligible voters who did not vote |
| % abstenção | `pct_abstention` | Abstention percentage |
| votos (total) | `total_votes` | Total votes (valid + blank + null) |
| votos válidos | `valid_votes` | Valid votes (nominal to candidates and legend) |
| % válidos | `pct_valid` | Percentage of valid votes |
| brancos | `blank_votes` | Blank votes |
| % brancos | `pct_blank` | Percentage of blank votes |
| nulos | `null_votes` | Null votes |
| % nulos | `pct_null` | Percentage of null votes |
| matematicamente definido | `mathematically_decided` | The result cannot change any more (TSE `md`) |
| líder | `leader` | First-placed candidate. Columns `lider_sqcand` (`leader_candidate_id`), `lider_votos` (`leader_votes`), `lider_pct` (`leader_pct`) |
| segundo colocado | `second` | Second-placed candidate. Columns `segundo_sqcand` (`second_candidate_id`), `segundo_votos` (`second_votes`), `segundo_pct` (`second_pct`) |
| margem (pontos percentuais) | `margin_pp` | Gap between the first and second place, in percentage points |
| partido do líder | `leader_party` | Party of the leader |
| candidatos (JSON) | `candidates` | Candidate lines inside a result (JSONB: `sq`, `v`, `p`, `e`, `st`, `d`) |
| agremiações (JSON) | `alliances` | Alliance lines inside a result (JSONB: `nome`, `partidos`, `v`, `vag`) |
| andamento | `progress_code` | TSE progress code (`and`) |
| municípios finalizados | `municipalities_completed` | Municipalities with the final tally |
| municípios parciais | `municipalities_partial` | Municipalities with a partial tally |
| municípios não recebidos | `municipalities_not_received` | Municipalities with no data yet |
| ordem | `position` | Position in a sorted list |
| id da geração (`idg`) | `generation_id` | TSE id of a file generation (changes on each rewrite). Unique key of a snapshot together with the other keys |
| nível (in results) | `level` | See geo area above |
| pai | `parent_id` | Id of the parent geo area |
| `turno` (results) | `round` | See electoral system |
| `cd_cargo` (results) | `office_code` | See electoral system |

### Ballot box reports and sections

A ballot box report (boletim de urna, BU) is the printed result of one section, decoded from the
`.bu` file published by the TSE. Table `boletim_urna` is `ballot_box_reports`. Table `resultado_local`
is `polling_place_results` (sum of the BUs of one polling place).

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| boletim de urna (BU) | `ballot_box_report` | Result of one section (one urna). Table `ballot_box_reports` |
| `boletim_urna.id` | `id` | Surrogate key |
| `boletim_urna.turno` | `round` | Round |
| `boletim_urna.secao_id` | `polling_section_id` | Section of the report |
| `boletim_urna.local_id` | `polling_place_id` | Polling place of the report (may be null) |
| `boletim_urna.zona_id` | `electoral_zone_id` | Zone |
| `boletim_urna.municipio_id` | `municipality_id` | Municipality |
| `boletim_urna.uf` | `state_code` | State |
| hash | `hash` | Hash of the BU file |
| status (BU) | `status` | Status of the report as published by the TSE |
| emitido em | `issued_at` | When the BU was issued by the urna |
| `boletim_urna.capturado_em` | `captured_at` | When this system fetched the BU |
| assinatura OK | `signature_valid` | The signature of the BU was verified (may be null) |
| url | `url` | Source URL of the BU file |
| votos (JSONB) | `votes` | Votes per office (`{"1": {"comp": ..., "b": ..., "n": ..., "nom": {...}, "leg": {...}}}`) |
| local de votação (agregado) | `polling_place_results` | Table `resultado_local`: sums of the BUs of a polling place |
| seções (total do local) | `sections_total` | Sections of the polling place (`secoes_total`) |
| seções totalizadas (local) | `sections_tallied` | Sections of the polling place already tallied (`secoes_apuradas`) |
| status do local | `status` | `not_received`, `partial`, `tallied` (`nao_recebido`, `parcial`, `apurado`) |
| comparecimento (local) | `turnout` | See results |
| votos válidos (local) | `valid_votes` | See results |
| brancos / nulos (local) | `blank_votes` / `null_votes` | See results |
| líder (local) | `leader_candidate_id`, `leader_pct` | See results |
| margem (local) | `margin_pp` | See results |
| votos (local, JSONB) | `votes` | `{"nom": {"13": 130}, "leg": {...}}` (nominal and legend votes by ballot number) |
| atualizado em | `updated_at` | Last update |
| eleitores aptos (BU) | `eligible_voters` | Eligible voters in the section |
| comparecimento (BU) | `turnout` | Voters who showed up in the section |
| seção (BU) | `polling_section` | Section (see Geography) |

### Collector and worker

The collector (`coletor`) polls the TSE and puts the files on a queue. The worker consumes the queue,
parses the files and writes the database.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| coletor | `collector` | Process that fetches the TSE files on a schedule. Class `Coletor` is `Collector` |
| fila | `queue` | Redis list of files to process. Key `fila:arquivos` is `queue:files` |
| trabalhador (worker) | `worker` | Process that consumes the queue and writes results. Module `worker/` |
| tarefa (job) | `job` | Handler for one file type. Module `jobs.py` |
| processador | `processor` | Function that handles one message of the queue. Type `Processador` is `Processor` |
| catálogo | `catalog` | List of TSE files and elections (`catalogo.py`, `catalogo` key) |
| acompanhamento | `tracking` | Tracking files: progress by UF and municipality (EA14, EA15). Module `acompanhamento.py` |
| principal | `primary` | The main results feed of the collector. Module `principal.py` |
| resultados (coletor) | `results` | Module `resultados.py` of the collector |
| seções (coletor) | `sections` | Module `secoes.py`. Collects section configuration and BUs |
| demanda | `demand` | On-demand section fetching. Module `demanda.py` (service and collector) |
| sob demanda | `on_demand` | Section mode: only fetch the polling places opened in the dashboard or with an active alert. Config value `sob_demanda` stays |
| todas (seções) | `all` | Section mode: scan all sections. Config value `todas` stays |
| modo de seções | `section_mode` | Setting `MODO_SECOES` (`section_mode`) |
| intervalo | `*_interval` | Interval between runs, for example `catalog_interval`, `primary_interval`, `tracking_interval`, `min_municipality_interval` |
| coletar zonas | `collect_zones` | Setting `COLETAR_ZONAS` |
| coletar seções | `collect_sections` | Setting `COLETAR_SECOES` |
| requisição | `request` | Module `requisicao.py`. HTTP request to the TSE |
| buscador (fetcher) | `fetcher` | Module `fetcher.py`. Fetches with rate limit (`TokenBucket`) |
| métricas | `metrics` | Class `Metricas` (`Metrics`) and Redis hash `worker:metricas` (`worker:metrics`) |
| município (coletor) | `municipality` | Municipality as a unit of collection (`municipios.json` in `backend/app/data/`) |
| coleta | `collection` | One run of the collector |
| dados brutos | `raw_data` | Raw files folder (`DIR_BRUTOS`, code `raw_dir`) |
| cache de fotos | `photo_cache` | Photo cache folder (`DIR_CACHE_FOTOS`, code `photo_cache_dir`) |
| pausar / retomar | `pause` / `resume` | Admin actions for the collector |
| `coletor.py`, `fetcher.py`, `main.py` | `collector.py`, `fetcher.py`, `main.py` | Module names |

### Real-time

Module `realtime/topicos.py` is `topics.py`. Module `hub.py` keeps `hub.py`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| tópico | `topic` | A subscription key (for example `results:1:1:...`) |
| tópicos ativos (`ws:topicos`) | `ws:topics` | Redis sorted set of topics with viewers (score = expiry) |
| publicação | `publish` | Function `publicar` (`publish`) that sends a message on the Redis channel `pub:{topic}` |
| ativo | `active` | Function `ativos` (`active`) and `esta_ativo` (`is_active`) |
| prefixo `pub:` | `pub:` | Redis channel prefix (kept: it is the wire name) |
| resultados (topic) | `results` | Topic `res:{turno}:{cargo}:{nivel}:{id}` is `results:{round}:{office}:{level}:{id}` |
| filhos (topic) | `children` | Topic `filhos:...` is `children:...` (children of a geo area) |
| locais (topic) | `polling_places` | Topic `locais:{turno}:{cargo}:{municipio}` is `polling_places:...` |
| eventos (topic) | `events` | Topic `eventos:{turno}` is `events:{round}` |
| progresso (topic) | `progress` | Topic `progresso:{turno}` is `progress:{round}` |
| status (topic) | `status` | Topic `status` (always on) |
| usuário (topic) | `user` | Topic `usuario:{uid}` is `user:{id}` (always on for the session) |
| operação (ws `op`) | `op` | WebSocket operation: `sub` (`subscribe`), `unsub` (`unsubscribe`), `auth`, `ping`, `resume` |
| mensagem (ws `tipo`) | `type` | Message type: `erro` (`error`), `auth`, `pong`, `resync` |
| mensagem (ws `mensagem`) | `message` | Error text (Portuguese text stays in the message) |
| `topico` (ws) | `topic` | Topic name in the message |
| `dados` (ws) | `data` | Payload |
| recurso (ws `resume`) | `resume` | Reconnect with the last known state |
| resync | `resync` | Message asking the client to reload the state |
| evento (feed) | `event` | An event of the results feed. Table `events` |
| tipo (evento) | `type` | Event type: `inicio` (`start`), `marco` (`milestone`), `virada` (`lead_change`), `eleito` (`elected`), `matematicamente_definido` (`mathematically_decided`), `segundo_turno` (`runoff`) |
| ocorrido em | `occurred_at` | When the event happened (official time) |
| criado em (evento) | `created_at` | When the row was written |
| nível (evento) | `level` | Level of the geo area |
| recorte (evento) | `geo_area_id` | Geo area of the event |
| título | `title` | Event title (shown in the UI, Portuguese text) |
| descrição | `description` | Event description (shown in the UI) |
| payload | `payload` | Extra data of the event (JSONB) |
| alerta (tipo) | `alert_type` | `pct_candidato` (`candidate_pct`), `apuracao` (`tally_threshold`), `virada` (`lead_change`), `eleito` (`elected`), `local_apurado` (`polling_place_tallied`) |
| `apurado` (alerta) | `tallied` | Used in `polling_place_tallied` |
| `limite` | `threshold` | Limit of an alert (`limite`) |
| `pct_candidato` (param) | `candidate_pct` | Percentage threshold for a candidate |
| `pct_secoes` (param) | `pct_sections` | Percentage of sections threshold |
| fila de eventos | `events feed` | The `events` table read by the API and sent on `events:{round}` |

Event table columns: `evento.id` is `id`; `turno` is `round`; `tipo` is `type`; `ocorrido_em` is
`occurred_at`; `criado_em` is `created_at`; `cd_cargo` is `office_code`; `nivel` is `level`;
`recorte_id` is `geo_area_id`; `titulo` is `title`; `descricao` is `description`; `payload` is `payload`.

### Users, dashboards (painéis), widgets, alerts, favorites

Table `usuario` is `users`. Table `preferencia` is `preferences`. Table `painel` is `dashboards`.
Table `compartilhamento` is `shares`. Table `favorito` is `favorites`. Table `alerta` is `alerts`.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| usuário | `user` | A registered person. Table `users` |
| `usuario.id` | `id` | UUID |
| e-mail | `email` | Unique login (`citext` in the design; `String` in the model) |
| nome | `name` | Name of the user |
| senha (hash) | `password_hash` | Hashed password (`senha_hash`) |
| administrador | `is_admin` | Admin flag |
| criado em | `created_at` | Creation time (`Timestamps`) |
| atualizado em | `updated_at` | Update time (`Timestamps`) |
| preferências | `preferences` | Table `preferencia`: one row per user |
| `preferencia.dados` | `data` | JSONB with the preferences: `tema` (`theme`), `densidade` (`density`), `animacoes` (`animations`), `cores_candidatos` (`candidate_colors`), `notificacoes` (`notifications`) |
| painel | `dashboard` | A saved set of widgets. Table `dashboards` |
| ordem (painel) | `position` | Order in the list of dashboards |
| padrão | `is_default` | Default dashboard flag |
| versão do schema | `schema_version` | Version of the dashboard JSON schema |
| configuração (painel) | `config` | JSONB with the dashboard definition (see below) |
| compartilhamento | `share` | A public link to a dashboard. Table `shares` |
| token | `token` | Public token of the share (URL `/p/:token` stays) |
| modo | `mode` | `live` (`ao_vivo`) or `frozen` (`congelado`). Values in TSE-style: see Open questions |
| tempo (compartilhamento) | `frozen_time` | Time the frozen share shows |
| favorito | `favorite` | A saved candidate, geo area or polling place. Table `favorites` |
| tipo (favorito) | `type` | `candidate` (`candidato`), `geo_area` (`recorte`), `polling_place` (`local`) |
| ref (favorito) | `ref` | Id of the favorite item |
| rótulo | `label` | Label shown for the favorite |
| alerta | `alert` | A rule that notifies the user. Table `alerts` |
| tipo (alerta) | `type` | Alert type (see Real-time) |
| parâmetros | `params` | JSONB with the alert parameters |
| ativo | `active` | Alert is enabled (boolean) |
| disparado em | `triggered_at` | When the alert last fired |
| widget | `widget` | A tile on a dashboard. Folder `widgets/` |
| tipo (widget) | `type` | Widget type (`placar` = `scoreboard`, `totais` = `totals`, `kpi`, `mapa` = `map`, `evolucao` = `evolution`, `tabela` = `table`, `comparativo` = `comparison`, `hemiciclo` = `hemicycle`, `rosca` = `donut`, `heatmap`, `eventos` = `events`, `candidato` = `candidate`, `local` = `polling_place`, `secao` = `section`, `relogio` = `clock`, `texto` = `text`) |
| posição (widget) | `position` | Grid position `{x, y, w, h}` |
| herda (widget) | `inherits` | The widget inherits the global filter |
| filtro global | `global_filter` | Dashboard-level filter (`filtroGlobal`) |
| filtros (widget) | `filters` | Widget-level filter (`filtros`) |
| configuração (widget) | `config` | Widget settings (`config`) |
| nível dos filhos | `child_level` | `nivelFilhos` in the widget config |
| métrica | `metric` | `metrica` in the widget config (for example `lider`) |
| eixo X | `x_axis` | `eixoX` in the widget config (for example `pct_secoes`) |
| filtro efetivo | `effective_filter` | Filter after merging the global one and the widget one (`filtro-efetivo.tsx`) |
| gaveta de widgets | `widget_drawer` | Side panel to add widgets (`GavetaWidgets`) |
| gaveta de config | `config_drawer` | Side panel to configure a widget (`GavetaConfig`) |
| grade | `grid` | Layout grid (`Grade`) |
| modelo (template) | `template` | Ready-made dashboard (`templates.ts`) |
| editor | `editor` | Dashboard editor (`editor.ts`) |
| ver painel | `dashboard_view` | Read-only view (`PainelView`) |

Dashboard JSON (`painel.config`): the keys are `id`, `nome`, `filtroGlobal`, `widgets`; each widget has
`id`, `tipo`, `pos`, `config`, `filtros`, `herda`. Renaming these keys requires a `schema_version`
bump (see Open questions).

### Fake TSE

Folder `backend/tse_fake/`. It mimics the TSE files with a simulated clock and a scenario.

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| tse-fake (mock do TSE) | `tse_fake` | Mock service that serves TSE-like files. Docker service name `tse-fake` stays |
| cenário | `scenario` | Module `cenario.py`: the generated election (offices, parties, candidates, municipalities, zones, places). Class `Cenario` is `Scenario` |
| cargo proporcional | `ProportionalOffice` | Class `CargoProporcional` |
| partido | `Party` | Class `Partido` |
| candidato | `Candidate` | Class `Candidato` |
| cargo UF | `StateOffice` | Class `CargoUF` |
| município | `Municipality` | Class `Municipio` |
| zona | `Zone` | Class `Zona` |
| local | `PollingPlace` | Class `Local` |
| dados | `data` | Module `dados.py`: generated data (`vagas_estaduais` → `state_seats`) |
| chave | `key` | Module `chave.py` (`chave_privada_fake` → `fake_private_key`, `chave_publica_fake` → `fake_public_key`) |
| divulgação | `publication` | Module `divulgacao.py`: publishes the generated TSE files on a clock |
| controle | `control` | Endpoint `/_fake/controle` that changes the fake clock and scenario |
| estado | `state` | Endpoint `/_fake/estado` |
| velocidade | `speed` | `FAKE_VELOCIDADE` (`fake_speed`) |
| início (min) | `start_offset_min` | `FAKE_INICIO_MIN` |
| semente | `seed` | `FAKE_SEMENTE` |
| escala | `scale` | `FAKE_ESCALA` |

---

## Code layout

### Backend modules

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| `backend/app/api/v1/publico.py` | `api/v1/public.py` | Public read-only API |
| `backend/app/api/v1/usuario.py` | `api/v1/user.py` | Login, dashboards, favorites, alerts, preferences |
| `backend/app/api/v1/admin.py` | `api/v1/admin.py` | Admin API (health, collector, fake TSE) |
| `backend/app/api/v1/ws.py` | `api/v1/ws.py` | WebSocket endpoint |
| `backend/app/models/eleicao.py` | `models/election.py` | Elections and offices |
| `backend/app/models/geografia.py` | `models/geography.py` | States, municipalities, zones, polling places, sections |
| `backend/app/models/candidatura.py` | `models/candidacy.py` | Candidates |
| `backend/app/models/resultado.py` | `models/result.py` | Results and progress |
| `backend/app/models/boletim.py` | `models/ballot_box_report.py` | Ballot box reports and polling place results |
| `backend/app/models/evento.py` | `models/event.py` | Events feed |
| `backend/app/models/usuario.py` | `models/user.py` | Users, preferences, dashboards, shares, favorites, alerts |
| `backend/app/services/ingestao.py` | `services/ingestion.py` | Ingesting TSE data into the database |
| `backend/app/services/resultados.py` | `services/results.py` | Building result responses |
| `backend/app/services/situacao.py` | `services/status.py` | Candidate status rules |
| `backend/app/services/recortes.py` | `services/geo_areas.py` | Parsing geo area ids |
| `backend/app/services/eventos.py` | `services/events.py` | Detecting events |
| `backend/app/services/alertas.py` | `services/alerts.py` | Evaluating alerts |
| `backend/app/services/cores.py` | `services/colors.py` | Colors for candidates and parties |
| `backend/app/services/demanda.py` | `services/demand.py` | On-demand section requests |
| `backend/app/tse/parsers.py`, `bu.py`, `catalogo.py`, `urls.py`, `jws.py`, `chaves.py`, `numeros.py` | `tse/parsers.py`, `ballot_box.py`, `catalog.py`, `urls.py`, `jws.py`, `keys.py`, `numbers.py` | TSE integration. `bu.py` becomes `ballot_box.py` (BU decoding) |
| `backend/app/realtime/hub.py`, `topicos.py` | `realtime/hub.py`, `topics.py` | Real-time hub and topic names |
| `backend/app/worker/fila.py`, `jobs.py`, `main.py` | `worker/queue.py`, `jobs.py`, `main.py` | Queue and jobs |
| `backend/app/collector/coletor.py`, `fetcher.py`, `main.py` | `collector/collector.py`, `fetcher.py`, `main.py` | Collector |
| `backend/app/collector/coletor/` | `collector/steps/` | Collector steps: `tracking`, `catalog`, `demand`, `primary`, `request`, `results`, `sections`, `base` |
| `backend/app/core/config.py`, `db.py`, `redis.py`, `security.py` | same names | Core |
| `backend/app/data/municipios.json` | `data/municipalities.json` | Municipality list |
| `backend/alembic/` | same | Migrations |

### Frontend folders and files

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| `pages/PainelPage.tsx` | `pages/DashboardPage.tsx` | Dashboard screen |
| `pages/PaineisPage.tsx` | `pages/DashboardsPage.tsx` | List of dashboards |
| `pages/ExplorarPage.tsx` | `pages/ExplorePage.tsx` | Explore screen |
| `pages/MapasPage.tsx` | `pages/MapsPage.tsx` | Maps screen |
| `pages/LocalPage.tsx` | `pages/PollingPlacePage.tsx` | Polling place screen |
| `pages/SecaoPage.tsx` | `pages/PollingSectionPage.tsx` | Section screen |
| `pages/CandidatosPage.tsx` | `pages/CandidatesPage.tsx` | Candidates list |
| `pages/CandidatoPage.tsx` | `pages/CandidatePage.tsx` | Candidate screen |
| `pages/EventosPage.tsx` | `pages/EventsPage.tsx` | Events screen |
| `pages/AlertasPage.tsx` | `pages/AlertsPage.tsx` | Alerts screen |
| `pages/ContaPage.tsx` | `pages/AccountPage.tsx` | Account screen |
| `pages/TvPage.tsx`, `SharedPage.tsx`, `AdminPage.tsx`, `HomePage.tsx`, `NotFoundPage.tsx` | same | Already in English, or proper names |
| `paineis/` | `dashboards/` | Dashboard editor and view |
| `paineis/CompartilharModal.tsx` | `dashboards/ShareModal.tsx` | Share modal |
| `paineis/NovoPainelModal.tsx` | `dashboards/NewDashboardModal.tsx` | New dashboard modal |
| `paineis/schema.ts`, `repo.ts`, `editor.ts`, `templates.ts` | `dashboards/schema.ts`, `repo.ts`, `editor.ts`, `templates.ts` | Schema, storage, editing, templates |
| `paineis/WidgetFrame.tsx`, `Grade.tsx`, `PainelView.tsx` | `dashboards/WidgetFrame.tsx`, `Grid.tsx`, `DashboardView.tsx` | Frame, grid, view |
| `paineis/GavetaWidgets.tsx`, `GavetaConfig.tsx` | `dashboards/WidgetDrawer.tsx`, `ConfigDrawer.tsx` | Side panels |
| `widgets/componentes.tsx`, `registro.tsx`, `tipos.ts` | `widgets/components.tsx`, `registry.tsx`, `types.ts` | Widget components, registry, types |
| `lib/recortes.ts` | `lib/geo-areas.ts` | Geo area helpers (`NIVEIS` → `LEVELS`) |
| `lib/cargos.ts` | `lib/offices.ts` | Office helpers |
| `lib/cores.ts`, `lib/useCor.ts` | `lib/colors.ts`, `lib/useColor.ts` | Colors |
| `lib/filtro-efetivo.tsx` | `lib/effective-filter.tsx` | Effective filter |
| `lib/exportar.ts` | `lib/export.ts` | Export (CSV, image) |
| `lib/format.ts`, `time.ts`, `geo.ts` | same | Formatting, time, geography |
| `realtime/topicos.ts` | `realtime/topics.ts` | Topic names (same as backend) |
| `realtime/aplicar.ts` | `realtime/apply.ts` | Applying messages to the store |
| `realtime/socket.ts`, `useLive.ts` | same | Socket and hook |
| `store/tempo.ts` | `store/time.ts` | Time slider state |
| `store/favoritos.ts` | `store/favorites.ts` | Favorites state |
| `store/filtro.ts` | `store/filter.ts` | Filter state |
| `store/ui.ts`, `auth.ts`, `prefs.ts` | same | UI, auth, preferences state |
| `api/client.ts`, `hooks.ts`, `types.ts` | same | API client, hooks, types |
| `components/layout/Busca.tsx` | `components/layout/Search.tsx` | Search |
| `components/layout/TimeSlider.tsx` | same | Time slider |
| `components/layout/LiveIndicator.tsx` | same | "live" indicator |
| `components/layout/FilterBar.tsx` | same | Filter bar |
| `components/locais/DetalheLocal.tsx` | `components/polling-places/PollingPlaceDetail.tsx` | Polling place detail |
| `components/secoes/DetalheSecao.tsx` | `components/sections/SectionDetail.tsx` | Section detail |
| `components/mapas/` | `components/maps/` | Maps (`MapaEleitoral.tsx` → `ElectoralMap.tsx`, `Legenda.tsx` → `Legend.tsx`) |
| `components/resultados/Placar.tsx` | `components/results/Scoreboard.tsx` | Scoreboard |
| `components/resultados/BlocoTotais.tsx` | `components/results/TotalsBlock.tsx` | Totals block |
| `components/resultados/CardCandidato.tsx` | `components/results/CandidateCard.tsx` | Candidate card |
| `components/resultados/AvatarCandidato.tsx` | `components/results/CandidateAvatar.tsx` | Candidate avatar |
| `components/resultados/SeloSituacao.tsx` | `components/results/StatusBadge.tsx` | Status badge |
| `components/resultados/FonteDados.tsx` | `components/results/DataSource.tsx` | Data source label |
| `components/resultados/ComResultados.tsx` | `components/results/WithResults.tsx` | Results wrapper |
| `components/eventos/FeedEventos.tsx` | `components/events/EventFeed.tsx` | Event feed |
| `components/tabelas/TabelaRecortes.tsx` | `components/tables/GeoAreaTable.tsx` | Geo area table |
| `components/graficos/` | `components/charts/` | Charts: `Hemiciclo` = `Hemicycle`, `Rosca` = `Donut`, `Evolucao` = `Evolution`, `HeatmapProgresso` = `ProgressHeatmap`, `EChart` and `echarts.ts` keep their names |
| `components/common/Relogio.tsx` | `components/common/Clock.tsx` | Clock |
| `components/common/Estados.tsx` | `components/common/States.tsx` | Loading, empty and error states |
| `components/common/Num.tsx` | `components/common/Num.tsx` | Number formatting (kept: `Number` clashes with the global) |
| `components/common/Markdown.tsx`, `Pickers.tsx` | same | Markdown and pickers |
| `components/layout/Navbar.tsx`, `Header.tsx`, `AppLayout.tsx`, `AuthModal.tsx`, `UserMenu.tsx` | same | Layout |

### API routes

Prefix `/api/v1`. The health route is `/api/saude` (outside `/api/v1`).

| Term (pt-BR) | Code name (en) | Meaning |
|---|---|---|
| `/status` | `/status` | Global status of the collector and the data |
| `/eleicoes` | `/elections` | Elections |
| `/resultados` | `/results` | Results for a geo area |
| `/resultados/serie` | `/results/series` | Time series of a result |
| `/recortes/filhos` | `/geo-areas/children` | Child geo areas |
| `/progresso` | `/progress` | Count progress |
| `/mapas/locais` | `/maps/polling-places` | Polling place states for the map |
| `/locais/{local_id}` | `/polling-places/{polling_place_id}` | Polling place detail |
| `/secoes/{secao_id}` | `/polling-sections/{id}` | Section detail |
| `/candidatos` | `/candidates` | Candidates list |
| `/candidatos/{sqcand}` | `/candidates/{tse_candidate_id}` | Candidate detail |
| `/fotos/{sqcand}` | `/photos/{tse_candidate_id}` | Photo |
| `/busca` | `/search` | Search |
| `/eventos` | `/events` | Events feed |
| `/linha-do-tempo` | `/timeline` | Timeline |
| `/export` | `/exports` | Export |
| `/ws` | `/ws` | WebSocket |
| `/admin/saude` | `/admin/health` | Health |
| `/admin/coletor/pausar` | `/admin/collector/pause` | Pause the collector |
| `/admin/coletor/retomar` | `/admin/collector/resume` | Resume the collector |
| `/admin/fake` | `/admin/fake-tse` | Fake TSE control |
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
| `/alertas/{aid}` | `/alerts/{alert_id}` | One alert |
| `/preferencias` | `/preferences` | Preferences |

Note: `/paineis/{pid}` and the other routes keep the screen URL `/paineis` in the frontend (see
"Stays in Portuguese").

---

## Decisions (reviewed 2026-10-22)

1. **Geographic level values**: `country` in code and in the database (`br` stays only where the TSE
   or a screen URL uses it).
2. **Stored enum values** (`situacao`, `status`, share `mode`, alert type, event type) are renamed to
   English **by migration** (with `downgrade`); API and frontend change in the same deploy.
3. **`pleito` → `election_event`.**
4. **`recorte` → `geo_area`.**
5. **Candidate number → `ballot_number`**; other numbers (`secao.numero`, `zona.numero`) → `number`.
6. **`agremiação` → `alliance`.**
7. **Redis topics and WebSocket fields** are renamed to English together with
   `frontend/src/realtime/topicos.ts` (internal wire, deployed together).
8. **Dashboard JSON stored in `painel.config`** (`filtroGlobal`, `herda`, `nivelFilhos`, ...) and shared
   links keep their saved format: it is user data (database, shared links, `localStorage`), an outside
   consumer. Only the code identifiers that read it change.
9. **`sqcand` → `tse_candidate_id`** in code; the TSE key stays `sqcand`.
10. **`fake-*` Makefile targets and the `tse-fake` service** keep their names (people type them).
11. **Variables read with `getenv` outside `Settings`** move into `Settings`, read by alias with the
    same variable name.
12. **The models are the reference**, not `docs/06-modelo-de-dados.md` (old spec).
13. **`municipality`** in code; the TSE number is `tse_code`.
14. **`polling_place`** for local de votação; "colégio" is only a synonym in text.
15. **apuração and totalização → `tally`** (one concept).
