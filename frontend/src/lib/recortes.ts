import type { Nivel } from "../api/types";

export const NIVEIS: Nivel[] = ["br", "uf", "municipio", "zona", "local", "secao"];

export const NIVEL_ROTULO: Record<Nivel, string> = {
  br: "Brasil",
  uf: "UF",
  municipio: "Município",
  zona: "Zona",
  local: "Local de votação",
  secao: "Seção",
};

export const NIVEL_PLURAL: Record<Nivel, string> = {
  br: "Brasil",
  uf: "UFs",
  municipio: "Municípios",
  zona: "Zonas",
  local: "Locais",
  secao: "Seções",
};

export function nivelFilho(n: Nivel): Nivel | null {
  switch (n) {
    case "br": return "uf";
    case "uf": return "municipio";
    case "municipio": return "zona";
    case "zona": return "local";
    case "local": return "secao";
    default: return null;
  }
}

export const isNivel = (s: string | undefined | null): s is Nivel => !!s && (NIVEIS as string[]).includes(s);

/** UF (minúscula) a partir de um id de recorte */
export function ufDoId(nivel: Nivel, id: string): string | null {
  if (nivel === "br") return null;
  return id.slice(0, 2).toLowerCase();
}

/** Município (id de recorte) a partir de um id de zona/local/seção */
export function municipioDoId(nivel: Nivel, id: string): string | null {
  if (nivel === "br" || nivel === "uf") return null;
  return id.split("-")[0];
}

export function zonaDoId(nivel: Nivel, id: string): string | null {
  if (nivel === "zona") return id;
  if (nivel === "local" || nivel === "secao") return id.split("-").slice(0, 2).join("-");
  return null;
}

export function linkRecorte(nivel: Nivel, id: string): string {
  if (nivel === "local") return `/locais/${encodeURIComponent(id)}`;
  if (nivel === "secao") return `/secoes/${encodeURIComponent(id)}`;
  return `/explorar/${nivel}/${encodeURIComponent(id)}`;
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

export const UF_POR_SIGLA: Record<string, (typeof UFS)[number]> = Object.fromEntries(UFS.map((u) => [u.uf, u]));
export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

export function nomeRecortePadrao(nivel: Nivel, id: string): string {
  if (nivel === "br") return "Brasil";
  if (nivel === "uf") return id === "zz" ? "Exterior" : UF_POR_SIGLA[id]?.nome ?? id.toUpperCase();
  if (nivel === "zona") return `Zona ${Number(id.split("-z")[1] ?? "")}`;
  if (nivel === "secao") return `Seção ${Number(id.split("-s")[1] ?? "")}`;
  return id;
}
