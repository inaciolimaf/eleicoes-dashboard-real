import { describe, expect, it } from "vitest";
import type { ChildItemDto, ChildrenDto, MapPollingPlaceDto } from "../src/api/models";
import {
  bboxOfGeometry,
  bboxOfPoints,
  BRAZIL_BBOX,
  extendBBox,
  prepareMesh,
  unionBBox,
  type BBox,
  type FeatureGeo,
} from "../src/modules/maps/lib";
import { mapScopeOf } from "../src/modules/maps/mapScope";
import { mapTargetOf } from "../src/modules/maps/mapTarget";
import { mapScaleOf } from "../src/modules/maps/mapScale";
import {
  hasNoData,
  pollingPlaceColor,
  regionColor,
  type CandidateColorFn,
  type RegionColorContext,
} from "../src/modules/maps/mapColors";
import { countByStatus, legendItemsOf, municipalityWins, partyTotals } from "../src/modules/maps/legendData";
import { backgroundStyle, basemapUrl } from "../src/modules/maps/mapStyle";
import { buildMapLayers, type MapLayerInputs } from "../src/modules/maps/mapLayers";
import { MAP_TYPE_LABELS, MAP_TYPES } from "../src/modules/maps/types";
import { MAP_BACKGROUND_DARK, MAP_BACKGROUND_LIGHT } from "../src/lib/palettes/maps";

const square = (x: number, y: number, size = 1): unknown => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

function feature(key: string, geometry: unknown, uf = "sp"): FeatureGeo {
  return {
    type: "Feature",
    geometry,
    properties: { uf: uf.toUpperCase() },
    bbox: bboxOfGeometry(geometry as never),
    key,
  } as unknown as FeatureGeo;
}

const candidateColor: CandidateColorFn = (_id, color) => color ?? "#123456";

const item = (over: Partial<ChildItemDto>): ChildItemDto =>
  ({
    id: "sp",
    name: "São Paulo",
    level: "state",
    state_code: "SP",
    status: "partial",
    pct_sections: 50,
    valid_votes: 100,
    electorate: 200,
    turnout: 150,
    leader: { tse_candidate_id: "280001", ballot_name: "Ana", color: "#D7191C", pct: 60 },
    second: null,
    margin_pp: 20,
    leader_party: { abbreviation: "PT", color: "#D7191C" },
    values: { "280001": 60, "280002": 40 },
    ...over,
  }) as unknown as ChildItemDto;

const place = (over: Partial<MapPollingPlaceDto>): MapPollingPlaceDto =>
  ({
    id: "35-z0012-l1",
    name: "Escola",
    status: "tallied",
    lat: -23.5,
    lon: -46.6,
    margin_pp: 12,
    sections_total: 4,
    sections_tallied: 4,
    valid_votes: 500,
    leader: { tse_candidate_id: "280001", ballot_name: "Ana", color: "#D7191C", pct: 60 },
    ...over,
  }) as unknown as MapPollingPlaceDto;

function context(over: Partial<RegionColorContext>): RegionColorContext {
  return {
    type: "vencedores",
    dark: true,
    highlight: null,
    candidateColor,
    candidateA: "280001",
    candidateB: "280002",
    scale: { min: 0, max: 100, suffix: "%" },
    ...over,
  };
}

describe("map geometry", () => {
  it("grows a box to contain nested coordinates", () => {
    const box: BBox = [0, 0, 0, 0];
    extendBBox(box, [
      [
        [-1, 2],
        [3, -4],
      ],
    ]);
    expect(box).toEqual([-1, -4, 3, 2]);
    extendBBox(box, "não é lista");
    expect(box).toEqual([-1, -4, 3, 2]);
  });

  it("computes the box of every geometry kind", () => {
    expect(bboxOfGeometry(square(0, 0, 2) as never)).toEqual([0, 0, 2, 2]);
    expect(
      bboxOfGeometry({
        type: "GeometryCollection",
        geometries: [square(0, 0) as never, { type: "Point", coordinates: [5, -1] }],
      } as never),
    ).toEqual([0, -1, 5, 1]);
  });

  it("unites boxes, and has no box for an empty list", () => {
    expect(unionBBox([])).toBeNull();
    expect(
      unionBBox([
        [0, 0, 1, 1],
        [-2, 3, 0, 4],
      ]),
    ).toEqual([-2, 0, 1, 4]);
  });

  it("widens the box of a single point so it can be framed", () => {
    const single = bboxOfPoints([{ lat: 1, lon: 2 }]) ?? [];
    expect(single.map((n) => Math.round(n * 100) / 100)).toEqual([1.99, 0.99, 2.01, 1.01]);
    expect(bboxOfPoints([{ lat: Number.NaN, lon: 2 }])).toBeNull();
    expect(bboxOfPoints([])).toBeNull();
    expect(
      bboxOfPoints([
        { lat: 0, lon: 0 },
        { lat: 1, lon: 1 },
        { lat: Number.NaN, lon: 9 },
      ]),
    ).toEqual([0, 0, 1, 1]);
  });

  it("prepares a collection: drops features without geometry, upper-cases the state and adds the join key", () => {
    const meshed = prepareMesh(
      {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { uf: "sp", id: "3550308" }, geometry: square(0, 0) as never },
          { type: "Feature", properties: { uf: "rj" }, geometry: null },
        ],
      } as never,
      (p) => String(p.id ?? ""),
    );
    expect(meshed).toHaveLength(1);
    expect(meshed[0].properties.uf).toBe("SP");
    expect(meshed[0].key).toBe("3550308");
    expect(meshed[0].bbox).toEqual([0, 0, 1, 1]);
  });

  it("frames the whole country by default", () => {
    expect(BRAZIL_BBOX[0]).toBeLessThan(BRAZIL_BBOX[2]);
  });
});

describe("map scope and framing", () => {
  it("draws the states at country level, the municipalities of every state, or the places of a municipality", () => {
    expect(mapScopeOf("country", "br", false)).toEqual({
      mode: "uf",
      uf: null,
      munId: null,
      childLevel: null,
    });
    expect(mapScopeOf("country", "br", true)).toEqual({
      mode: "mun",
      uf: null,
      munId: null,
      childLevel: "municipality",
    });
    expect(mapScopeOf("state", "sp", undefined)).toEqual({
      mode: "mun",
      uf: "sp",
      munId: null,
      childLevel: null,
    });
    expect(mapScopeOf("zone", "3550308-z0012", undefined)).toMatchObject({
      mode: "pontos",
      uf: "35",
      munId: "3550308",
    });
  });

  it("frames the country for the states map and the union of the regions for the municipalities", () => {
    expect(mapTargetOf("uf", "country", "br", [], [])).toBe(BRAZIL_BBOX);
    expect(mapTargetOf("mun", "country", "br", [], [])).toBe(BRAZIL_BBOX);
    const features = [feature("a", square(0, 0)), feature("b", square(5, 5))];
    expect(mapTargetOf("mun", "state", "sp", features, [])).toEqual([0, 0, 6, 6]);
    expect(mapTargetOf("mun", "state", "sp", [], [])).toBeNull();
  });

  it("frames the polling places of the zone or place, then the regions, then every place", () => {
    const places = [
      place({ id: "35-z0012-l1", lat: 0, lon: 0 }),
      place({ id: "35-z0012-l2", lat: 1, lon: 1 }),
      place({ id: "35-z0099-l1", lat: 9, lon: 9 }),
    ];
    expect(mapTargetOf("pontos", "zone", "35-z0012", [], places)).toEqual([0, 0, 1, 1]);
    const widened = mapTargetOf("pontos", "polling_place", "35-z0012-l2", [], places) ?? [];
    expect(widened.map((n) => Math.round(n * 100) / 100)).toEqual([0.99, 0.99, 1.01, 1.01]);
    const features = [feature("sp", square(-1, -1, 2))];
    expect(mapTargetOf("pontos", "section", "35-z0012-s1", features, places)).toEqual(features[0].bbox);
    expect(mapTargetOf("pontos", "section", "35-z0012-s1", [], places)).toEqual([0, 0, 9, 9]);
  });
});

describe("map scale", () => {
  const items = [item({ values: { a: 30, b: 10 } }), item({ values: { a: 80, b: 90 } })];

  it("scales the performance of a candidate up to the next multiple of 5", () => {
    expect(mapScaleOf("desempenho", items, "a", null)).toEqual({ min: 0, max: 80, suffix: "%" });
    expect(mapScaleOf("desempenho", [], null, null)).toEqual({ min: 0, max: 100, suffix: "%" });
  });

  it("scales the comparison symmetrically around zero", () => {
    expect(mapScaleOf("comparativo", items, "a", "b")).toEqual({ min: -20, max: 20, suffix: " p.p." });
  });

  it("scales the turnout to the range of the data, or to 0-100 without data", () => {
    const rates = [
      item({ electorate: 100, turnout: 60 }),
      item({ electorate: 100, turnout: 80 }),
      item({ electorate: 0 }),
    ];
    expect(mapScaleOf("comparecimento", rates, null, null)).toEqual({ min: 60, max: 80, suffix: "%" });
    expect(mapScaleOf("comparecimento", [item({ electorate: 0 })], null, null)).toEqual({
      min: 0,
      max: 100,
      suffix: "%",
    });
  });

  it("uses 0-100 for the other kinds", () => {
    expect(mapScaleOf("progresso", items, null, null)).toEqual({ min: 0, max: 100, suffix: "%" });
  });
});

describe("region and polling place colors", () => {
  it("counts a region without data when it has no leader, votes or sections tallied", () => {
    expect(hasNoData(undefined)).toBe(true);
    expect(hasNoData(item({ status: "not_received", valid_votes: 0 }))).toBe(true);
    expect(hasNoData(item({}))).toBe(false);
  });

  it("paints the winner with its opacity by margin, dims the others when a candidate is highlighted", () => {
    const [r, g, b, a] = regionColor(item({}), context({}));
    expect([r, g, b]).toEqual([215, 25, 28]);
    expect(a).toBe(Math.round(0.97 * 255));
    expect(regionColor(item({}), context({ highlight: "280002", dark: false }))).toEqual([
      200, 204, 212, 140,
    ]);
    expect(regionColor(item({}), context({ highlight: "280002" }))).toEqual([60, 68, 88, 90]);
    expect(regionColor(item({ leader: null }), context({}))).toEqual([128, 128, 128, 60]);
  });

  it("paints the no-data regions with the theme's neutral color, and the locais kind as transparent", () => {
    expect(regionColor(undefined, context({}))).toEqual([70, 80, 100, 70]);
    expect(regionColor(undefined, context({ dark: false }))).toEqual([170, 175, 185, 90]);
    expect(regionColor(item({}), context({ type: "locais" }))).toEqual([0, 0, 0, 0]);
  });

  it("paints the performance, comparison, progress, turnout and party kinds", () => {
    expect(regionColor(item({}), context({ type: "desempenho" })).at(3)).toBe(225);
    expect(regionColor(item({ values: {} }), context({ type: "desempenho" }))).toEqual([128, 128, 128, 60]);
    expect(
      regionColor(item({}), context({ type: "comparativo", colorA: "#000000", colorB: "#ffffff" })).at(3),
    ).toBe(230);
    expect(regionColor(item({ values: {} }), context({ type: "comparativo" }))).toEqual([128, 128, 128, 60]);
    expect(regionColor(item({}), context({ type: "progresso" })).at(3)).toBe(225);
    expect(regionColor(item({}), context({ type: "comparecimento" })).at(3)).toBe(225);
    expect(regionColor(item({ electorate: 0 }), context({ type: "comparecimento" }))).toEqual([
      128, 128, 128, 60,
    ]);
    expect(regionColor(item({}), context({ type: "partido" })).at(3)).toBe(215);
    expect(regionColor(item({ leader_party: null }), context({ type: "partido" }))).toEqual([
      128, 128, 128, 60,
    ]);
  });

  it("colors a polling place by its status, or by its winner on the winner-based kinds", () => {
    expect(
      pollingPlaceColor(place({ status: "partial", leader: null }), "locais", null, candidateColor).at(3),
    ).toBe(230);
    expect(pollingPlaceColor(place({ leader: null }), "vencedores", null, candidateColor).at(3)).toBe(200);
    expect(pollingPlaceColor(place({}), "vencedores", "280002", candidateColor)).toEqual([
      120, 128, 145, 110,
    ]);
    expect(pollingPlaceColor(place({ margin_pp: 1 }), "vencedores", null, candidateColor).at(3)).toBe(
      Math.round(0.55 * 255),
    );
  });
});

describe("legend data", () => {
  it("lists the winners of the polling places, most places first", () => {
    const places = [
      place({}),
      place({ id: "2" }),
      place({
        id: "3",
        leader: { tse_candidate_id: "280002", ballot_name: "Bia", color: "#2E7D32" } as never,
      }),
      place({ id: "4", leader: null }),
    ];
    const items = legendItemsOf("pontos", places, undefined, candidateColor);
    expect(items.map((i) => [i.tseCandidateId, i.wins])).toEqual([
      ["280001", 2],
      ["280002", 1],
    ]);
  });

  it("lists the candidates of the regions with their wins and ballot numbers", () => {
    const children = {
      candidates: [
        { tse_candidate_id: "280002", ballot_name: "Bia", ballot_number: 22, color: "#2E7D32", wins: 1 },
        { tse_candidate_id: "280001", ballot_name: "Ana", ballot_number: 13, color: null, wins: 3 },
      ],
    } as unknown as ChildrenDto;
    const items = legendItemsOf("uf", [], children, candidateColor);
    expect(items).toEqual([
      { tseCandidateId: "280001", label: "Ana (13)", color: "#123456", wins: 3 },
      { tseCandidateId: "280002", label: "Bia (22)", color: "#2E7D32", wins: 1 },
    ]);
    expect(legendItemsOf("uf", [], undefined, candidateColor)).toEqual([]);
  });

  it("maps wins per municipality, counts the places per status, and totals the parties", () => {
    expect(municipalityWins(undefined)).toBeNull();
    const children = {
      candidates: [{ tse_candidate_id: "280001", wins: 7 }],
      items: [
        item({}),
        item({ id: "rj", leader_party: null }),
        item({ id: "mg", leader_party: { abbreviation: "PT", color: "#D7191C" } as never }),
      ],
    } as unknown as ChildrenDto;
    expect(municipalityWins(children)?.get("280001")).toBe(7);
    expect(countByStatus([place({}), place({ status: "partial" }), place({})])).toEqual({
      tallied: 2,
      partial: 1,
    });
    expect(partyTotals(children)).toEqual([{ abbreviation: "PT", color: "#D7191C", count: 2 }]);
  });
});

describe("map style and layers", () => {
  it("picks the basemap of the theme and a plain background otherwise", () => {
    expect(basemapUrl(true)).toMatch(/dark-matter/);
    expect(basemapUrl(false)).toMatch(/positron/);
    expect(backgroundStyle(true).layers[0].paint["background-color"]).toBe(MAP_BACKGROUND_DARK);
    expect(backgroundStyle(false).layers[0].paint["background-color"]).toBe(MAP_BACKGROUND_LIGHT);
  });

  it("names every kind of map, and offers the party kind only to proportional offices", () => {
    expect(MAP_TYPE_LABELS.partido).toBe("Partido mais votado");
    expect(MAP_TYPES.filter((t) => t.proportional).map((t) => t.value)).toEqual(["partido"]);
  });

  function inputs(over: Partial<MapLayerInputs>): MapLayerInputs {
    return {
      mode: "uf",
      type: "vencedores",
      level: "country",
      id: "br",
      dark: true,
      zoom: 3,
      features: [feature("sp", square(0, 0))],
      itemsByKey: new Map([["sp", item({})]]),
      regionFill: () => [1, 2, 3, 4],
      hasPlaces: false,
      places: [],
      placeFill: () => [1, 2, 3, 4],
      version: "1",
      placesUpdatedAt: 0,
      ...over,
    };
  }

  it("draws the regions, the no-data hatch and the places as hexagons when zoomed out", () => {
    const layers = buildMapLayers(
      inputs({
        type: "locais",
        features: [feature("sp", square(0, 0)), feature("rj", square(3, 3))],
        hasPlaces: true,
        places: [place({})],
        zoom: 3,
      }),
    );
    // the no-data hatch is not drawn for the polling-places kind
    expect(layers.map((l) => l.id)).toEqual(["regioes", "hex"]);
  });

  it("draws the places as dots when zoomed in or on the municipality points", () => {
    expect(
      buildMapLayers(inputs({ type: "locais", hasPlaces: true, places: [place({})], zoom: 9 })).map(
        (l) => l.id,
      ),
    ).toEqual(["regioes", "locais"]);
    const points = buildMapLayers(
      inputs({
        mode: "pontos",
        level: "zone",
        id: "35-z0012",
        hasPlaces: true,
        places: [place({})],
        zoom: 3,
      }),
    );
    expect(points.map((l) => l.id)).toEqual(["regioes", "locais"]);
    expect(buildMapLayers(inputs({ hasPlaces: true, places: [] })).map((l) => l.id)).toEqual(["regioes"]);
  });

  it("keeps the light theme outline and the municipality outline of the country map", () => {
    const layers = buildMapLayers(inputs({ dark: false, mode: "mun", level: "country", type: "vencedores" }));
    expect(layers[0].id).toBe("regioes");
  });
});
