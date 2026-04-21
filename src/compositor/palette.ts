// Color parsing and per-glyph palette resolution.
//
// A "color" in a TtfLayer can be either a single hex string or an array
// thereof. Arrays become palettes: each glyph picks one color via `rng()`.
// Matches the Python fork's random-per-glyph palette semantics.

import type { HexColor } from "@/state/project";

export type Rgb = readonly [number, number, number];

/** Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` (alpha ignored) into an RGB triple. */
export function parseHex(hex: string): Rgb {
  const h = hex.trim().toLowerCase();
  if (!h.startsWith("#")) {
    throw new Error(`parseHex: missing leading '#': ${JSON.stringify(hex)}`);
  }
  const body = h.slice(1);
  let r: number;
  let g: number;
  let b: number;
  if (body.length === 3) {
    r = parseInt(body[0]! + body[0]!, 16);
    g = parseInt(body[1]! + body[1]!, 16);
    b = parseInt(body[2]! + body[2]!, 16);
  } else if (body.length === 6 || body.length === 8) {
    r = parseInt(body.slice(0, 2), 16);
    g = parseInt(body.slice(2, 4), 16);
    b = parseInt(body.slice(4, 6), 16);
  } else {
    throw new Error(`parseHex: unrecognised format: ${JSON.stringify(hex)}`);
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    throw new Error(`parseHex: invalid hex digits: ${JSON.stringify(hex)}`);
  }
  return [r, g, b] as const;
}

/**
 * A callable RNG returning a float in [0, 1). `null` seed = Math.random,
 * matching the Python fork's default (unseeded per-build shuffle). Any
 * number seed produces a deterministic stream via xorshift32.
 */
export function createRng(seed: number | null): () => number {
  if (seed === null) {
    return Math.random;
  }
  // xorshift32 — small, deterministic, good enough for palette shuffling.
  // Seed of 0 is degenerate; replace with a nonzero fallback.
  let state = (seed | 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0; // force int32
    // Normalize to [0, 1). Using >>> 0 turns the int32 into a uint32 for range.
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Pick one RGB triple for a single glyph render.
 * - Single hex → parse and return.
 * - Palette of N hexes → pick one uniformly via `rng()`.
 * - Empty palette → throws (a palette must have ≥ 1 color).
 */
export function resolveColor(color: HexColor | HexColor[], rng: () => number): Rgb {
  if (typeof color === "string") {
    return parseHex(color);
  }
  if (color.length === 0) {
    throw new Error("resolveColor: empty palette");
  }
  if (color.length === 1) {
    return parseHex(color[0]!);
  }
  const idx = Math.floor(rng() * color.length);
  return parseHex(color[idx]!);
}
