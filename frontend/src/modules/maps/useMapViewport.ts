import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { BBox } from "./lib";
import { backgroundStyle, basemapUrl } from "./mapStyle";

/** Basemap tiles that have not answered in this time count as failed: the map falls back to the plain background. */
const BASEMAP_TIMEOUT_MS = 9000;

/**
 * Style of the map: the basemap tiles when enabled and reachable, else the plain background.
 * A tile URL that fails (or stays silent too long) is remembered for the session.
 */
export function useBasemapStyle(enabled: boolean, dark: boolean) {
  const url = basemapUrl(dark);
  const [failures, setFailures] = useState<Record<string, boolean>>({});
  const useTiles = enabled && !failures[url];
  const style = useMemo(() => (useTiles ? url : backgroundStyle(dark)), [useTiles, url, dark]);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    if (!useTiles) return;
    const timer = setTimeout(() => {
      if (!loadedRef.current) setFailures((f) => ({ ...f, [url]: true }));
    }, BASEMAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [useTiles, url]);

  return {
    style,
    markLoaded: () => {
      loadedRef.current = true;
    },
    markFailed: () => {
      if (!loadedRef.current && useTiles) setFailures((f) => ({ ...f, [url]: true }));
    },
  };
}

/** Frames the map on `target` once the map is ready; a new target with the same box is not reframed. */
export function useFitToTarget(mapRef: RefObject<MapRef | null>, target: BBox | null) {
  const [ready, setReady] = useState(false);
  const targetKey = target ? target.map((n) => n.toFixed(3)).join(",") : "";
  useEffect(() => {
    if (!target || !mapRef.current || !ready) return;
    try {
      mapRef.current.fitBounds(
        [
          [target[0], target[1]],
          [target[2], target[3]],
        ],
        { padding: 24, duration: 700, maxZoom: 15 },
      );
    } catch {
      /* the map has no size yet */
    }
    // `target` is a new array on every render: the key is the value that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, ready]);
  return { ready, setReady };
}
