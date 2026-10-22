import type { ElectionDto, OfficeDto } from "../api/models";

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

export function cargosDoTurno(
  eleicoes: ElectionDto[] | undefined,
  turno: number,
  ciclo: string | null,
): OfficeDto[] {
  if (!eleicoes) return [];
  const mapa = new Map<number, OfficeDto>();
  for (const e of eleicoes) {
    if (e.round !== turno) continue;
    if (ciclo && e.cycle && e.cycle !== ciclo) continue;
    for (const c of e.offices) mapa.set(Number(c.office_code), c);
  }
  return [...mapa.values()].sort((a, b) => Number(a.office_code) - Number(b.office_code));
}

export function infoCargo(eleicoes: ElectionDto[] | undefined, cd: number): OfficeDto | undefined {
  for (const e of eleicoes ?? []) {
    const c = e.offices.find((x) => Number(x.office_code) === cd);
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
