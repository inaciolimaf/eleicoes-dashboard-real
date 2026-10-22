import {
  IconBuildingCommunity,
  IconCalendarEvent,
  IconClock,
  IconNotes,
  IconSchool,
  IconUserCircle,
} from "@tabler/icons-react";
import type { DefWidget } from "./types";
import { optionPairs } from "./types";
import { EVENT_TYPES } from "../../events";
import {
  CandidateWidget,
  ClockWidget,
  EventsWidget,
  PollingPlaceWidget,
  SectionWidget,
  TextWidget,
} from "./detail-widgets";

export type DetailWidgetType = "eventos" | "candidato" | "local" | "secao" | "relogio" | "texto";

/** Event feed, candidate card, polling place, section, clock and note. */
export const DETAIL_DEFINITIONS: Record<DetailWidgetType, DefWidget> = {
  eventos: {
    type: "eventos",
    name: "Feed de eventos",
    description: "Viradas, marcos da apuração, eleitos e 2º turno em tempo real.",
    icon: IconCalendarEvent,
    size: { w: 4, h: 9, minW: 3, minH: 4 },
    defaults: { limite: 50, soRecorte: false, soCargo: false },
    fields: [
      {
        key: "tipos",
        label: "Tipos de evento (vazio = todos)",
        type: "multiselect",
        options: EVENT_TYPES,
      },
      { key: "limite", label: "Quantidade máxima", type: "number", min: 5, max: 200 },
      { key: "soCargo", label: "Só do cargo do filtro", type: "switch" },
      { key: "soRecorte", label: "Só do recorte do filtro", type: "switch" },
    ],
    Component: EventsWidget,
  },
  candidato: {
    type: "candidato",
    name: "Card de candidato",
    description: "Foto, número, partido, vice/suplentes, votos e selo de situação.",
    icon: IconUserCircle,
    size: { w: 5, h: 5, minW: 3, minH: 4 },
    defaults: {},
    fields: [{ key: "sqcand", label: "Candidato", type: "candidate" }],
    Component: CandidateWidget,
  },
  local: {
    type: "local",
    name: "Local de votação",
    description: "Mini-mapa, endereço e lista de seções com status.",
    icon: IconSchool,
    size: { w: 6, h: 11, minW: 3, minH: 6 },
    defaults: {},
    fields: [{ key: "localId", label: "Local (vazio = usa o filtro)", type: "pollingPlace" }],
    Component: PollingPlaceWidget,
  },
  secao: {
    type: "secao",
    name: "Detalhe de seção (BU)",
    description: "Boletim de urna decodificado: votos por cargo, horário, hash e assinatura.",
    icon: IconBuildingCommunity,
    size: { w: 6, h: 11, minW: 3, minH: 6 },
    defaults: {},
    fields: [{ key: "secaoId", label: "Seção (vazio = usa o filtro)", type: "section" }],
    Component: SectionWidget,
  },
  relogio: {
    type: "relogio",
    name: "Relógio / contagem regressiva",
    description: "Horário de Brasília ou contagem até um horário (ex.: início da divulgação).",
    icon: IconClock,
    size: { w: 3, h: 4, minW: 2, minH: 3 },
    defaults: { modo: "relogio" },
    fields: [
      {
        key: "modo",
        label: "Modo",
        type: "select",
        options: optionPairs([
          ["relogio", "Relógio de Brasília"],
          ["contagem", "Contagem regressiva"],
        ]),
      },
      { key: "alvo", label: "Contar até", type: "datetime", when: (c) => c.modo === "contagem" },
      { key: "rotulo", label: "Rótulo", type: "text" },
    ],
    Component: ClockWidget,
  },
  texto: {
    type: "texto",
    name: "Texto / anotação",
    description: "Anotações em markdown simples.",
    icon: IconNotes,
    size: { w: 4, h: 4, minW: 2, minH: 2 },
    defaults: { texto: "## Anotações\n- Acompanhar a virada em **MG**\n- Abrir o placar do Senado" },
    fields: [{ key: "texto", label: "Texto (markdown)", type: "textarea" }],
    Component: TextWidget,
  },
};
