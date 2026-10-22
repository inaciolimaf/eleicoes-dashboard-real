import MapGL, { useControl, NavigationControl } from "react-map-gl/maplibre";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import type { IControl } from "maplibre-gl";
import { BRAZIL_BBOX } from "../lib";
import type { ElectoralMapModel } from "../useElectoralMap";

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(
    () => new MapboxOverlay(props) as unknown as IControl,
  ) as unknown as MapboxOverlay;
  overlay.setProps(props);
  return null;
}

const INITIAL_VIEW = {
  bounds: [
    [BRAZIL_BBOX[0], BRAZIL_BBOX[1]],
    [BRAZIL_BBOX[2], BRAZIL_BBOX[3]],
  ] as [[number, number], [number, number]],
  fitBoundsOptions: { padding: 16 },
};

/** The MapLibre basemap with the deck.gl layers on top. Loads and failures feed the style and the framing. */
export function MapCanvas({ model }: { model: ElectoralMapModel }) {
  const { basemap, mapRef, framing, picking, layers, setZoom } = model;
  return (
    <MapGL
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={basemap.style as never}
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
      preserveDrawingBuffer
      dragRotate={false}
      pitchWithRotate={false}
      touchZoomRotate
      onLoad={() => {
        basemap.markLoaded();
        framing.setReady(true);
      }}
      onStyleData={() => basemap.markLoaded()}
      onError={() => basemap.markFailed()}
      onZoomEnd={(e) => setZoom(e.viewState.zoom)}
      onMove={() => picking.hover && picking.setHover(null)}
      cursor={picking.hover ? "pointer" : "grab"}
      reuseMaps
    >
      <NavigationControl position="top-right" showCompass={false} />
      <DeckOverlay layers={layers} onHover={picking.onHover} onClick={picking.onClick} interleaved={false} />
    </MapGL>
  );
}
