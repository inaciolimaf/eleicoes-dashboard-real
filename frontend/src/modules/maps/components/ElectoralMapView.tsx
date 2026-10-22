import "maplibre-gl/dist/maplibre-gl.css";
import { Box } from "@mantine/core";
import { useElectoralMap, type ElectoralMapCanvasProps } from "../useElectoralMap";
import { MapCanvas } from "./MapCanvas";
import { MapOverlayStack } from "./MapOverlayStack";

export type { ElectoralMapCanvasProps } from "../useElectoralMap";

/** Map of a geo area: states, municipalities or polling places, with legend, selectors and tooltip. */
export default function ElectoralMapCanvas(props: ElectoralMapCanvasProps) {
  const model = useElectoralMap(props);
  return (
    <Box
      ref={model.boxRef}
      className="mapa-container"
      style={{ height: props.altura ?? "100%", minHeight: 180 }}
      onMouseLeave={() => model.picking.setHover(null)}
    >
      <MapCanvas model={model} />
      <MapOverlayStack model={model} />
    </Box>
  );
}
