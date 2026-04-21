import { describe, it, expect } from "vitest";
import { _validateOptionsForTests } from "./ttf";
import type { TtfRasterOptions } from "./ttf";

// Full rasterization tests require real browser Canvas APIs and are covered
// by a Playwright smoke in a later phase. These tests cover argument
// validation only, which is pure logic and safe to run under jsdom.

function baseOpts(): TtfRasterOptions {
  return {
    codes: [65],
    size: 20,
    outlineThickness: 1,
    vStretch: 1,
    glyphOffset: { x: 0, y: 0 },
    outlineOffset: { x: 0, y: 0 },
    glyphColor: "#ffffff",
    outlineColor: "#000000",
    superSampling: 8,
    rng: () => 0,
  };
}

describe("rasterizeTtfSubset options validation", () => {
  it("accepts a well-formed options object", () => {
    expect(() => _validateOptionsForTests(baseOpts())).not.toThrow();
  });

  it("rejects non-positive font size", () => {
    expect(() => _validateOptionsForTests({ ...baseOpts(), size: 0 })).toThrow(/size/);
    expect(() => _validateOptionsForTests({ ...baseOpts(), size: -1 })).toThrow(/size/);
  });

  it("rejects negative outline thickness", () => {
    expect(() =>
      _validateOptionsForTests({ ...baseOpts(), outlineThickness: -0.1 }),
    ).toThrow(/outlineThickness/);
  });

  it("rejects non-positive vStretch", () => {
    expect(() => _validateOptionsForTests({ ...baseOpts(), vStretch: 0 })).toThrow(/vStretch/);
  });

  it("rejects non-integer superSampling", () => {
    expect(() => _validateOptionsForTests({ ...baseOpts(), superSampling: 1.5 })).toThrow(
      /superSampling/,
    );
    expect(() => _validateOptionsForTests({ ...baseOpts(), superSampling: 0 })).toThrow(
      /superSampling/,
    );
  });

  it("rejects empty codes array", () => {
    expect(() => _validateOptionsForTests({ ...baseOpts(), codes: [] })).toThrow(/codes/);
  });
});
