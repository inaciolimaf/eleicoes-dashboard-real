import { describe, expect, it } from "vitest";
import type { AlertDto } from "../src/api/models";
import {
  alertFields,
  buildAlertParams,
  describeAlert,
  type AlertFormValues,
} from "../src/modules/alerts/rules";

const FILLED: AlertFormValues = {
  officeCode: 1,
  geoArea: { level: "state", id: "sp" },
  candidateCode: "280001",
  threshold: 60,
  pollingPlaceId: "354130",
};

describe("alertFields", () => {
  it("asks for the candidate and the office for an elected rule, and nothing geographic", () => {
    expect(alertFields("elected")).toEqual({
      office: true,
      area: false,
      candidate: true,
      limit: false,
      pollingPlace: false,
    });
  });

  it("asks for the area and the limit for a tally threshold", () => {
    expect(alertFields("tally_threshold")).toEqual({
      office: false,
      area: true,
      candidate: false,
      limit: true,
      pollingPlace: false,
    });
  });

  it("asks for a polling place only for a tallied polling place", () => {
    expect(alertFields("polling_place_tallied").pollingPlace).toBe(true);
    expect(alertFields("lead_change").pollingPlace).toBe(false);
  });
});

describe("buildAlertParams", () => {
  it("builds the candidate rule with the office, the area, the candidate and the limit", () => {
    expect(buildAlertParams("candidate_pct", FILLED)).toEqual({
      office_code: 1,
      level: "state",
      geo_area_id: "sp",
      tse_candidate_id: "280001",
      threshold: 60,
    });
  });

  it("builds the lead change rule without a limit", () => {
    expect(buildAlertParams("lead_change", FILLED)).toEqual({
      office_code: 1,
      level: "state",
      geo_area_id: "sp",
    });
  });

  it("builds the tally threshold rule without an office", () => {
    expect(buildAlertParams("tally_threshold", FILLED)).toEqual({
      level: "state",
      geo_area_id: "sp",
      threshold: 60,
    });
  });

  it("builds the elected rule from the candidate alone", () => {
    expect(buildAlertParams("elected", FILLED)).toEqual({ tse_candidate_id: "280001" });
  });

  it("builds the polling place rule from the polling place alone", () => {
    expect(buildAlertParams("polling_place_tallied", FILLED)).toEqual({ polling_place_id: "354130" });
  });

  it("refuses a rule whose field is empty", () => {
    expect(buildAlertParams("candidate_pct", { ...FILLED, candidateCode: null })).toBeNull();
    expect(buildAlertParams("lead_change", { ...FILLED, geoArea: null })).toBeNull();
    expect(buildAlertParams("polling_place_tallied", { ...FILLED, pollingPlaceId: undefined })).toBeNull();
  });
});

describe("describeAlert", () => {
  const rule = (type: AlertDto["type"], params: Record<string, unknown>) =>
    ({ id: "a", type, params, active: true, triggered_at: null }) as unknown as AlertDto;

  it("names the candidate, the limit and the place of a candidate rule", () => {
    const text = describeAlert(
      rule("candidate_pct", {
        office_code: 1,
        level: "country",
        geo_area_id: "br",
        tse_candidate_id: "280001",
        threshold: 50,
      }),
    );
    expect(text).toMatch(/^Candidato 280001 passar de 50% \(Presidente · /);
  });

  it("describes a lead change, a tally threshold, an election and a polling place", () => {
    expect(describeAlert(rule("lead_change", { office_code: 1 }))).toBe("Virada em — (Presidente)");
    expect(describeAlert(rule("tally_threshold", { threshold: 80 }))).toBe("Apuração de — chegar a 80%");
    expect(describeAlert(rule("elected", { tse_candidate_id: "280001" }))).toBe(
      "Candidato 280001 ser eleito",
    );
    expect(describeAlert(rule("polling_place_tallied", { polling_place_id: "354130" }))).toBe(
      "Local 354130 ser 100% apurado",
    );
  });

  it("falls back to the type for a rule it does not know", () => {
    expect(describeAlert(rule("unknown_kind" as AlertDto["type"], {}))).toBe("unknown_kind");
  });
});
