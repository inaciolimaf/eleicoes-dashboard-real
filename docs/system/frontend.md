# Frontend

The public website and the dashboard builder: the results of the election on screens for the
voter, the journalist and the operator (maps, tables, candidates, polling places, sections,
events, alerts, saved dashboards, a TV mode). It is a React single-page app that reads the
public API and the WebSocket of `backend/app/infra/realtime/`. It comes from the spec
`specs/09-frontend.md`; the spec's differences from the code are listed in "Points of attention".

## Where it is

| Path | Role |
|---|---|
| `frontend/src/main.tsx` | Entry: query client, WebSocket start, providers, lazy router |
| `frontend/src/App.tsx` | The router: every screen URL and its route file |
| `frontend/src/AppProviders.tsx`, `frontend/src/theme.ts` | Mantine theme (dark by default), dates in pt-BR, modals, toasts |
| `frontend/src/routes/` | One thin file per screen (see the table of screens) |
| `frontend/src/modules/` | Domains; each one exposes only its `index.ts` |
| `frontend/src/api/` | The one `fetch`, generated types, names, query keys |
| `frontend/src/lib/` | Formatting, palettes, stores, geo areas, export, time |
| `frontend/src/components/` | Shared UI: `frontend/src/components/Num.tsx`, `frontend/src/components/States.tsx` |
| `frontend/tests/`, `frontend/e2e/` | Vitest screen and unit tests; Playwright end-to-end |

## Stack and build

React 18.3 with Vite 5.4, TypeScript 5.9 in strict mode, Mantine 7 (`@mantine/*`), react-router-dom
6.30 (the v7 future flags are on), TanStack Query 5, zustand 5 with `persist`, zod 3 (dashboard
schema), dayjs (pt-BR, `America/Sao_Paulo`), ECharts 6 (modular imports from `echarts/core` in
`frontend/src/modules/charts/echarts.ts`), MapLibre 4 with react-map-gl 7 and deck.gl 9
(`frontend/src/modules/maps/`), react-grid-layout 1.5 (dashboard grid), motion, `@number-flow/react`,
html-to-image (PNG export).

`frontend/package.json` scripts: `npm run build` is `tsc --noEmit && vite build`; `dev` serves on
port 5173; `preview` serves the build on 4173 for e2e; `lint` runs ESLint on `src tests e2e`;
`typecheck`; `format:check` (Prettier, `printWidth` 110 in `frontend/.prettierrc.json`); `test`;
`coverage`; `types` regenerates `frontend/src/api/types.ts`; `e2e`, `mobile`, `e2e:flows`.

`frontend/vite.config.ts`: the dev server and the preview proxy `/api` (WebSocket included) to
`VITE_API_PROXY` or `http://localhost:8000` (preview uses `API_URL`); the preview also proxies
`/health`. The build targets `es2020` and splits vendor code into the chunks `maplibre`, `deckgl`,
`echarts`, `mantine`, `icons`, `grid` and `helpers`, so the map code is not downloaded by a screen
without a map. `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`
and includes `src`, `tests`, `e2e` and the configs.

`frontend/Dockerfile` is two stages: `node:22-alpine` runs `npm ci` and `npm run build`; then
`nginx:alpine` serves `dist` from `/usr/share/nginx/html` with `frontend/nginx.conf` as its site
(a healthcheck with `wget` on `/`). `frontend/Dockerfile.dev` runs `npm ci` and the dev server on
port 5173 at each container start.

`frontend/nginx.conf`: `/api/v1/ws` upgrades to WebSocket (timeouts of one hour); `= /health` and
`/api/` go to `http://api:8000` through the Docker DNS resolver (`valid=10s`, so a recreated API
container is found); `/assets/` is cached for a year and immutable (hashed files); `/geo/` for
seven days; everything else falls back to `index.html` with `Cache-Control: no-cache`. Gzip on.

## Screens

The screen URLs are in Portuguese (glossary, "Stays in Portuguese"). All of them are children of
`AppLayout` (`frontend/src/modules/shell/`) except `/p/:token` and `/tv`, which render alone. The
shell always asks for `/status`, `/timeline`, `/elections`, `/favorites`, `/dashboards` (logged in)
and `/preferences` (logged in); the table lists only what each screen adds.

| Screen URL | Route file | Screen component | API routes it calls (GET unless noted) |
|---|---|---|---|
| `/` | `frontend/src/routes/HomePage.tsx` | `HomeScreen` (dashboards) | `/dashboards`; with none, `StarterDashboard` (the election night template) and its widgets |
| `/p/:token` | `frontend/src/routes/SharedPage.tsx` | `SharedScreen` (dashboards) | `/shared/{token}`; live topics over the WebSocket |
| `/tv` | `frontend/src/routes/TvPage.tsx` | `TvScreen` (dashboards) | `/dashboards` (logged in); the widgets' routes for the dashboard on screen |
| `/paineis` | `frontend/src/routes/DashboardsPage.tsx` | `DashboardsScreen` (dashboards) | `/dashboards`; POST, PUT and DELETE `/dashboards/{id}` |
| `/paineis/:id` | `frontend/src/routes/DashboardPage.tsx` | `DashboardScreen` (dashboards) | `/dashboards`, PUT and DELETE `/dashboards/{id}`, POST `/dashboards/{id}/shares` |
| `/explorar`, `/explorar/:nivel`, `/explorar/:nivel/:id` | `frontend/src/routes/ExplorePage.tsx` | `ExploreScreen` (results) | `/results`, `/geo-areas/children`, `/elections` |
| `/mapas` | `frontend/src/routes/MapsPage.tsx` | `MapsScreen` (maps) | `/results`, `/geo-areas/children`, `/maps/polling-places`, `/elections` |
| `/locais/:id` | `frontend/src/routes/PollingPlacePage.tsx` | `PollingPlaceScreen` (polling-places) | `/polling-places/{id}` |
| `/secoes/:id`, `/secoes/:uf/:mun/:zona/:secao` | `frontend/src/routes/PollingSectionPage.tsx` | `SectionScreen` (sections) | `/polling-sections/{id}` |
| `/candidatos` | `frontend/src/routes/CandidatesPage.tsx` | `CandidatesScreen` (results) | `/elections`, `/candidates` |
| `/candidatos/:sqcand` | `frontend/src/routes/CandidatePage.tsx` | `CandidateScreen` (results) | `/candidates/{id}`, and its map: `/geo-areas/children`, `/maps/polling-places` |
| `/eventos` | `frontend/src/routes/EventsPage.tsx` | `EventsScreen` (events) | `/events` |
| `/alertas` | `frontend/src/routes/AlertsPage.tsx` | `AlertsScreen` (alerts) | `/alerts`; POST, PUT and DELETE `/alerts/{id}` |
| `/conta` (`/entrar` redirects here) | `frontend/src/routes/AccountPage.tsx` | `AccountScreen` (accounts) | POST `/auth/login`, POST `/auth/register`, `/favorites`, `/candidates`; PUT `/preferences` |
| `/admin` | `frontend/src/routes/AdminPage.tsx` | `AdminScreen` (admin) | `/status`, `/admin/health` and `/admin/fake-tse` (polled every 5 s); POST `/admin/fake-tse`, POST `/admin/collector/pause` and `/resume` |
| `*` | `frontend/src/routes/NotFoundPage.tsx` | `NotFoundPage` (no module) | none |

`frontend/src/App.tsx` declares the routes; each screen is `lazy`, and `main.tsx` shows a loader
while it loads. The e2e list (`frontend/e2e/helpers.ts`) must match these routes.

## Modules

Each folder of `frontend/src/modules/` is a domain. Hooks call the API through `api()`; their
routes are in the screen table above.

- `frontend/src/modules/shell/`: `AppLayout` (shell, reconnect banner after 2.5 s), `FilterBar` (breadcrumb, office, time chip, favorites), `TimeSlider` with `TimeTransport` and `TimelineTrack` (replay of the past, events as markers), `LiveIndicator`, `Navbar`, `Search` (Spotlight). Hooks: `useSearch` (`/search`), `useBackToLive`, `useReplayClock`. Its index exports `AppLayout`, `FilterBar`, `Header`, `LiveIndicator`, `Navbar`, `Search`, `TimeSlider`, `useSearch`.
- `frontend/src/modules/results/`: the result screens. Folders `explore/`, `candidates-list/`, `candidate-page/`, `geo-area-table/`, `scoreboard/` and `components/` (`WithResults`, `Pickers`, `TotalsBlock`, `DataSource` with the JWS signature, `CandidateCard`). Hooks: `useStatus` (`/status`), `useElections` (`/elections`), `useResults` (`/results`), `useChildren` (`/geo-areas/children`), `useCandidates` (`/candidates`), `useCandidate` (`/candidates/{id}`). The index re-exports the screens and the hooks.
- `frontend/src/modules/charts/`: ECharts components (`Donut`, `Hemicycle`, `Evolution`, `ProgressHeatmap` with `ProgressTile`) and the option builders (`donutOption.ts`, `hemicycleOption.ts`, `evolutionOption.ts`), `stateGrid.ts` (the cartogram of states). Hooks: `useSeries` (`/results/series`), `useProgress` (`/progress`).
- `frontend/src/modules/maps/`: the electoral map (`ElectoralMap` loads MapLibre and deck.gl on demand), its legend, layers (`mapLayers.ts`), scales, picking and viewport hooks. Hooks: `useMapPollingPlaces` (`/maps/polling-places`); `useStateMesh` and `useMunicipalityMesh` read the static `/geo/br-uf.json` and `/geo/br-mun.json` once. `useMapData` reads `useChildren`.
- `frontend/src/modules/dashboards/`: the largest module (dashboard repository, schema, editor, widget registry, grid and drawers). `repo.ts` keeps the dashboards of a logged-in user in the API and the others in `localStorage`; `schema.ts` validates the JSON with zod; `widgets/` holds the 16 widget types (`registry.ts`, `result-widgets.tsx`, `comparison-widgets.tsx`, `detail-widgets.tsx`, the definitions); `grid/` is react-grid-layout with one column on small screens; `panels/` the configuration drawers; `modals/` the new-dashboard and share modals; `view/` the header, the controls, `useAutosave` (saves 900 ms after the last change) and the edit session; `file.ts` the import and export. Hook: `useDashboards` (`/dashboards`, PUT and DELETE `/dashboards/{id}`); `ShareLinkForm` POSTs `/dashboards/{id}/shares`.
- `frontend/src/modules/events/`: `EventFeed`, `EventsScreen`, and `lib.ts` (label and color of each event type). Hooks: `useEvents` (`/events`, filtered by time on the client), `useTimeline` (`/timeline`).
- `frontend/src/modules/alerts/`: `AlertsScreen`, `AlertsTable`, `NewAlertCard`, `PushCard` (browser permission), and `rules.ts` (the fields each rule shows). Hooks: `useAlerts`, `useSaveAlert` (POST, or PUT with an id), `useDeleteAlert`.
- `frontend/src/modules/accounts/`: `AccountScreen`, `AuthModal`, `UserMenu`, `CandidateColors`, and `PrefsSync` (saves the preferences 1.2 s after a change, PUT `/preferences`). `hooks.ts` holds `useLogin`, `useRegister`, `useFavoritesApi` (`/favorites`), `usePreferencesApi` (`/preferences`) and `useMe`. `store.ts` holds `useFavorites`: the account's favorites when logged in (POST `/favorites`, DELETE `/favorites/{type}/{ref}`), the browser's otherwise.
- `frontend/src/modules/polling-places/`: `PollingPlaceScreen` and `PollingPlaceDetail`; hook `usePollingPlace` (`/polling-places/{id}`, refetched every 60 s).
- `frontend/src/modules/sections/`: `SectionScreen` and `SectionDetail` (the hash of the ballot box and the link to the raw BU); hook `useSection` (`/polling-sections/{id}`).
- `frontend/src/modules/admin/`: `AdminScreen`, `CollectorCard`, `FakeClockCard` and `FakeClockControls`, `Metrics` and `MetricValue` (generic, the shape of `/admin/health` is free). Hooks: `useAdminHealth`, `useAdminFake`, `useRunAdminCommand`.
- `frontend/src/modules/realtime/`: the WebSocket client and the cache updates; see "Real time".

## API client

`frontend/src/api/client.ts` is the only place that calls `fetch`. `api<T>(path, { method, body,
params, signal })` prefixes `/api/v1`, adds the Bearer token of `frontend/src/lib/auth-store.ts`,
and sends JSON. `params` go through `qs`, which drops `null`, `undefined` and empty values and joins
arrays with commas. A network failure becomes `ApiError` with status 0 and the text "Sem conexão";
a non-2xx answer goes through `readProblem`, which reads the `application/problem+json` body into
`ApiError` (`status`, `title`, `detail`, the text the user sees). A body that is not JSON (a proxy
page) gets a default text per status, and FastAPI's validation list gives its first message. A 401
on a session call (any path not under `/auth/`) signs the user out. `isNotFound` tests a 404.

`frontend/src/api/types.ts` is generated and not edited: `make web-types` runs
`backend/tools/openapi.py` (it writes `openapi.json` at the repository root) and then
`npm run types` (openapi-typescript). CI regenerates it and fails on a diff (`.github/workflows/ci.yml`).
`frontend/src/api/models.ts` gives the readable names (`ResultsDto`, `Level`, `CandidateStatus`,
`EventType`, `SearchType`, ...) and the WebSocket message types. `frontend/src/api/query-keys.ts`
holds `qk`, the query keys (for example `resultados`, `filhos`, `locais`, `progresso`, `eventos`,
`linha`, `paineis`), `EventFilter`, and `timeQueryOptions(t, wsOpen)`: live queries (`t` null) go
stale after 20 s and refetch every 60 s while the socket is open (30 s otherwise); a query with a
time `t` is history, with `staleTime: Infinity`.

## Real time

`frontend/src/modules/realtime/socket.ts` holds one `LiveSocket` per tab, started in `main.tsx`.
It connects to `/api/v1/ws` (`ws` or `wss` by the page protocol). Subscriptions are reference
counted: a topic is sent to the server once per tab, and `unsubscribe` goes out with the last
release. On open it sends `auth` (when logged in) and every topic; it pings every 25 s. A close
schedules a reconnect with exponential backoff (1 s doubling, 30 s cap, jitter). A login sends
`auth`; a logout restarts the socket. When the tab becomes visible with a closed socket, it
reconnects at once. A reconnect invalidates the `status`, `eventos` and `linha` queries and the live
families (`resultados`, `filhos`, `locais`, `progresso`) whose last key is `null`, because they
missed messages.

`frontend/src/modules/realtime/topics.ts` builds the topic names as the backend publishes them:
`results:{round}:{office}:{level}:{id}`, `children:...` (with the child level for the country's
municipalities), `polling_places:{round}:{office}:{municipality}`, `progress:{round}`,
`events:{round}` and `status`. `useLive(topics)` subscribes while the component is mounted.

`frontend/src/modules/realtime/apply.ts` (`applyMessage`) writes each server message into the
query cache, with no refetch: `status` replaces the status query; `results` replaces the query of
that area; `children` merges one child into every cached list of that level and recounts the
wins; `polling_place` merges one place into the map lists of its state or municipality; `progress`
replaces the progress; `event` puts the event at the head of the matching `eventos` lists and, for
the country and the states, into the timeline; `alert` shows a notification (and a browser one when
push is on). When the user looks at a past instant (`useTime` has `t`), the live messages are
ignored, and an event only counts a missed update in `useTime`.

## Shared code

- `frontend/src/lib/formatting.ts`: `fmtInt`, `fmtPct`, `fmtPP`, `fmtCompact`, `fmtNum` (pt-BR
  numbers, `—` for missing values), `initials`, `slug`, `stripAccents`. The only file that may call
  `toLocaleString`; the other screens format numbers through these helpers.
- `frontend/src/lib/palettes.ts` and `frontend/src/lib/palettes/` (`charts.ts`, `dashboards.ts`,
  `maps.ts`, `results.ts`, `shell.ts`): every hex color of the app. `DARK_BACKGROUND`,
  `PALETTE` (12 neutral colors), `PARTY_COLORS`, `SITUATION_STYLES`, sequential and diverging
  interpolations. `frontend/src/theme.ts` builds the Mantine theme with a scale (1.3 in TV mode, 0.92
  in compact density).
- `frontend/src/lib/time.ts`: dayjs with the pt-BR locale and `America/Sao_Paulo`, `fmtTime`,
  `fmtDateTime`, `fmtShortDate`. `frontend/src/lib/time-store.ts`: the selected instant `t` (null =
  live), the replay (`playing`, `speed` in 1, 10, 60, 300) and the count of updates while frozen.
- `frontend/src/lib/geo-areas.ts`: the levels, their labels, the URL segments (`country` to `br`,
  `state` to `uf`, `municipality` to `municipio`, `zone` to `zona`, `polling_place` to `local`,
  `section` to `secao`), `childLevel`, `stateOfId`, `geoAreaLink`, `sectionIdFromParams` (the zone
  and the section pad to four digits), and `UFS`.
- `frontend/src/lib/offices.ts`: the office options; state deputy (7) and district deputy (8) are
  one option, resolved by the state (the Federal District takes 8).
- `frontend/src/lib/effective-filter.tsx`: `FilterProvider` overrides the global filter for a
  subtree (a pinned widget, a frozen shared dashboard); `useEffectiveFilter` merges both and
  `useFixedTime` tells when the time is fixed.
- `frontend/src/lib/export.ts`: `exportData` downloads `/exports` (CSV or JSON) of an area's results
  or children, `downloadJson`, and `exportPng` (html-to-image) for a widget.
- `frontend/src/lib/useColor.ts`: `useCandidateColor`: the user's color, then the default, then the
  color of the ballot number.
- `frontend/src/components/Num.tsx`: `NumberFlow` numbers, and `useFlash` (the glow of a changed
  cell for 1.4 s). `frontend/src/components/States.tsx`: `Loading` skeleton, `NoData`, `ErrorView`.

## Stored data formats

The browser stores six keys (zustand `persist`, `localStorage`):

| Key | Store | What it holds |
|---|---|---|
| `eleicoes.auth` | `frontend/src/lib/auth-store.ts` | `token`, `user` (reads the old `usuario`) |
| `eleicoes.prefs` | `frontend/src/lib/prefs-store.ts` | `tema`, `densidade`, `animacoes`, `coresCandidatos`, `toasts`, `push`, `basemap` |
| `eleicoes.filtro` | `frontend/src/lib/filter-store.ts` | `ciclo`, `turno`, `cargo`, `nivel`, `id`, `nome` (time is not kept) |
| `eleicoes.nav` | `frontend/src/lib/ui-store.ts` | `aberta` (the desktop navbar) |
| `eleicoes.favoritos` | `frontend/src/modules/accounts/store.ts` | `favoritos` of a visitor (reads `tipo`, `rotulo`) |
| `eleicoes.paineis` | `frontend/src/modules/dashboards/repo.ts` | `paineis` of a visitor: `nome`, `ordem`, `padrao`, `atualizado_em`, `remoto`, `config` |

The dashboard JSON (`dashboards.config` in the API, `paineis[].config` in the browser and the file
export) keeps its Portuguese keys: `schemaVersion`, `filtroGlobal` (`ambiente`, `ciclo`, `turno`,
`cargo`, `nivel`, `recorte`, `tempo`), `widgets[]` (`id`, `tipo`, `pos` with `x`, `y`, `w`, `h`,
`herda`, `filtros`, `config`) and `layouts` per breakpoint. Widget type ids are `placar`, `totais`,
`kpi`, `mapa`, `evolucao`, `tabela`, `comparativo`, `hemiciclo`, `rosca`, `heatmap`, `eventos`,
`candidato`, `local`, `secao`, `relogio`, `texto`. The file export has `formato` set to
`eleicoes-dashboard/painel`. The schema reads the old levels (`br`, `uf`, `municipio`, `zona`,
`local`, `secao`) and maps them to the English ones. The toasts saved under the old names
(`virada`, `marco`, `eleito`, ...) are mapped on load. Map kinds are in the URL (`?tipo=`).

Why these stay in Portuguese: glossary decision 8. Saved dashboards, shared links and the
`localStorage` copies are user data; the code that reads them changes, the format does not. The
same holds for the URL segments and screen URLs, the widget ids and the `colunas` of the table.

## Lint rules

`frontend/eslint.config.js` (flat config, `npm run lint`). For `src/**`: `max-lines-per-function`
100 and `max-lines` 300 (blank lines and comments do not count); `react-hooks/exhaustive-deps` is an
error; `no-explicit-any` is an error. Reuse rules, each one allowed in the file that implements it:
a hex color literal is only allowed in `src/lib/palettes.ts`, `src/lib/palettes/*.ts` and
`src/theme.ts`; a `toLocaleString` call is only allowed in `src/lib/formatting.ts` (use `fmtInt`,
`fmtPct`, `fmtPP`, `fmtCompact` or `fmtNum`). Module boundaries: a module is imported only through
its `index.ts`, by its alias or by a relative path; `components/`, `lib/` and `api/` never import a
module. Prettier is separate (`npm run format:check`); `eslint-config-prettier` turns off the style
rules.

## Tests

Vitest 3 with jsdom (`frontend/vite.config.ts`, `test` block). `frontend/tests/setup.ts` adds the
jest-dom matchers, cleans up after each test and drops the `AbortSignal` of a `Request`, which
Node rejects under jsdom. The screen helper `frontend/tests/helpers/screen.tsx` has:

- `renderScreen(url)`: the real router (`routes` from `src/App.tsx`, a memory router) inside
  `AppProviders`, with a query client that does not retry. Screen URLs are passed as written.
- `fakeApi({ "GET /path": answer })`: replaces `fetch`. An answer is a value, a function of the
  call, or `{ status, body }` for a failure (`problem(status, detail)` builds the body). A route that
  is not declared answers 404 "Rota não declarada" naming it, so the test says what is missing.
  `SHELL_ANSWERS` gives the answers every screen gets (status, elections, timeline, dashboards,
  candidates, favorites, preferences, alerts, events). A fake `WebSocket` is installed too.

Data fixtures are in `frontend/tests/helpers/data-results.ts`, `data-dashboards.ts` and
`data-shell.ts`. The unit tests cover `lib/` and the modules' pure functions (`tests/lib-*.test.ts`,
`tests/realtime-*.test.ts`, `tests/dashboards-*.test.ts`); every screen with logic has a screen test.
The coverage gate (`npm run coverage`, v8) includes `src/**`, excludes `src/api/types.ts` and
`src/main.tsx`, and requires 60% of lines, statements, functions and branches.

`frontend/tests/e2e-routes-list.test.ts` compares the leaf routes of `routes` (joined through their
parents) with the `ROUTES` list of `frontend/e2e/helpers.ts`, in both directions, and checks that each
sample path matches its pattern. A new route without an entry fails here.

E2E is Playwright (`frontend/playwright.config.ts`) against the production build through
`vite preview`, with the system Chrome (`channel: chrome`). Projects: `setup`
(`frontend/e2e/setup.e2e.ts`, creates the e2e account through the API when `E2E_EMAIL` and
`E2E_SENHA` are set); `routes` (`frontend/e2e/routes.e2e.ts`, every route opens without a page error
or the error screen); `mobile` (`frontend/e2e/mobile.e2e.ts`, 390 by 844, no horizontal scroll,
screenshots in `frontend/captures/`); `flows` (`frontend/e2e/flows/`: login, explore, dashboards,
depends on `setup`). CI runs `npm run e2e && npm run mobile && npm run e2e:flows`.

## Points of attention

- `frontend/src/lib/geo-areas.ts`: the doc comment "Screen URL of a geo area" sits above the doc
  comment of `sectionIdFromParams`, so `geoAreaLink` has no comment and the section helper has two.
- `useMe` in `frontend/src/modules/accounts/hooks.ts` has no caller; remove it or use it.
- `setDefault` and `reorder` in `frontend/src/modules/dashboards/hooks.ts` send one PUT per changed
  dashboard, in sequence, with no transaction: a failure in the middle leaves a mixed order or default.
- `frontend/src/modules/accounts/components/PrefsSync.tsx` drops a failed PUT `/preferences` with
  `catch(() => undefined)`: the user's change is lost without a message.
- The session token lives in `localStorage` (`eleicoes.auth`), so any script on the origin can read it.
- The list of "live" query families is written twice: `LIVE_QUERY_FAMILIES` in
  `frontend/src/modules/shell/hooks.ts` and the reconnect predicate in
  `frontend/src/modules/realtime/socket.ts`. Change both together.
- `applyAlert` in `frontend/src/modules/realtime/apply.ts` is not gated by the `toasts` preference,
  unlike event toasts in the same file. Check whether that is intended.
- Language: CLAUDE.md and the glossary put code in English, but `frontend/vite.config.ts` has a
  Portuguese comment and the e2e helpers are named in Portuguese (`abrirRota`,
  `entrarPeloFormulario`, `limparPaineisE2e`).
- `frontend/Dockerfile.dev` runs `npm ci` on every start of the container.
- The spec `specs/09-frontend.md` is the source of this domain; the points where the code differs
  from it are the ones above.
