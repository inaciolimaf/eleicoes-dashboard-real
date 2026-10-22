import { useCallback, useState, type RefObject } from "react";
import type { PickingInfo } from "@deck.gl/core";
import type { MapRef } from "react-map-gl/maplibre";
import type { ChildItemDto, Level, MapPollingPlaceDto } from "../../api/models";
import { asLevel, STATE_BY_CODE } from "../../lib/geo-areas";
import type { FeatureGeo } from "./lib";
import type { MapMode } from "./mapScope";

/** What the pointer is over: a region, a polling place or a hexagon of polling places. */
export type Hover =
  | { x: number; y: number; kind: "region"; name: string; item: ChildItemDto | null }
  | { x: number; y: number; kind: "place"; place: MapPollingPlaceDto }
  | { x: number; y: number; kind: "hex"; pct: number; n: number };

export type SelectHandler = (level: Level, id: string, name: string) => void;

interface PickingArgs {
  mode: MapMode;
  itemsByKey: Map<string, ChildItemDto>;
  onSelect?: SelectHandler;
  mapRef: RefObject<MapRef | null>;
}

/** Hover tooltip and click handling for the deck.gl layers. */
export function useMapPicking({ mode, itemsByKey, onSelect, mapRef }: PickingArgs) {
  const [hover, setHover] = useState<Hover | null>(null);

  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object || info.x < 0) {
        setHover(null);
        return;
      }
      const layerId = info.layer?.id;
      if (layerId === "locais")
        setHover({ x: info.x, y: info.y, kind: "place", place: info.object as MapPollingPlaceDto });
      else if (layerId === "hex") {
        const o = info.object as { colorValue?: number; count?: number };
        setHover({ x: info.x, y: info.y, kind: "hex", pct: (o.colorValue ?? 0) * 100, n: o.count ?? 0 });
      } else if (layerId === "regioes") {
        const feature = info.object as FeatureGeo;
        const item = itemsByKey.get(feature.key) ?? null;
        const name =
          item?.name ?? feature.properties.nome ?? STATE_BY_CODE[feature.key]?.name ?? feature.properties.uf;
        setHover({ x: info.x, y: info.y, kind: "region", name, item });
      }
    },
    [itemsByKey],
  );

  const onClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object || !onSelect) return;
      const layerId = info.layer?.id;
      if (layerId === "locais") {
        const place = info.object as MapPollingPlaceDto;
        onSelect("polling_place", place.id, place.name);
      } else if (layerId === "hex") {
        const o = info.object as { position?: [number, number] };
        if (o.position && mapRef.current)
          mapRef.current.flyTo({ center: o.position, zoom: 10, duration: 800 });
      } else if (layerId === "regioes") {
        const feature = info.object as FeatureGeo;
        const item = itemsByKey.get(feature.key);
        if (item) onSelect(asLevel(item.level), item.id, item.name);
        else if (mode === "uf")
          onSelect("state", feature.key, STATE_BY_CODE[feature.key]?.name ?? feature.key.toUpperCase());
      }
    },
    [onSelect, itemsByKey, mode, mapRef],
  );

  return { hover, setHover, onHover, onClick };
}
