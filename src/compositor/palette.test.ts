import { describe, it, expect } from "vitest";
import { parseHex, createRng, resolveColor } from "./palette";

describe("parseHex", () => {
  it("parses 6-digit hex", () => {
    expect(parseHex("#ff0000")).toEqual([255, 0, 0]);
    expect(parseHex("#00ff00")).toEqual([0, 255, 0]);
    expect(parseHex("#0000ff")).toEqual([0, 0, 255]);
    expect(parseHex("#ffffff")).toEqual([255, 255, 255]);
    expect(parseHex("#000000")).toEqual([0, 0, 0]);
  });

  it("is case-insensitive", () => {
    expect(parseHex("#FFB000")).toEqual([255, 176, 0]);
    expect(parseHex("#ffb000")).toEqual([255, 176, 0]);
  });

  it("parses 3-digit shorthand", () => {
    expect(parseHex("#f0a")).toEqual([255, 0, 170]);
  });

  it("ignores alpha channel in 8-digit hex", () => {
    expect(parseHex("#ff0000cc")).toEqual([255, 0, 0]);
  });

  it("throws on missing #", () => {
    expect(() => parseHex("ff0000")).toThrow(/missing leading/);
  });

  it("throws on bad length", () => {
    expect(() => parseHex("#ff00")).toThrow(/unrecognised/);
  });

  it("throws on non-hex digits", () => {
    expect(() => parseHex("#xyz123")).toThrow(/invalid hex/);
  });
});

describe("createRng", () => {
  it("returns Math.random when seed is null", () => {
    const rng = createRng(null);
    const samples = Array.from({ length: 5 }, () => rng());
    samples.forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
    samples.forEach((s) => expect(s).toBeLessThan(1));
  });

  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge quickly", () => {
    const a = createRng(1);
    const b = createRng(2);
    const first5a = Array.from({ length: 5 }, () => a());
    const first5b = Array.from({ length: 5 }, () => b());
    expect(first5a).not.toEqual(first5b);
  });

  it("handles seed 0 without getting stuck on zero state", () => {
    const r = createRng(0);
    const values = Array.from({ length: 10 }, () => r());
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("outputs remain in [0, 1)", () => {
    const r = createRng(123456);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("resolveColor", () => {
  const noRng = () => 0; // unused in single-color case

  it("single hex returns that color", () => {
    expect(resolveColor("#112233", noRng)).toEqual([17, 34, 51]);
  });

  it("single-element palette returns that color", () => {
    expect(resolveColor(["#ff0000"], noRng)).toEqual([255, 0, 0]);
  });

  it("multi-element palette uses rng for selection (deterministic with seed)", () => {
    const rng = createRng(7);
    const palette = ["#ff0000", "#00ff00", "#0000ff"] as const;
    const rolls = Array.from({ length: 20 }, () => resolveColor([...palette], rng));
    // should include at least two distinct colors in 20 draws
    const distinct = new Set(rolls.map((r) => r.join(",")));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
    // reproducibility: seeded run produces the same sequence
    const rng2 = createRng(7);
    const rolls2 = Array.from({ length: 20 }, () => resolveColor([...palette], rng2));
    expect(rolls).toEqual(rolls2);
  });

  it("throws on empty palette", () => {
    expect(() => resolveColor([], noRng)).toThrow(/empty palette/);
  });
});
