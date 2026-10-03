import type { Nivel } from "../api/types";

export const topico = {
  res: (turno: number, cargo: number, nivel: Nivel, id: string) => `res:${turno}:${cargo}:${nivel}:${id}`,
  filhos: (turno: number, cargo: number, nivel: Nivel, id: string, filhos?: Nivel | null) =>
    nivel === "br" && filhos === "municipio"
      ? `filhos:${turno}:${cargo}:br:br:municipio`
      : `filhos:${turno}:${cargo}:${nivel}:${id}`,
  locais: (turno: number, cargo: number, municipio: string) => `locais:${turno}:${cargo}:${municipio}`,
  progresso: (turno: number) => `progresso:${turno}`,
  eventos: (turno: number) => `eventos:${turno}`,
  status: () => "status",
};
