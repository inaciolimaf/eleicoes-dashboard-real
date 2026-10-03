import type { Cargo, Eleicao } from "../api/types";

export interface OpcaoCargo {
  valor: string;
  rotulo: string;
  curto: string;
  cds: number[];
}

/** Opções do SegmentedControl de cargo. Estadual/Distrital resolve para 7 ou 8 conforme a UF. */
export const OPCOES_CARGO: OpcaoCargo[] = [
  { valor: "1", rotulo: "Presidente", curto: "Pres.", cds: [1] },
  { valor: "3", rotulo: "Governador", curto: "Gov.", cds: [3] },
  { valor: "5", rotulo: "Senador", curto: "Sen.", cds: [5] },
  { valor: "6", rotulo: "Dep. Federal", curto: "Dep. Fed.", cds: [6] },
  { valor: "7", rotulo: "Dep. Est./Distrital", curto: "Dep. Est.", cds: [7, 8] },
];

export const NOME_CARGO: Record<number, string> = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual",
  8: "Deputado Distrital",
};

export const valorSegmento = (cd: number) => (cd === 8 ? "7" : String(cd));

/** Ajusta Estadual × Distrital conforme a UF do recorte. */
export function cargoParaUf(cd: number, uf: string | null | undefined): number {
  if (cd === 7 && uf === "df") return 8;
  if (cd === 8 && uf && uf !== "df") return 7;
  return cd;
}

export function cargosDoTurno(eleicoes: Eleicao[] | undefined, turno: number, ciclo: string | null): Cargo[] {
  if (!eleicoes) return [];
  const mapa = new Map<number, Cargo>();
  for (const e of eleicoes) {
    if (e.turno !== turno) continue;
    if (ciclo && e.ciclo && e.ciclo !== ciclo) continue;
    for (const c of e.cargos) mapa.set(Number(c.cd), c);
  }
  return [...mapa.values()].sort((a, b) => Number(a.cd) - Number(b.cd));
}

export function infoCargo(eleicoes: Eleicao[] | undefined, cd: number): Cargo | undefined {
  for (const e of eleicoes ?? []) {
    const c = e.cargos.find((x) => Number(x.cd) === cd);
    if (c) return c;
  }
  return undefined;
}

/** Fallback quando /eleicoes ainda não carregou */
export function abrangenciaPadrao(cd: number): "br" | "uf" {
  return cd === 1 ? "br" : "uf";
}

export function sistemaPadrao(cd: number): "majoritario" | "proporcional" {
  return cd === 6 || cd === 7 || cd === 8 ? "proporcional" : "majoritario";
}
