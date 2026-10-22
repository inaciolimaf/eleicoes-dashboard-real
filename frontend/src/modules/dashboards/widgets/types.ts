import type { Icon } from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { Level } from "../../../api/models";
import type { WidgetType, WidgetCfg } from "../schema";

export interface WidgetProps {
  widget: WidgetCfg;
  /** Widget configuration with the defaults of its type applied. */
  config: Record<string, unknown>;
  /** Usable height (px) of the widget body. */
  height: number;
  /** Click on a map or table: filters the dashboard (cross-filtering) or navigates, per configuration. */
  onSelect: (level: Level, id: string, name: string) => void;
}

/** Kinds of input the configuration drawer knows how to render. */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "switch"
  | "select"
  | "multiselect"
  | "color"
  | "candidate"
  | "candidates"
  | "geoArea"
  | "geoAreas"
  | "pollingPlace"
  | "section"
  | "datetime";

export interface FieldConfig {
  /** Key of the widget's `config` object (saved in the dashboard JSON). */
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  description?: string;
  /** Shows the field only when this returns true for the current configuration. */
  when?: (config: Record<string, unknown>) => boolean;
}

export interface DefWidget {
  type: WidgetType;
  name: string;
  description: string;
  icon: Icon;
  size: { w: number; h: number; minW?: number; minH?: number };
  defaults: Record<string, unknown>;
  fields: FieldConfig[];
  Component: ComponentType<WidgetProps>;
  /** Which data the CSV/JSON export of the widget uses (`/export`). */
  exportKind?: "resultados" | "filhos";
}

/** Option list for a select field, from `[value, label]` pairs. */
export const optionPairs = (values: [string, string][]) => values.map(([value, label]) => ({ value, label }));

export const configNumber = (config: Record<string, unknown>, key: string, fallback: number) =>
  typeof config[key] === "number" ? (config[key] as number) : fallback;
export const configString = (config: Record<string, unknown>, key: string, fallback: string): string =>
  typeof config[key] === "string" && config[key] !== "" ? (config[key] as string) : fallback;
export const configBool = (config: Record<string, unknown>, key: string, fallback: boolean) =>
  typeof config[key] === "boolean" ? (config[key] as boolean) : fallback;
export const configArray = (config: Record<string, unknown>, key: string): string[] =>
  Array.isArray(config[key])
    ? (config[key] as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
export const configStringOrNull = (config: Record<string, unknown>, key: string): string | null =>
  typeof config[key] === "string" && config[key] !== "" ? (config[key] as string) : null;
