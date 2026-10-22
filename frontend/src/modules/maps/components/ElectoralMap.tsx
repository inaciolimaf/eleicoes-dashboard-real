import { Skeleton } from "@mantine/core";
import { lazy, Suspense } from "react";
import type { ElectoralMapCanvasProps } from "../useElectoralMap";

/** The canvas code (maplibre + deck.gl) loads on demand, in its own chunks. */
const LazyElectoralMapView = lazy(() => import("./ElectoralMapView"));

/** Electoral map with on-demand loading: the skeleton shows until maplibre and deck.gl arrive. */
export function ElectoralMap(props: ElectoralMapCanvasProps) {
  return (
    <Suspense fallback={<Skeleton h={props.altura ?? "100%"} mih={180} radius="md" />}>
      <LazyElectoralMapView {...props} />
    </Suspense>
  );
}

export type { ElectoralMapCanvasProps } from "../useElectoralMap";
