import { describe, expect, it } from "vitest";
import {
  asLevel,
  childLevel,
  defaultGeoAreaName,
  geoAreaLink,
  levelOfSegment,
  municipalityOfId,
  LEVEL_LABELS,
  sectionIdFromParams,
  segmentOfLevel,
  stateOfId,
  STATE_BY_CODE,
  UFS,
  zoneOfId,
} from "../src/lib/geo-areas";

describe("URL segments of the geo levels", () => {
  it("maps each level to its Portuguese URL segment and back", () => {
    expect(segmentOfLevel("country")).toBe("br");
    expect(segmentOfLevel("municipality")).toBe("municipio");
    expect(segmentOfLevel("section")).toBe("secao");
    expect(levelOfSegment("local")).toBe("polling_place");
    expect(levelOfSegment("zona")).toBe("zone");
  });

  it("returns null for an unknown or missing segment", () => {
    expect(levelOfSegment("nada")).toBeNull();
    expect(levelOfSegment(undefined)).toBeNull();
  });

  it("reads a DTO level string as a Level", () => {
    expect(asLevel("state")).toBe("state");
  });
});

describe("childLevel", () => {
  it("walks down the drill-down and stops at the section", () => {
    expect(childLevel("country")).toBe("state");
    expect(childLevel("state")).toBe("municipality");
    expect(childLevel("municipality")).toBe("zone");
    expect(childLevel("zone")).toBe("polling_place");
    expect(childLevel("polling_place")).toBe("section");
    expect(childLevel("section")).toBeNull();
  });
});

describe("ids of geo areas", () => {
  it("takes the state code from the first two characters", () => {
    expect(stateOfId("state", "SP")).toBe("sp");
    expect(stateOfId("municipality", "3550308")).toBe("35");
    expect(stateOfId("country", "br")).toBeNull();
  });

  it("takes the municipality from the id prefix, except above the municipality level", () => {
    expect(municipalityOfId("zone", "3550308-z0012")).toBe("3550308");
    expect(municipalityOfId("section", "3550308-z0012-s0034")).toBe("3550308");
    expect(municipalityOfId("state", "sp")).toBeNull();
    expect(municipalityOfId("country", "br")).toBeNull();
  });

  it("takes the zone from the zone or the section id", () => {
    expect(zoneOfId("zone", "3550308-z0012")).toBe("3550308-z0012");
    expect(zoneOfId("polling_place", "3550308-z0012-l1")).toBe("3550308-z0012");
    expect(zoneOfId("section", "3550308-z0012-s0034")).toBe("3550308-z0012");
    expect(zoneOfId("state", "sp")).toBeNull();
  });
});

describe("geoAreaLink", () => {
  it("sends polling places and sections to their own screens", () => {
    expect(geoAreaLink("polling_place", "3550308-z0012-l1")).toBe("/locais/3550308-z0012-l1");
    expect(geoAreaLink("section", "3550308-z0012-s0034")).toBe("/secoes/3550308-z0012-s0034");
  });

  it("sends the other levels to the explore screen, with the encoded id", () => {
    expect(geoAreaLink("state", "sp")).toBe("/explorar/uf/sp");
    expect(geoAreaLink("zone", "35-z 1")).toBe("/explorar/zona/35-z%201");
  });
});

describe("sectionIdFromParams", () => {
  it("decodes the id of the /secoes/:id route", () => {
    expect(sectionIdFromParams({ id: "35-z0012-s0034" })).toBe("35-z0012-s0034");
    expect(sectionIdFromParams({ id: "35%2Dz0012" })).toBe("35-z0012");
  });

  it("builds the id from the TSE numbers of the long route, padding zone and section", () => {
    expect(sectionIdFromParams({ uf: "sp", mun: "3550308", zona: "12", secao: "34" })).toBe(
      "sp3550308-z0012-s0034",
    );
  });

  it("is empty when the URL has no section", () => {
    expect(sectionIdFromParams({ uf: "sp", mun: "3550308" })).toBe("");
    expect(sectionIdFromParams({})).toBe("");
  });
});

describe("names of geo areas before the API answers", () => {
  it("names the country and the states (Exterior for the zz code)", () => {
    expect(defaultGeoAreaName("country", "br")).toBe("Brasil");
    expect(defaultGeoAreaName("state", "sp")).toBe("São Paulo");
    expect(defaultGeoAreaName("state", "zz")).toBe("Exterior");
    expect(defaultGeoAreaName("state", "xx")).toBe("XX");
  });

  it("names zones and sections by their number", () => {
    expect(defaultGeoAreaName("zone", "3550308-z0012")).toBe("Zona 12");
    expect(defaultGeoAreaName("section", "3550308-z0012-s0034")).toBe("Seção 34");
    expect(defaultGeoAreaName("zone", "3550308")).toBe("Zona 0");
  });

  it("falls back to the id for municipalities and polling places", () => {
    expect(defaultGeoAreaName("municipality", "3550308")).toBe("3550308");
    expect(defaultGeoAreaName("polling_place", "L1")).toBe("L1");
  });
});

describe("state table", () => {
  it("has the 27 units, indexed by code", () => {
    expect(UFS).toHaveLength(27);
    expect(STATE_BY_CODE.df.capital).toBe("Brasília");
  });

  it("labels every level in singular and plural", () => {
    expect(LEVEL_LABELS.country).toBe("Brasil");
  });
});
