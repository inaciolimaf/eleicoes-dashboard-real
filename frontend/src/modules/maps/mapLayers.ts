import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { FillStyleExtension } from "@deck.gl/extensions";
import type { ChildItemDto, Level, MapPollingPlaceDto } from "../../api/models";
import { zoneOfId } from "../../lib/geo-areas";
import { hasNoData, type RGBA } from "./mapColors";
import type { FeatureGeo } from "./lib";
import type { MapMode } from "./mapScope";
import type { MapType } from "./types";

export interface MapLayerInputs {
  mode: MapMode;
  type: MapType;
  level: Level;
  id: string;
  dark: boolean;
  /** current zoom: below 8.5 the places are drawn as hexagons */
  zoom: number;
  features: FeatureGeo[];
  /** API data of the regions, by join key */
  itemsByKey: Map<string, ChildItemDto>;
  regionFill: (key: string) => RGBA;
  /** polling places are drawn only for the polling-places kind and the municipality mode */
  hasPlaces: boolean;
  places: MapPollingPlaceDto[];
  placeFill: (place: MapPollingPlaceDto) => RGBA;
  /** changes whenever the region data changes: deck.gl recomputes the fills */
  version: string;
  placesUpdatedAt: number;
}

/** The choropleth of states or municipalities. */
function regionsLayer(input: MapLayerInputs, outline: RGBA): Layer {
  const { mode, type, level, dark, features, regionFill, version } = input;
  const polygonLine: RGBA = dark ? [90, 110, 150, 160] : [120, 130, 150, 160];
  const pointsLine: RGBA = dark ? [140, 160, 200, 220] : [60, 70, 90, 220];
  return new GeoJsonLayer<FeatureGeo["properties"]>({
    id: "regioes",
    data: features as never,
    filled: true,
    stroked: true,
    pickable: type !== "locais" || mode === "pontos" ? mode !== "pontos" : true,
    autoHighlight: mode !== "pontos",
    highlightColor: [255, 255, 255, 50],
    getFillColor: (ft) => regionFill((ft as unknown as FeatureGeo).key),
    getLineColor: mode === "pontos" ? pointsLine : type === "locais" ? polygonLine : outline,
    getLineWidth: mode === "pontos" ? 2 : 1,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: mode === "mun" && level === "country" ? 0.2 : 0.6,
    updateTriggers: { getFillColor: [version, regionFill], getLineColor: [dark, type] },
    transitions: { getFillColor: 500 },
  });
}

/** Hatched overlay on the regions that have no data yet. */
function noDataLayer(features: FeatureGeo[], dark: boolean): Layer {
  return new GeoJsonLayer({
    id: "hachura",
    data: features as never,
    filled: true,
    stroked: false,
    pickable: false,
    getFillColor: dark ? [150, 160, 180, 120] : [110, 115, 125, 120],
    extensions: [new FillStyleExtension({ pattern: true })],
    fillPatternMapping: { hachura: { type: "hatch", angle: 45, strokeWidth: 1.5, gap: 4 } },
    fillPatternSizeUnits: "pixels",
    getFillPattern: () => "hachura",
    getFillPatternScale: 1,
    updateTriggers: { getFillColor: [dark] },
  } as never);
}

/** Polling places aggregated into hexagons, colored by the share of places tallied. */
function hexLayer(input: MapLayerInputs): Layer {
  const { places, mode, level, version, placesUpdatedAt } = input;
  return new HexagonLayer<MapPollingPlaceDto>({
    id: "hex",
    data: places,
    getPosition: (d) => [d.lon ?? 0, d.lat ?? 0],
    radius: mode === "uf" || level === "country" ? 22000 : 6000,
    coverage: 0.9,
    extruded: false,
    pickable: true,
    opacity: 0.85,
    colorAggregation: "MEAN",
    getColorWeight: (d) => (d.status === "tallied" ? 1 : 0),
    colorDomain: [0, 1],
    colorRange: [
      [100, 116, 139],
      [150, 140, 100],
      [245, 165, 36],
      [190, 190, 60],
      [110, 200, 90],
      [34, 197, 94],
    ],
    updateTriggers: { getColorWeight: [version, placesUpdatedAt] },
  });
}

/** Radius of a polling place: bigger with more sections; the selected one (or its zone) stands out. */
function placeRadius(d: MapPollingPlaceDto, level: Level, id: string, zone: string | null): number {
  const base = Math.min(11, 3 + Math.sqrt(Math.max(1, d.sections_total)) * 1.3);
  if (level === "polling_place") return d.id === id ? base + 5 : base * 0.7;
  if (level === "zone" && zone) return d.id.startsWith(zone) ? base : base * 0.6;
  return base;
}

/** Dots of the polling places, colored by status or by winner. */
function placesLayer(input: MapLayerInputs, dark: boolean): Layer {
  const { places, level, id, placeFill, placesUpdatedAt } = input;
  const zone = zoneOfId(level, id);
  return new ScatterplotLayer<MapPollingPlaceDto>({
    id: "locais",
    data: places,
    getPosition: (d) => [d.lon ?? 0, d.lat ?? 0],
    getRadius: (d) => placeRadius(d, level, id, zone),
    radiusUnits: "pixels",
    getFillColor: (d) => {
      const c = placeFill(d);
      const dimmed =
        (level === "zone" && zone && !d.id.startsWith(zone)) || (level === "polling_place" && d.id !== id);
      return dimmed ? [c[0], c[1], c[2], 70] : c;
    },
    stroked: true,
    getLineColor: dark ? [11, 18, 32, 230] : [255, 255, 255, 230],
    lineWidthMinPixels: 1,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 90],
    updateTriggers: {
      getFillColor: [placesUpdatedAt, placeFill, level, id],
      getRadius: [level, id],
    },
    transitions: { getFillColor: 400 },
  });
}

/** Every deck.gl layer of the map, bottom to top: regions, no-data hatch, then the places. */
export function buildMapLayers(input: MapLayerInputs): Layer[] {
  const { dark, type, mode, itemsByKey, features, hasPlaces, places, zoom } = input;
  const outline: RGBA = dark ? [11, 18, 32, 220] : [255, 255, 255, 230];
  const layers: Layer[] = [regionsLayer(input, outline)];
  const noData = type === "locais" ? [] : features.filter((f) => hasNoData(itemsByKey.get(f.key)));
  if (noData.length) layers.push(noDataLayer(noData, dark));
  if (hasPlaces && places.length) {
    const useHexagons = type === "locais" && mode !== "pontos" && zoom < 8.5;
    layers.push(useHexagons ? hexLayer(input) : placesLayer(input, dark));
  }
  return layers;
}
