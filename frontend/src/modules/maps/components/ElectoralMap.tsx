import { Skeleton } from "@mantine/core";
import { lazy, Suspense } from "react";
import type { ElectoralMapCanvasProps } from "./ElectoralMapView";

const MapaEleitoralLazy = lazy(() => import("./ElectoralMapView"));

/** Mapa eleitoral com carregamento sob demanda (maplibre + deck.gl ficam em chunks separados). */
export function ElectoralMap(props: ElectoralMapCanvasProps) {
  return (
    <Suspense fallback={<Skeleton h={props.altura ?? "100%"} mih={180} radius="md" />}>
      <MapaEleitoralLazy {...props} />
    </Suspense>
  );
}

export type { ElectoralMapCanvasProps };
export * from "../types";
