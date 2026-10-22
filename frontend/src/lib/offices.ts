import type { ElectionDto, OfficeDto } from "../api/models";

export interface OfficeOption {
  valor: string;
  rotulo: string;
  curto: string;
  cds: number[];
}

/** Options of the office SegmentedControl. State/district resolves to 7 or 8 depending on the state. */
export const OFFICE_OPTIONS: OfficeOption[] = [
  { valor: "1", rotulo: "Presidente", curto: "Pres.", cds: [1] },
  { valor: "3", rotulo: "Governador", curto: "Gov.", cds: [3] },
  { valor: "5", rotulo: "Senador", curto: "Sen.", cds: [5] },
  { valor: "6", rotulo: "Dep. Federal", curto: "Dep. Fed.", cds: [6] },
  { valor: "7", rotulo: "Dep. Est./Distrital", curto: "Dep. Est.", cds: [7, 8] },
];

export const OFFICE_NAME: Record<number, string> = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual",
  8: "Deputado Distrital",
};

export const segmentValue = (code: number) => (code === 8 ? "7" : String(code));

/** Adjusts state (7) × district (8) according to the state of the geo area. */
export function officeForState(code: number, uf: string | null | undefined): number {
  if (code === 7 && uf === "df") return 8;
  if (code === 8 && uf && uf !== "df") return 7;
  return code;
}

export function officesOfRound(
  elections: ElectionDto[] | undefined,
  round: number,
  cycle: string | null,
): OfficeDto[] {
  if (!elections) return [];
  const byCode = new Map<number, OfficeDto>();
  for (const election of elections) {
    if (election.round !== round) continue;
    if (cycle && election.cycle && election.cycle !== cycle) continue;
    for (const office of election.offices) byCode.set(Number(office.office_code), office);
  }
  return [...byCode.values()].sort((a, b) => Number(a.office_code) - Number(b.office_code));
}

export function officeInfo(elections: ElectionDto[] | undefined, code: number): OfficeDto | undefined {
  for (const election of elections ?? []) {
    const office = election.offices.find((x) => Number(x.office_code) === code);
    if (office) return office;
  }
  return undefined;
}

/** Fallback while /elections has not loaded. */
export function defaultScope(code: number): "br" | "uf" {
  return code === 1 ? "br" : "uf";
}

export function defaultSystem(code: number): "majoritario" | "proporcional" {
  return code === 6 || code === 7 || code === 8 ? "proporcional" : "majoritario";
}
