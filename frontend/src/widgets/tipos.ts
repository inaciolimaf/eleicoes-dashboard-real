import type { Icon } from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { Nivel } from "../api/types";
import type { TipoWidget, WidgetCfg } from "../paineis/schema";

export interface WidgetProps {
  widget: WidgetCfg;
  cfg: Record<string, unknown>;
  /** altura útil (px) do corpo do widget */
  altura: number;
  /** clique em mapa/tabela: filtra o painel (cross-filtering) ou navega, conforme a configuração */
  selecionar: (nivel: Nivel, id: string, nome: string) => void;
}

export type TipoCampo =
  | "texto"
  | "textarea"
  | "numero"
  | "switch"
  | "select"
  | "multiselect"
  | "cor"
  | "candidato"
  | "candidatos"
  | "recorte"
  | "recortes"
  | "local"
  | "secao"
  | "datahora";

export interface CampoConfig {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes?: { value: string; label: string }[];
  min?: number;
  max?: number;
  descricao?: string;
  /** mostra o campo só quando a condição for verdadeira */
  quando?: (cfg: Record<string, unknown>) => boolean;
}

export interface DefWidget {
  tipo: TipoWidget;
  nome: string;
  descricao: string;
  icone: Icon;
  tamanho: { w: number; h: number; minW?: number; minH?: number };
  padrao: Record<string, unknown>;
  campos: CampoConfig[];
  Componente: ComponentType<WidgetProps>;
  /** recurso de /export para CSV/JSON */
  exporta?: "resultados" | "filhos";
}

export const cfgNum = (c: Record<string, unknown>, k: string, d: number) => (typeof c[k] === "number" ? (c[k] as number) : d);
export const cfgStr = (c: Record<string, unknown>, k: string, d: string): string =>
  typeof c[k] === "string" && c[k] !== "" ? (c[k] as string) : d;
export const cfgBool = (c: Record<string, unknown>, k: string, d: boolean) => (typeof c[k] === "boolean" ? (c[k] as boolean) : d);
export const cfgArr = (c: Record<string, unknown>, k: string): string[] =>
  Array.isArray(c[k]) ? (c[k] as unknown[]).filter((x): x is string => typeof x === "string") : [];
export const cfgStrOuNull = (c: Record<string, unknown>, k: string): string | null =>
  typeof c[k] === "string" && c[k] !== "" ? (c[k] as string) : null;
