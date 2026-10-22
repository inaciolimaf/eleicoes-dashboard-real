import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectionDto } from "../src/api/models";
import {
  defaultScope,
  defaultSystem,
  officeForState,
  officeInfo,
  officesOfRound,
  segmentValue,
} from "../src/lib/offices";
import { brt, fmtDateTime, fmtRelative, fmtShortDate, fmtTime, minutesSince } from "../src/lib/time";

function office(code: number, name: string) {
  return { office_code: String(code), name, voting_system: "majoritario" } as never;
}

const ELECTIONS = [
  { round: 1, cycle: "2026", offices: [office(1, "Presidente"), office(6, "Deputado Federal")] },
  { round: 2, cycle: "2026", offices: [office(1, "Presidente")] },
  { round: 1, cycle: "2022", offices: [office(3, "Governador")] },
] as unknown as ElectionDto[];

describe("offices", () => {
  it("resolves state and district offices by the state of the area", () => {
    expect(officeForState(7, "df")).toBe(8);
    expect(officeForState(8, "sp")).toBe(7);
    expect(officeForState(7, "sp")).toBe(7);
    expect(officeForState(8, null)).toBe(8);
    expect(officeForState(1, "sp")).toBe(1);
  });

  it("maps the district office to the state segment of the office selector", () => {
    expect(segmentValue(8)).toBe("7");
    expect(segmentValue(3)).toBe("3");
  });

  it("chooses the default scope and voting system of an office", () => {
    expect(defaultScope(1)).toBe("br");
    expect(defaultScope(5)).toBe("uf");
    expect(defaultSystem(6)).toBe("proporcional");
    expect(defaultSystem(8)).toBe("proporcional");
    expect(defaultSystem(1)).toBe("majoritario");
  });

  it("lists the offices of a round and cycle, once each and sorted by code", () => {
    const first = officesOfRound(ELECTIONS, 1, "2026");
    expect(first.map((o) => o.name)).toEqual(["Presidente", "Deputado Federal"]);
    expect(officesOfRound(ELECTIONS, 2, null).map((o) => o.name)).toEqual(["Presidente"]);
    expect(officesOfRound(ELECTIONS, 1, null)).toHaveLength(3);
    expect(officesOfRound(undefined, 1, null)).toEqual([]);
  });

  it("finds an office by code in any election", () => {
    expect(officeInfo(ELECTIONS, 3)?.name).toBe("Governador");
    expect(officeInfo(ELECTIONS, 99)).toBeUndefined();
    expect(officeInfo(undefined, 1)).toBeUndefined();
  });
});

describe("time formatting (Brasília)", () => {
  it("shows the time with or without seconds, and a dash without a value", () => {
    expect(fmtTime("2026-10-04T18:05:09Z")).toBe("15:05:09");
    expect(fmtTime("2026-10-04T18:05:09Z", false)).toBe("15:05");
    expect(fmtTime(null)).toBe("—");
  });

  it("shows the date and the time, and the short form", () => {
    expect(fmtDateTime("2026-10-04T18:05:09Z")).toBe("04/10/2026 15:05:09");
    expect(fmtShortDate("2026-10-04T18:05:09Z")).toBe("04/10 15:05");
    expect(fmtDateTime(undefined)).toBe("—");
    expect(fmtShortDate("")).toBe("—");
  });

  it("converts any instant to the Brasília zone", () => {
    expect(brt("2026-10-04T18:00:00Z").format("HH:mm")).toBe("15:00");
    expect(brt(null).isValid()).toBe(true);
  });

  describe("with a fixed clock", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-04T18:10:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("gives the relative time in Portuguese", () => {
      expect(fmtRelative("2026-10-04T18:00:00Z")).toBe("há 10 minutos");
      expect(fmtRelative(null)).toBe("—");
    });

    it("counts minutes since an instant, up to now or up to a given one", () => {
      expect(minutesSince("2026-10-04T18:00:00Z")).toBeCloseTo(10);
      expect(minutesSince("2026-10-04T18:00:00Z", "2026-10-04T18:30:00Z")).toBeCloseTo(30);
      expect(minutesSince(null)).toBeNull();
    });
  });
});
