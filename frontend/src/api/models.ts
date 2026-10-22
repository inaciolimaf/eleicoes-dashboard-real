/**
 * Readable names for the generated API types (`types.ts`, from the backend OpenAPI).
 * Field names and values are the API's (English); only the aliases and the literal unions live here.
 */
import type { components } from "./types";

type Schemas = components["schemas"];

export type StatusDto = Schemas["StatusDto"];
export type ElectionDto = Schemas["ElectionDto"];
export type OfficeDto = Schemas["OfficeDto"];
export type ResultsWithDataDto = Schemas["ResultsWithDataDto"];
export type ResultsWithoutDataDto = Schemas["ResultsWithoutDataDto"];
export type ResultsDto = ResultsWithDataDto | ResultsWithoutDataDto;
export type TotalsDto = Schemas["TotalsDto"];
export type CoverageDto = Schemas["CoverageDto"];
export type LeaderDto = Schemas["LeaderDto"];
export type CandidateResultDto = Schemas["CandidateResultDto"];
export type AllianceDto = Schemas["AllianceDto"];
export type ViceDto = Schemas["ViceDto"];
export type GeoAreaDto = Schemas["GeoAreaDto"];
export type GeoAreaRefDto = Schemas["GeoAreaRefDto"];
export type SeriesDto = Schemas["SeriesDto"];
export type SeriesPointDto = Schemas["SeriesPointDto"];
export type SeriesPointCandidateDto = Schemas["SeriesPointCandidateDto"];
export type SeriesCandidateDto = Schemas["SeriesCandidateDto"];
export type ChildrenDto = Schemas["ChildrenDto"];
export type ChildItemDto = Schemas["ChildItemDto"];
export type ChildCandidateDto = Schemas["ChildCandidateDto"];
export type CandidateShortDto = Schemas["CandidateShortDto"];
export type LeaderPartyDto = Schemas["LeaderPartyDto"];
export type ProgressDto = Schemas["ProgressDto"];
export type ProgressCountryDto = Schemas["ProgressCountryDto"];
export type ProgressItemDto = Schemas["ProgressItemDto"];
export type MapPollingPlacesDto = Schemas["MapPollingPlacesDto"];
export type MapPollingPlaceDto = Schemas["MapPollingPlaceDto"];
export type PollingPlaceDto = Schemas["PollingPlaceDto"];
export type PollingPlaceDiagnosticsDto = Schemas["PollingPlaceDiagnosticsDto"];
export type PollingSectionDto = Schemas["PollingSectionDto"];
export type PollingSectionSummaryDto = Schemas["PollingSectionSummaryDto"];
export type SectionOfficeDto = Schemas["SectionOfficeDto"];
export type SectionVoteDto = Schemas["SectionVoteDto"];
export type RefDto = Schemas["RefDto"];
export type ZoneRefDto = Schemas["ZoneRefDto"];
export type CandidateDto = Schemas["CandidateDto"];
export type CandidateDetailDto = Schemas["CandidateDetailDto"];
export type CandidateResultSummaryDto = Schemas["CandidateResultSummaryDto"];
export type SearchDto = Schemas["SearchDto"];
export type SearchItemDto = Schemas["SearchItemDto"];
export type EventDto = Schemas["EventDto"];
export type TimelineDto = Schemas["TimelineDto"];
export type UserDto = Schemas["UserDto"];
export type TokenDto = Schemas["TokenDto"];
export type DashboardDto = Schemas["DashboardDto"];
export type DashboardCreate = Schemas["DashboardCreate"];
export type DashboardUpdate = Schemas["DashboardUpdate"];
export type ShareDto = Schemas["ShareDto"];
export type SharedDashboardDto = Schemas["SharedDashboardDto"];
export type FavoriteDto = Schemas["FavoriteDto"];
export type FavoriteCreate = Schemas["FavoriteCreate"];
export type AlertDto = Schemas["AlertDto"];
export type AlertCreate = Schemas["AlertCreate"];
export type AlertUpdate = Schemas["AlertUpdate"];
export type PreferencesDto = Schemas["PreferencesDto"];
export type PreferencesUpdate = Schemas["PreferencesUpdate"];
export type AdminHealthDto = Schemas["AdminHealthDto"];
export type CollectorMetricsDto = Schemas["CollectorMetricsDto"];
export type CollectorPausedDto = Schemas["CollectorPausedDto"];
export type FakeTseStateDto = Schemas["FakeTseStateDto"];
export type FakeTseControlCreate = Schemas["FakeTseControlCreate"];
export type LoginCreate = Schemas["LoginCreate"];
export type RegisterCreate = Schemas["RegisterCreate"];
export type HealthDto = Schemas["HealthDto"];
export type ValidationError = Schemas["ValidationError"];

/** Geographic level, the API's `level` values. `br` is only the id of the country area. */
export type Level = "country" | "state" | "municipality" | "zone" | "polling_place" | "section";

/** Candidate situation (`status`, `overall_status`), as the TSE publishes it or computed by the API. */
export type CandidateStatus =
  | "ELECTED"
  | "RUNOFF"
  | "MATHEMATICALLY_ELECTED"
  | "LEADING"
  | "SUBSTITUTE"
  | "NOT_ELECTED"
  | "SUB_JUDICE"
  | "COUNTING";

/** Tally progress of a geo area or polling place (`status`). */
export type TallyStatus = "not_received" | "partial" | "tallied";

/** Event `type` values emitted by the event detection. */
export type EventType =
  "start" | "milestone" | "lead_change" | "elected" | "mathematically_decided" | "runoff";

export type AlertType = AlertDto["type"];

/** Kind of a search hit (`SearchItemDto.type`): a geo area level or a candidate. */
export type SearchType = "state" | "municipality" | "zone" | "polling_place" | "section" | "candidate";
export type FavoriteType = FavoriteDto["type"];
export type ShareMode = "live" | "frozen";
export type ShareCreate = Schemas["ShareCreate"];

// ---------------------------------------------------------------- WebSocket (`/api/v1/ws`)
// Client -> server. `resume` asks the server to tell the client to refetch what it may have missed.
export type WsClientMessage =
  | { op: "subscribe" | "unsubscribe"; topics: string[] }
  | { op: "auth"; token: string }
  | { op: "ping" }
  | { op: "resume" };

/** Alert payload pushed on the user's own topic (`user:{id}`). */
export interface AlertPush {
  title: string;
  description: string;
  alert_id: string;
}

// Server -> client. `seq` is per connection; `topic` is absent on the control messages.
export type WsServerMessage =
  | { type: "results"; topic: string; seq: number; data: ResultsDto }
  | { type: "children"; topic: string; seq: number; data: ChildItemDto }
  | { type: "polling_place"; topic: string; seq: number; data: MapPollingPlaceDto }
  | { type: "progress"; topic: string; seq: number; data: ProgressDto }
  | { type: "event"; topic: string; seq: number; data: EventDto }
  | { type: "status"; topic: string; seq: number; data: StatusDto }
  | { type: "alert"; topic: string; seq: number; data: AlertPush }
  | { type: "auth"; seq: number; ok: boolean }
  | { type: "pong"; seq: number }
  | { type: "resync"; seq: number }
  | { type: "error"; seq: number; message: string };
