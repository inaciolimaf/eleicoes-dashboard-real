import { MAP_BACKGROUND_DARK, MAP_BACKGROUND_LIGHT } from "../../lib/palettes/maps";

const LIGHT_BASEMAP_URL = "https://tiles.openfreemap.org/styles/positron";
const DARK_BASEMAP_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Style URL of the basemap tiles for the theme. */
export function basemapUrl(dark: boolean): string {
  return dark ? DARK_BASEMAP_URL : LIGHT_BASEMAP_URL;
}

/** Plain background style, used when the basemap is off or failed to load. */
export function backgroundStyle(dark: boolean) {
  return {
    version: 8 as const,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background" as const,
        paint: { "background-color": dark ? MAP_BACKGROUND_DARK : MAP_BACKGROUND_LIGHT },
      },
    ],
  };
}
