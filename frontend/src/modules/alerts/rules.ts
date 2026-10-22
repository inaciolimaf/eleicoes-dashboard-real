import type { AlertDto, AlertType, Level } from "../../api/models";
import { defaultGeoAreaName } from "../../lib/geo-areas";
import { OFFICE_NAME } from "../../lib/offices";

export const ALERT_TYPE_OPTIONS: { value: AlertType; label: string }[] = [
  { value: "candidate_pct", label: "Quando um candidato passar de X%" },
  { value: "lead_change", label: "Quando houver virada em um recorte" },
  { value: "tally_threshold", label: "Quando a apuração chegar a N%" },
  { value: "elected", label: "Quando o candidato for eleito" },
  { value: "polling_place_tallied", label: "Quando um local de votação for apurado" },
];

/** Which fields the new-alert form shows for each rule. */
export interface AlertFields {
  office: boolean;
  area: boolean;
  candidate: boolean;
  limit: boolean;
  pollingPlace: boolean;
}

export function alertFields(type: AlertType): AlertFields {
  return {
    office: type === "candidate_pct" || type === "lead_change" || type === "elected",
    area: type === "candidate_pct" || type === "lead_change" || type === "tally_threshold",
    candidate: type === "candidate_pct" || type === "elected",
    limit: type === "candidate_pct" || type === "tally_threshold",
    pollingPlace: type === "polling_place_tallied",
  };
}

/** What the user filled in the new-alert form. */
export interface AlertFormValues {
  officeCode: number;
  geoArea: { level: Level; id: string } | null;
  candidateCode: string | null;
  threshold: number;
  pollingPlaceId: string | undefined;
}

/**
 * The `params` the API expects for each rule. Returns null when a field the rule needs is empty,
 * so the form does not send a rule that cannot fire.
 */
export function buildAlertParams(type: AlertType, form: AlertFormValues): Record<string, unknown> | null {
  const params: Record<string, unknown> = {};
  const area = form.geoArea;
  if (type === "candidate_pct")
    Object.assign(params, {
      office_code: form.officeCode,
      level: area?.level,
      geo_area_id: area?.id,
      tse_candidate_id: form.candidateCode,
      threshold: form.threshold,
    });
  if (type === "lead_change")
    Object.assign(params, { office_code: form.officeCode, level: area?.level, geo_area_id: area?.id });
  if (type === "tally_threshold")
    Object.assign(params, { level: area?.level, geo_area_id: area?.id, threshold: form.threshold });
  if (type === "elected") Object.assign(params, { tse_candidate_id: form.candidateCode });
  if (type === "polling_place_tallied") Object.assign(params, { polling_place_id: form.pollingPlaceId });
  return Object.values(params).some((value) => value === undefined || value === null) ? null : params;
}

/** The rule of an alert written as a sentence, for the table. */
export function describeAlert(alert: AlertDto): string {
  const p = alert.params as Record<string, string | number | undefined>;
  const where = p.level && p.geo_area_id ? defaultGeoAreaName(p.level as Level, String(p.geo_area_id)) : "";
  switch (alert.type) {
    case "candidate_pct":
      return `Candidato ${p.tse_candidate_id} passar de ${p.threshold}% (${OFFICE_NAME[Number(p.office_code)] ?? ""}${where ? ` · ${where}` : ""})`;
    case "lead_change":
      return `Virada em ${where || "—"} (${OFFICE_NAME[Number(p.office_code)] ?? ""})`;
    case "tally_threshold":
      return `Apuração de ${where || "—"} chegar a ${p.threshold}%`;
    case "elected":
      return `Candidato ${p.tse_candidate_id} ser eleito`;
    case "polling_place_tallied":
      return `Local ${p.polling_place_id} ser 100% apurado`;
  }
  return alert.type;
}
