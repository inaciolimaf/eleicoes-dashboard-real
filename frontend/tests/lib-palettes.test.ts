import { describe, expect, it } from "vitest";
import {
  colorByIndex,
  colorByNumber,
  cssGradient,
  divergingColor,
  hexToRgb,
  marginAlpha,
  rgba,
  sequentialColor,
  STATUS_LABELS,
} from "../src/lib/palettes";
import { MAP_BACKGROUND_DARK, MAP_BACKGROUND_LIGHT } from "../src/lib/palettes/maps";

describe("hex colors", () => {
  it("reads six and three digit colors, with or without the hash", () => {
    expect(hexToRgb("#FF8000")).toEqual([255, 128, 0]);
    expect(hexToRgb("0f0")).toEqual([0, 255, 0]);
  });

  it("falls back to grey for an unreadable color", () => {
    expect(hexToRgb("#zzzzzz")).toEqual([128, 128, 128]);
  });

  it("builds a CSS rgba string", () => {
    expect(rgba("#000000", 0.5)).toBe("rgba(0,0,0,0.5)");
  });
});

describe("categorical colors", () => {
  it("cycles through the palette, also for negative indexes", () => {
    expect(colorByIndex(0)).toBe(colorByIndex(12));
    expect(colorByIndex(-1)).toBe(colorByIndex(11));
  });

  it("colors a number by its party (the first two digits), and by the palette beyond the table", () => {
    expect(colorByNumber(13)).toBe("#D7191C");
    expect(colorByNumber(1300)).toBe("#D7191C");
    expect(colorByNumber(-13)).toBe("#D7191C");
    expect(colorByNumber(99)).toBe(colorByIndex(99));
  });

  it("labels the statuses in Portuguese", () => {
    expect(STATUS_LABELS.tallied).toBe("100% apurado");
  });
});

describe("scales", () => {
  it("interpolates the sequential scale between its ends, clamping the input", () => {
    expect(sequentialColor(-1)).toEqual(sequentialColor(0));
    expect(sequentialColor(2)).toEqual(sequentialColor(1));
    expect(sequentialColor(0)).toEqual([30, 42, 90]);
  });

  it("uses the candidates' colors on a diverging scale when both are given", () => {
    expect(divergingColor(1, "#000000", "#ffffff")).toEqual([0, 0, 0]);
    expect(divergingColor(-1, "#000000", "#ffffff")).toEqual([255, 255, 255]);
    expect(divergingColor(0, "#000000", "#ffffff")).toEqual([200, 204, 214]);
  });

  it("uses the built-in diverging scale without candidate colors", () => {
    expect(divergingColor(0)).toEqual([230, 232, 238]);
    expect(divergingColor(5)).toEqual(divergingColor(1));
    expect(divergingColor(-1)).not.toEqual(divergingColor(1));
  });

  it("builds a CSS gradient with the stops of the function", () => {
    const gradient = cssGradient((t) => [t * 255, 0, 0], 3);
    expect(gradient).toBe("linear-gradient(90deg, rgb(0,0,0) 0%, rgb(127.5,0,0) 50%, rgb(255,0,0) 100%)");
  });
});

describe("winning margin bands", () => {
  it("maps the margin to the opacity of its band", () => {
    expect(marginAlpha(1)).toBe(0.35);
    expect(marginAlpha(3)).toBe(0.5);
    expect(marginAlpha(7)).toBe(0.66);
    expect(marginAlpha(15)).toBe(0.82);
    expect(marginAlpha(40)).toBe(0.97);
  });

  it("uses the lightest band for a missing or invalid margin", () => {
    expect(marginAlpha(null)).toBe(0.35);
    expect(marginAlpha(undefined)).toBe(0.35);
    expect(marginAlpha(Number.NaN)).toBe(0.35);
  });
});

describe("map backgrounds", () => {
  it("keeps the dark and light background colors apart", () => {
    expect(MAP_BACKGROUND_DARK).not.toBe(MAP_BACKGROUND_LIGHT);
  });
});
