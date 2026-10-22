import type { WidgetType } from "../schema";
import type { DefWidget, FieldConfig } from "./types";
import { RESULT_DEFINITIONS } from "./definitions-results";
import { DETAIL_DEFINITIONS } from "./definitions-details";

/** Appearance and behavior fields shared by every widget. */
export const COMMON_FIELDS: FieldConfig[] = [
  { key: "titulo", label: "Título", type: "text" },
  {
    key: "clique",
    label: "Ao clicar em mapa/tabela",
    type: "select",
    options: [
      { value: "filtrar", label: "Filtrar o painel (cross-filtering)" },
      { value: "navegar", label: "Abrir a página do recorte" },
    ],
  },
];

/** Definition of every widget type, in catalog order. */
export const REGISTRY: Record<WidgetType, DefWidget> = { ...RESULT_DEFINITIONS, ...DETAIL_DEFINITIONS };

export const CATALOG = Object.values(REGISTRY);
