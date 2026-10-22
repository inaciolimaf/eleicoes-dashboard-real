import type { Level } from "../api/models";

export const LEVELS: Level[] = ["country", "state", "municipality", "zone", "polling_place", "section"];

export const LEVEL_LABELS: Record<Level, string> = {
  country: "Brasil",
  state: "UF",
  municipality: "Município",
  zone: "Zona",
  polling_place: "Local de votação",
  section: "Seção",
};

export const LEVEL_PLURAL_LABELS: Record<Level, string> = {
  country: "Brasil",
  state: "UFs",
  municipality: "Municípios",
  zone: "Zonas",
  polling_place: "Locais",
  section: "Seções",
};

/** URL segment (`/explorar/:level`) of each level: the screens keep the Portuguese names. */
const URL_SEGMENTS: Record<Level, string> = {
  country: "br",
  state: "uf",
  municipality: "municipio",
  zone: "zona",
  polling_place: "local",
  section: "secao",
};

export const segmentOfLevel = (level: Level): string => URL_SEGMENTS[level];

/** Level text from a DTO (the API types it as a string): the value is always a `Level`. */
export const asLevel = (valor: string): Level => valor as Level;

export function levelOfSegment(segment: string | undefined): Level | null {
  return LEVELS.find((level) => URL_SEGMENTS[level] === segment) ?? null;
}

/** The level one step below `level` in the drill-down, or null at the bottom. */
export function childLevel(level: Level): Level | null {
  switch (level) {
    case "country":
      return "state";
    case "state":
      return "municipality";
    case "municipality":
      return "zone";
    case "zone":
      return "polling_place";
    case "polling_place":
      return "section";
    default:
      return null;
  }
}

/** State code (lowercase) from a geo area id. */
export function stateOfId(level: Level, id: string): string | null {
  if (level === "country") return null;
  return id.slice(0, 2).toLowerCase();
}

/** Municipality id (geo area id) from a zone, polling place or section id. */
export function municipalityOfId(level: Level, id: string): string | null {
  if (level === "country" || level === "state") return null;
  return id.split("-")[0];
}

export function zoneOfId(level: Level, id: string): string | null {
  if (level === "zone") return id;
  if (level === "polling_place" || level === "section") return id.split("-").slice(0, 2).join("-");
  return null;
}

/** Screen URL of a geo area: polling places and sections have their own screens. */
/**
 * Section id from the URL: `/secoes/:id`, or `/secoes/:uf/:mun/:zona/:secao` where the zone and the
 * section are TSE numbers, padded to four digits. Empty when the URL has no section.
 */
export function sectionIdFromParams(p: {
  id?: string;
  uf?: string;
  mun?: string;
  zona?: string;
  secao?: string;
}): string {
  if (p.id) return decodeURIComponent(p.id);
  if (p.uf && p.mun && p.zona && p.secao)
    return `${p.uf}${p.mun}-z${p.zona.padStart(4, "0")}-s${p.secao.padStart(4, "0")}`;
  return "";
}

export function geoAreaLink(level: Level, id: string): string {
  if (level === "polling_place") return `/locais/${encodeURIComponent(id)}`;
  if (level === "section") return `/secoes/${encodeURIComponent(id)}`;
  return `/explorar/${segmentOfLevel(level)}/${encodeURIComponent(id)}`;
}

export const UFS: { uf: string; name: string; region: string; capital: string }[] = [
  { uf: "ac", name: "Acre", region: "Norte", capital: "Rio Branco" },
  { uf: "al", name: "Alagoas", region: "Nordeste", capital: "Maceió" },
  { uf: "am", name: "Amazonas", region: "Norte", capital: "Manaus" },
  { uf: "ap", name: "Amapá", region: "Norte", capital: "Macapá" },
  { uf: "ba", name: "Bahia", region: "Nordeste", capital: "Salvador" },
  { uf: "ce", name: "Ceará", region: "Nordeste", capital: "Fortaleza" },
  { uf: "df", name: "Distrito Federal", region: "Centro-Oeste", capital: "Brasília" },
  { uf: "es", name: "Espírito Santo", region: "Sudeste", capital: "Vitória" },
  { uf: "go", name: "Goiás", region: "Centro-Oeste", capital: "Goiânia" },
  { uf: "ma", name: "Maranhão", region: "Nordeste", capital: "São Luís" },
  { uf: "mg", name: "Minas Gerais", region: "Sudeste", capital: "Belo Horizonte" },
  { uf: "ms", name: "Mato Grosso do Sul", region: "Centro-Oeste", capital: "Campo Grande" },
  { uf: "mt", name: "Mato Grosso", region: "Centro-Oeste", capital: "Cuiabá" },
  { uf: "pa", name: "Pará", region: "Norte", capital: "Belém" },
  { uf: "pb", name: "Paraíba", region: "Nordeste", capital: "João Pessoa" },
  { uf: "pe", name: "Pernambuco", region: "Nordeste", capital: "Recife" },
  { uf: "pi", name: "Piauí", region: "Nordeste", capital: "Teresina" },
  { uf: "pr", name: "Paraná", region: "Sul", capital: "Curitiba" },
  { uf: "rj", name: "Rio de Janeiro", region: "Sudeste", capital: "Rio de Janeiro" },
  { uf: "rn", name: "Rio Grande do Norte", region: "Nordeste", capital: "Natal" },
  { uf: "ro", name: "Rondônia", region: "Norte", capital: "Porto Velho" },
  { uf: "rr", name: "Roraima", region: "Norte", capital: "Boa Vista" },
  { uf: "rs", name: "Rio Grande do Sul", region: "Sul", capital: "Porto Alegre" },
  { uf: "sc", name: "Santa Catarina", region: "Sul", capital: "Florianópolis" },
  { uf: "se", name: "Sergipe", region: "Nordeste", capital: "Aracaju" },
  { uf: "sp", name: "São Paulo", region: "Sudeste", capital: "São Paulo" },
  { uf: "to", name: "Tocantins", region: "Norte", capital: "Palmas" },
];

export const STATE_BY_CODE: Record<string, (typeof UFS)[number]> = Object.fromEntries(
  UFS.map((u) => [u.uf, u]),
);
export const REGIONS = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

/** Display name of a geo area when the API has not answered yet. */
export function defaultGeoAreaName(level: Level, id: string): string {
  if (level === "country") return "Brasil";
  if (level === "state") return id === "zz" ? "Exterior" : (STATE_BY_CODE[id]?.name ?? id.toUpperCase());
  if (level === "zone") return `Zona ${Number(id.split("-z")[1] ?? "")}`;
  if (level === "section") return `Seção ${Number(id.split("-s")[1] ?? "")}`;
  return id;
}
