import type { Level } from "../api/models";

export const NIVEIS: Level[] = ["country", "state", "municipality", "zone", "polling_place", "section"];

export const NIVEL_ROTULO: Record<Level, string> = {
  country: "Brasil",
  state: "UF",
  municipality: "Município",
  zone: "Zona",
  polling_place: "Local de votação",
  section: "Seção",
};

export const NIVEL_PLURAL: Record<Level, string> = {
  country: "Brasil",
  state: "UFs",
  municipality: "Municípios",
  zone: "Zonas",
  polling_place: "Locais",
  section: "Seções",
};

/** Segmento da URL (`/explorar/:nivel`) de cada nível: as telas mantêm os nomes em português. */
const SEGMENTO_URL: Record<Level, string> = {
  country: "br",
  state: "uf",
  municipality: "municipio",
  zone: "zona",
  polling_place: "local",
  section: "secao",
};

export const segmentoDoNivel = (nivel: Level): string => SEGMENTO_URL[nivel];

/** Texto de nível vindo de um DTO (a API o tipa como string): o valor é sempre um `Level`. */
export const asLevel = (valor: string): Level => valor as Level;

export function nivelDoSegmento(segmento: string | undefined): Level | null {
  return NIVEIS.find((n) => SEGMENTO_URL[n] === segmento) ?? null;
}

export function nivelFilho(n: Level): Level | null {
  switch (n) {
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

/** UF (minúscula) a partir de um id de recorte */
export function ufDoId(nivel: Level, id: string): string | null {
  if (nivel === "country") return null;
  return id.slice(0, 2).toLowerCase();
}

/** Município (id de recorte) a partir de um id de zona/local/seção */
export function municipioDoId(nivel: Level, id: string): string | null {
  if (nivel === "country" || nivel === "state") return null;
  return id.split("-")[0];
}

export function zonaDoId(nivel: Level, id: string): string | null {
  if (nivel === "zone") return id;
  if (nivel === "polling_place" || nivel === "section") return id.split("-").slice(0, 2).join("-");
  return null;
}

export function linkRecorte(nivel: Level, id: string): string {
  if (nivel === "polling_place") return `/locais/${encodeURIComponent(id)}`;
  if (nivel === "section") return `/secoes/${encodeURIComponent(id)}`;
  return `/explorar/${segmentoDoNivel(nivel)}/${encodeURIComponent(id)}`;
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

export const UF_POR_SIGLA: Record<string, (typeof UFS)[number]> = Object.fromEntries(
  UFS.map((u) => [u.uf, u]),
);
export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

export function nomeRecortePadrao(nivel: Level, id: string): string {
  if (nivel === "country") return "Brasil";
  if (nivel === "state") return id === "zz" ? "Exterior" : (UF_POR_SIGLA[id]?.nome ?? id.toUpperCase());
  if (nivel === "zone") return `Zona ${Number(id.split("-z")[1] ?? "")}`;
  if (nivel === "section") return `Seção ${Number(id.split("-s")[1] ?? "")}`;
  return id;
}
