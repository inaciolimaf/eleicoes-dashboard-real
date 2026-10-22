import { describe, expect, it } from "vitest";
import {
  fmtCompact,
  fmtInt,
  fmtNum,
  fmtPct,
  fmtPP,
  initials,
  stripAccents,
  slug,
} from "../src/lib/formatting";

// Intl pt-BR separators: "." for thousands, "," for decimals; compact notation uses a non-breaking space.
describe("fmtInt", () => {
  it("formats integers with pt-BR thousands separators", () => {
    expect(fmtInt(1234567)).toBe("1.234.567");
  });
  it("rounds to no decimal places", () => {
    expect(fmtInt(2.5)).toBe("3");
    expect(fmtInt(2.4)).toBe("2");
  });
  it("shows a dash for null, undefined, NaN and infinity", () => {
    expect(fmtInt(null)).toBe("—");
    expect(fmtInt(undefined)).toBe("—");
    expect(fmtInt(Number.NaN)).toBe("—");
    expect(fmtInt(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("keeps zero and negatives", () => {
    expect(fmtInt(0)).toBe("0");
    expect(fmtInt(-1500)).toBe("-1.500");
  });
});

describe("fmtPct", () => {
  it("uses two decimals by default and a percent sign", () => {
    expect(fmtPct(52.345)).toBe("52,35%");
    expect(fmtPct(0)).toBe("0,00%");
  });
  it("uses one decimal when asked for 1 place", () => {
    expect(fmtPct(52.345, 1)).toBe("52,3%");
  });
  it("shows a dash when the value is missing", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(undefined, 1)).toBe("—");
    expect(fmtPct(Number.NaN)).toBe("—");
  });
});

describe("fmtPP", () => {
  it("appends p.p. with two decimals", () => {
    expect(fmtPP(1.5)).toBe("1,50 p.p.");
    expect(fmtPP(-0.25)).toBe("-0,25 p.p.");
  });
  it("shows a dash when the value is missing", () => {
    expect(fmtPP(null)).toBe("—");
    expect(fmtPP(Number.NEGATIVE_INFINITY)).toBe("—");
  });
});

describe("fmtCompact", () => {
  it("abbreviates large numbers", () => {
    expect(fmtCompact(1500)).toBe("1,5\u00a0mil");
    expect(fmtCompact(2000000)).toBe("2\u00a0mi");
  });
  it("shows a dash when the value is missing", () => {
    expect(fmtCompact(undefined)).toBe("—");
  });
});

describe("fmtNum", () => {
  it("uses 2 decimal places by default and trims trailing zeros", () => {
    expect(fmtNum(1.5)).toBe("1,5");
    expect(fmtNum(1234.567)).toBe("1.234,57");
  });
  it("respects the number of decimal places given", () => {
    expect(fmtNum(1.23456, 0)).toBe("1");
    expect(fmtNum(1.23456, 4)).toBe("1,2346");
  });
  it("shows a dash when the value is missing", () => {
    expect(fmtNum(null, 3)).toBe("—");
  });
});

describe("iniciais", () => {
  it("returns the first letters of the first and last names", () => {
    expect(initials("Maria da Silva Souza")).toBe("MS");
  });
  it("returns the first two letters of a single name, in upper case", () => {
    expect(initials("ana")).toBe("AN");
  });
  it("ignores extra spaces around the name", () => {
    expect(initials("   João   Pedro  ")).toBe("JP");
  });
  it("returns ? for an empty or blank name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("slug", () => {
  it("removes accents and turns spaces and punctuation into single hyphens", () => {
    expect(slug("São Paulo — Capital!")).toBe("sao-paulo-capital");
  });
  it("trims hyphens at both ends", () => {
    expect(slug("  --Eleições 2026--  ")).toBe("eleicoes-2026");
  });
  it("returns an empty string when nothing alphanumeric is left", () => {
    expect(slug("!!! ???")).toBe("");
  });
});

describe("semAcento", () => {
  it("removes accents and lower-cases without touching other characters", () => {
    expect(stripAccents("Ação ÉTICA 2026")).toBe("acao etica 2026");
  });
  it("keeps the string as is when there are no accents", () => {
    expect(stripAccents("abc")).toBe("abc");
  });
});
