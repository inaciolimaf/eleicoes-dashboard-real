import type {
  AdminHealthDto,
  AlertDto,
  CandidateDto,
  ElectionDto,
  FakeTseStateDto,
  StatusDto,
  TimelineDto,
  UserDto,
} from "../../src/api/models";
import { DEFAULT_FILTER, useFilter } from "../../src/lib/filter-store";
import { DEFAULT_PREFS, usePrefs } from "../../src/lib/prefs-store";
import { useAuth } from "../../src/lib/auth-store";
import { useLocalFavorites } from "../../src/modules/accounts/store";
import { useTime } from "../../src/lib/time-store";
import { useUi } from "../../src/lib/ui-store";

/** An ISO instant `minutes` before now (negative minutes are in the future). */
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const ADMIN_USER = {
  id: "user-admin",
  email: "admin@example.com",
  name: "Ana Admin",
  is_admin: true,
} as UserDto;

export const VOTER_USER = {
  id: "user-voter",
  email: "eleitor@example.com",
  name: "Bruno Eleitor",
  is_admin: false,
} as UserDto;

/** A live collection, updated a minute ago, unless the test overrides a field. */
export function liveStatus(overrides: Partial<StatusDto> = {}): StatusDto {
  return {
    live: true,
    tse_environment: "oficial",
    last_collection: minutesAgo(1),
    last_tally: minutesAgo(1),
    release_start: null,
    pct_sections_br: 42.5,
    collector: { paused: false, requests_per_second: 3.5 },
    ...overrides,
  } as StatusDto;
}

/** The first round of the 2026 election, with the presidency as the only office. */
export const ELECTIONS = [
  {
    id: 1,
    round: 1,
    cycle: "ele2026",
    jurisdiction: "BR",
    name: "Eleição 2026",
    election_code: 1,
    offices: [{ office_code: 1, name: "Presidente" }],
  },
] as unknown as ElectionDto[];

/** A timeline with no events and no window (the slider shows its empty state). */
export const EMPTY_TIMELINE: TimelineDto = { start: null, end: null, now: null, events: [] };

/** A timeline spanning the last two hours, with the given events. */
export function timelineWith(events: unknown[] = []): TimelineDto {
  return {
    start: minutesAgo(120),
    end: minutesAgo(0),
    now: minutesAgo(0),
    events,
  } as unknown as TimelineDto;
}

export const CANDIDATES = [
  {
    tse_candidate_id: "280001",
    ballot_number: 13,
    ballot_name: "Ana Lima",
    party_abbreviation: "PT",
    photo_url: null,
    color: "#3D7BFF",
    state_code: null,
  },
] as unknown as CandidateDto[];

/** Dashboards as the API sends them (the screens map them to their own names). */
export const DASHBOARDS = [
  {
    id: "dash-main",
    name: "Painel Principal",
    position: 0,
    is_default: true,
    schema_version: 1,
    config: {},
    updated_at: null,
  },
  {
    id: "dash-second",
    name: "Painel Secundário",
    position: 1,
    is_default: false,
    schema_version: 1,
    config: {},
    updated_at: null,
  },
];

export const ALERT_RULE = {
  id: "alert-1",
  type: "candidate_pct",
  params: { office_code: 1, level: "country", geo_area_id: "br", tse_candidate_id: "280001", threshold: 50 },
  active: true,
  triggered_at: null,
} as unknown as AlertDto;

export const ADMIN_HEALTH = {
  queue_size: 5,
  workers: { jobs_done: 12, failed: 0 },
  collector_ok: true,
  last_error: null,
} as unknown as AdminHealthDto;

export const FAKE_TSE_STATE = {
  paused: false,
  speed: 60,
  simulated_now: minutesAgo(30),
} as unknown as FakeTseStateDto;

/** Puts every store the shell reads back in its initial state, and clears the browser storage. */
export function resetStores(): void {
  localStorage.clear();
  useAuth.setState({ token: null, user: null });
  useUi.setState({ authOpen: false, navbarOpen: false, wsStatus: "connecting" });
  useTime.setState({ t: null, playing: false, updates: 0 });
  useFilter.setState(DEFAULT_FILTER);
  usePrefs.setState(DEFAULT_PREFS);
  useLocalFavorites.setState({ favorites: [] });
}
