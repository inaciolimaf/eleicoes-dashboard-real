import type { Level } from "../../api/models";
import { municipalityOfId, stateOfId } from "../../lib/geo-areas";

/** What the canvas draws: the states, the municipalities, or the polling places of one municipality. */
export type MapMode = "uf" | "mun" | "pontos";

export interface MapScope {
  mode: MapMode;
  /** state code of the geo area, when it has one */
  uf: string | null;
  /** municipality of the geo area (zone, polling place or section), when it has one */
  munId: string | null;
  /** level of the children the API must return for this scope */
  childLevel: Level | null;
}

/** The map scope of a geo area. `allMunicipalities` draws every Brazilian municipality at country level. */
export function mapScopeOf(level: Level, id: string, allMunicipalities: boolean | undefined): MapScope {
  const mode: MapMode =
    level === "country" ? (allMunicipalities ? "mun" : "uf") : level === "state" ? "mun" : "pontos";
  return {
    mode,
    uf: stateOfId(level, id),
    munId: municipalityOfId(level, id),
    childLevel: level === "country" && mode === "mun" ? "municipality" : null,
  };
}
