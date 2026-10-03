import { Skeleton } from "@mantine/core";
import { lazy, Suspense } from "react";
import type { MapaEleitoralProps } from "./MapaEleitoral";

const MapaEleitoralLazy = lazy(() => import("./MapaEleitoral"));

/** Mapa eleitoral com carregamento sob demanda (maplibre + deck.gl ficam em chunks separados). */
export function MapaEleitoral(props: MapaEleitoralProps) {
  return (
    <Suspense fallback={<Skeleton h={props.altura ?? "100%"} mih={180} radius="md" />}>
      <MapaEleitoralLazy {...props} />
    </Suspense>
  );
}

export type { MapaEleitoralProps };
export * from "./tipos";
