import { describe, it, expect } from "vitest";
import { writeMcm, pixelToBits, ANALOG_TILE_BYTES } from "./mcm";
import { parseMcmNative } from "@/loaders/mcm";
import { MCM_GLYPH_SIZE, ANALOG_GLYPH_COUNT } from "@/compositor/constants";
import type { TileMap } from "@/compositor/types";

/** Build a 12×18 RGB tile filled with a single color. */
function solidTile(r: number, g: number, b: number): Uint8ClampedArray {
  const tile = new Uint8ClampedArray(ANALOG_TILE_BYTES);
  for (let i = 0; i < tile.length; i += 3) {
    tile[i] = r;
    tile[i + 1] = g;
    tile[i + 2] = b;
  }
  return tile;
}

/** Mirror of the loader test's glyph-builder so we can generate known inputs. */
function buildMcmGlyph(rows: string[]): string {
  if (rows.length !== 18) throw new Error("need 18 rows");
  const lines: string[] = [];
  for (const row of rows) {
    if (row.length !== 12) throw new Error("row must be 12 chars");
    for (let sub = 0; sub < 3; sub++) {
      const chunk = row.slice(sub * 4, sub * 4 + 4);
      let bits = "";
      for (const ch of chunk) {
        if (ch === "0") bits += "00";
        else if (ch === "1") bits += "10";
        else bits += "01";
      }
      lines.push(bits);
    }
  }
  for (let i = 0; i < 10; i++) lines.push("01010101");
  return lines.join("\n");
}

describe("pixelToBits", () => {
  it("maps chroma-gray exactly to transparent 01", () => {
    expect(pixelToBits(127, 127, 127)).toBe("01");
  });

  it("maps pure black to outline 00", () => {
    expect(pixelToBits(0, 0, 0)).toBe("00");
  });

  it("maps pure white to glyph fill 10", () => {
    expect(pixelToBits(255, 255, 255)).toBe("10");
  });

  it("routes darker-than-mid-grey colors to outline", () => {
    // Rec.601 luma of (50, 50, 50) = 50, well below 128 threshold.
    expect(pixelToBits(50, 50, 50)).toBe("00");
  });

  it("routes brighter colors to glyph fill (handles colored PNGs)", () => {
    // Saturated magenta: luma = 0.299*255 + 0.114*255 = 105.4 — below 128.
    // Bright yellow: luma = 0.299*255 + 0.587*255 = 225.9 — above 128.
    expect(pixelToBits(255, 255, 0)).toBe("10");
  });

  it("treats off-by-one-from-chroma as non-transparent", () => {
    // Only exact (127,127,127) is transparent — any drift falls through to
    // the luma threshold. Guards against accidental transparency from noisy
    // PNG inputs.
    expect(pixelToBits(128, 127, 127)).not.toBe("01");
  });
});

describe("writeMcm", () => {
  it("emits the MAX7456 magic header on line 1", () => {
    const out = writeMcm(new Map());
    expect(out.startsWith("MAX7456\n")).toBe(true);
  });

  it("emits exactly 256 glyphs × 64 lines + header", () => {
    const out = writeMcm(new Map());
    const lines = out.split("\n");
    // Header (1) + 256 glyphs × 64 lines + trailing newline (empty string).
    expect(lines.length).toBe(1 + ANALOG_GLYPH_COUNT * 64 + 1);
  });

  it("fills missing glyphs with fully-transparent data", () => {
    const out = writeMcm(new Map());
    const lines = out.split("\n");
    // First glyph's first pixel line should be all transparent.
    expect(lines[1]).toBe("01010101");
    // Last glyph's last data line (line 256*64 = 16384 of data, offset by header=1).
    // Every data line should be transparent when the map is empty.
    const glyph0Data = lines.slice(1, 55); // 54 data lines of glyph 0
    for (const l of glyph0Data) {
      expect(l).toBe("01010101");
    }
  });

  it("encodes a solid-white tile as all '10' bit pairs", () => {
    const tiles: TileMap = new Map();
    tiles.set(0, solidTile(255, 255, 255));
    const out = writeMcm(tiles);
    const lines = out.split("\n");
    // Glyph 0's 54 data lines should all be "10101010" (4 pixels × "10" = 8 chars).
    for (let i = 1; i <= 54; i++) {
      expect(lines[i]).toBe("10101010");
    }
    // Padding stays transparent.
    expect(lines[55]).toBe("01010101");
  });

  it("throws clearly if an HD-sized tile leaks in", () => {
    const tiles: TileMap = new Map();
    const hdSized = new Uint8ClampedArray(24 * 36 * 3);
    tiles.set(0, hdSized);
    expect(() => writeMcm(tiles)).toThrow(/expected 648/);
  });
});

describe("MCM round-trip (parseMcmNative ↔ writeMcm)", () => {
  it("parseMcmNative(writeMcm(tiles)) preserves tile contents", () => {
    const original: TileMap = new Map();
    // Glyph 0 — classic "outlined block" pattern.
    const pattern0 = buildMcmGlyph([
      "111111111111",
      "100000000001",
      "101111111101",
      "101000000101",
      "101011110101",
      "101010010101",
      "101010010101",
      "101011110101",
      "101000000101",
      "101111111101",
      "100000000001",
      "111111111111",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
    ]);
    const nativeDecoded = parseMcmNative(pattern0);
    original.set(0, nativeDecoded.get(0)!);

    const mcmText = writeMcm(original);
    const reDecoded = parseMcmNative(mcmText);
    expect(reDecoded.get(0)).toEqual(original.get(0));
  });

  it("handles a sparse tile map (some codes present, most absent)", () => {
    const original: TileMap = new Map();
    const glyphs = [0, 65, 128, 255]; // sprinkled across the code space
    for (const code of glyphs) {
      const t = new Uint8ClampedArray(ANALOG_TILE_BYTES);
      // Fill with a pattern unique to this code so we can verify.
      for (let i = 0; i < t.length; i += 3) {
        if (code % 2 === 0) {
          t[i] = 255;
          t[i + 1] = 255;
          t[i + 2] = 255;
        } // else leave zero (which writeMcm will classify as outline/black)
      }
      original.set(code, t);
    }

    const mcmText = writeMcm(original);
    const reDecoded = parseMcmNative(mcmText);
    expect(reDecoded.size).toBe(ANALOG_GLYPH_COUNT); // all slots get emitted + read back
    for (const code of glyphs) {
      const got = reDecoded.get(code)!;
      const want = original.get(code)!;
      // Compare pixel-by-pixel; writeMcm normalizes black pixels to (0,0,0) and
      // white to (255,255,255), which matches parseMcmNative's default colors.
      expect(got).toEqual(want);
    }
  });

  it("tile bytes are exactly 12×18×3 = 648", () => {
    expect(ANALOG_TILE_BYTES).toBe(648);
    expect(MCM_GLYPH_SIZE.w * MCM_GLYPH_SIZE.h * 3).toBe(ANALOG_TILE_BYTES);
  });
});
