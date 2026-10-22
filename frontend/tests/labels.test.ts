import { describe, expect, it } from "vitest";
import type { CandidateStatus, EventType, TallyStatus } from "../src/api/models";
import { STATUS_COLORS, STATUS_LABELS, SITUATION_STYLES } from "../src/lib/palettes";
import { EVENT_COLORS, EVENT_LABELS } from "../src/modules/events";

// The API sends English values; the labels the user reads stay in Portuguese and live in src/lib.
describe("candidate status labels", () => {
  const cases: [CandidateStatus, string][] = [
    ["ELECTED", "Eleito"],
    ["RUNOFF", "2º turno"],
    ["MATHEMATICALLY_ELECTED", "Matematicamente eleito"],
    ["LEADING", "Liderando"],
    ["SUBSTITUTE", "Suplente"],
    ["NOT_ELECTED", "Não eleito"],
    ["SUB_JUDICE", "Sub judice"],
    ["COUNTING", "Em apuração"],
  ];

  it.each(cases)("maps %s to %s", (status, rotulo) => {
    expect(SITUATION_STYLES[status].rotulo).toBe(rotulo);
  });

  it("gives every status a description and a colour", () => {
    for (const [status] of cases) {
      expect(SITUATION_STYLES[status].descricao.length).toBeGreaterThan(0);
      expect(SITUATION_STYLES[status].cor.length).toBeGreaterThan(0);
    }
  });
});

describe("tally status labels", () => {
  const cases: [TallyStatus, string][] = [
    ["not_received", "Não recebido"],
    ["partial", "Parcial"],
    ["tallied", "100% apurado"],
  ];

  it.each(cases)("maps %s to %s", (status, rotulo) => {
    expect(STATUS_LABELS[status]).toBe(rotulo);
    expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("event labels", () => {
  const tipos: EventType[] = [
    "start",
    "milestone",
    "lead_change",
    "elected",
    "mathematically_decided",
    "runoff",
  ];

  it("has a label and a colour for every event type", () => {
    for (const tipo of tipos) {
      expect(EVENT_LABELS[tipo]).toBeTruthy();
      expect(EVENT_COLORS[tipo]).toBeTruthy();
    }
    expect(EVENT_LABELS.lead_change).toBe("Virada");
  });
});
