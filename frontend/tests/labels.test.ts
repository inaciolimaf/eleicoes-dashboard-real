import { describe, expect, it } from "vitest";
import type { CandidateStatus, EventType, TallyStatus } from "../src/api/models";
import { COR_STATUS, ROTULO_STATUS, SITUACAO } from "../src/lib/cores";
import { COR_EVENTO, ROTULO_EVENTO } from "../src/lib/eventos";

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
    expect(SITUACAO[status].rotulo).toBe(rotulo);
  });

  it("gives every status a description and a colour", () => {
    for (const [status] of cases) {
      expect(SITUACAO[status].descricao.length).toBeGreaterThan(0);
      expect(SITUACAO[status].cor.length).toBeGreaterThan(0);
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
    expect(ROTULO_STATUS[status]).toBe(rotulo);
    expect(COR_STATUS[status]).toMatch(/^#[0-9a-fA-F]{6}$/);
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
      expect(ROTULO_EVENTO[tipo]).toBeTruthy();
      expect(COR_EVENTO[tipo]).toBeTruthy();
    }
    expect(ROTULO_EVENTO.lead_change).toBe("Virada");
  });
});
