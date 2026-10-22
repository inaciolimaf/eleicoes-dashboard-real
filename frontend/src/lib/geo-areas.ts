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

export const UFS: { uf: string; nome: string; regiao: string; capital: string }[] = [
  { uf: "ac", nome: "Acre", regiao: "Norte", capital: "Rio Branco" },
  { uf: "al", nome: "Alagoas", regiao: "Nordeste", capital: "Maceió" },
  { uf: "am", nome: "Amazonas", regiao: "Norte", capital: "Manaus" },
  { uf: "ap", nome: "Amapá", regiao: "Norte", capital: "Macapá" },
  { uf: "ba", nome: "Bahia", regiao: "Nordeste", capital: "Salvador" },
  { uf: "ce", nome: "Ceará", regiao: "Nordeste", capital: "Fortaleza" },
  { uf: "df", nome: "Distrito Federal", regiao: "Centro-Oeste", capital: "Brasília" },
  { uf: "es", nome: "Espírito Santo", regiao: "Sudeste", capital: "Vitória" },
  { uf: "go", nome: "Goiás", regiao: "Centro-Oeste", capital: "Goiânia" },
  { uf: "ma", nome: "Maranhão", regiao: "Nordeste", capital: "São Luís" },
  { uf: "mg", nome: "Minas Gerais", regiao: "Sudeste", capital: "Belo Horizonte" },
  { uf: "ms", nome: "Mato Grosso do Sul", regiao: "Centro-Oeste", capital: "Campo Grande" },
  { uf: "mt", nome: "Mato Grosso", regiao: "Centro-Oeste", capital: "Cuiabá" },
  { uf: "pa", nome: "Pará", regiao: "Norte", capital: "Belém" },
  { uf: "pb", nome: "Paraíba", regiao: "Nordeste", capital: "João Pessoa" },
  { uf: "pe", nome: "Pernambuco", regiao: "Nordeste", capital: "Recife" },
  { uf: "pi", nome: "Piauí", regiao: "Nordeste", capital: "Teresina" },
  { uf: "pr", nome: "Paraná", regiao: "Sul", capital: "Curitiba" },
  { uf: "rj", nome: "Rio de Janeiro", regiao: "Sudeste", capital: "Rio de Janeiro" },
  { uf: "rn", nome: "Rio Grande do Norte", regiao: "Nordeste", capital: "Natal" },
  { uf: "ro", nome: "Rondônia", regiao: "Norte", capital: "Porto Velho" },
  { uf: "rr", nome: "Roraima", regiao: "Norte", capital: "Boa Vista" },
  { uf: "rs", nome: "Rio Grande do Sul", regiao: "Sul", capital: "Porto Alegre" },
  { uf: "sc", nome: "Santa Catarina", regiao: "Sul", capital: "Florianópolis" },
  { uf: "se", nome: "Sergipe", regiao: "Nordeste", capital: "Aracaju" },
  { uf: "sp", nome: "São Paulo", regiao: "Sudeste", capital: "São Paulo" },
  { uf: "to", nome: "Tocantins", regiao: "Norte", capital: "Palmas" },
];

export const STATE_BY_CODE: Record<string, (typeof UFS)[number]> = Object.fromEntries(
  UFS.map((u) => [u.uf, u]),
);
export const REGIONS = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

/** Display name of a geo area when the API has not answered yet. */
export function defaultGeoAreaName(level: Level, id: string): string {
  if (level === "country") return "Brasil";
  if (level === "state") return id === "zz" ? "Exterior" : (STATE_BY_CODE[id]?.nome ?? id.toUpperCase());
  if (level === "zone") return `Zona ${Number(id.split("-z")[1] ?? "")}`;
  if (level === "section") return `Seção ${Number(id.split("-s")[1] ?? "")}`;
  return id;
}
