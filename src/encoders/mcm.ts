// MCM (MAX7456 analog OSD font) encoder. Inverse of loaders/mcm.ts's
// parseMcmNative: takes a TileMap of 12×18 RGB tiles and emits the ASCII
// text format that Betaflight Configurator's Font Manager accepts.
//
// Format recap:
//   line 0:          "MAX7456"                    (magic header)
//   lines 1..N×64:   for each of 256 glyphs:
//                      54 pixel-data lines (18 rows × 3 lines/row, 4 px/line)
//                      10 padding lines (MAX7456 reserves 64 bytes/glyph)
//
// 2-bit pixel encoding (same as the parser):
//   "00" → black  (outline)
//   "10" → white  (glyph fill)
//   "01" → transparent (canonical representation; parsers accept any non-"00"/"10")
//
// Color → bit mapping: tiles produced by analog-mode workflows only contain
// {black, white, chroma-gray}. We still guard against arbitrary RGB inputs
// (e.g. from a PNG override) by mapping to the nearest-of-three target:
//   - exact chroma-gray                → "01" (transparent)
//   - luminance < 128                  → "00" (outline)
//   - everything else                  → "10" (glyph)

import { MCM_GLYPH_SIZE, ANALOG_GLYPH_COUNT, COLOR_TRANSPARENT } from "@/compositor/constants";
import type { TileMap } from "@/compositor/types";

/** Bytes per 12×18 RGB tile. Exported for test assertions. */
export const ANALOG_TILE_BYTES = MCM_GLYPH_SIZE.w * MCM_GLYPH_SIZE.h * 3;

/** Filler emitted for the 10 padding lines after each glyph's pixel data. */
const PADDING_LINE = "01010101";

/** Filler for missing glyphs (fully transparent). */
const TRANSPARENT_LINE = "01010101";

/**
 * Encode a TileMap (keyed by glyph code 0..255, values are 12×18 RGB tiles)
 * to a newline-delimited MCM string. Exactly 256 glyphs are emitted, in
 * code order. Glyphs absent from the map are written as fully-transparent.
 * Output terminates with a trailing newline.
 */
export function writeMcm(tiles: TileMap): string {
  const out: string[] = ["MAX7456"];
  for (let code = 0; code < ANALOG_GLYPH_COUNT; code++) {
    const tile = tiles.get(code);
    if (tile) {
      if (tile.length !== ANALOG_TILE_BYTES) {
        throw new Error(
          `writeMcm: glyph ${code} has ${tile.length} bytes, expected ${ANALOG_TILE_BYTES} ` +
            `(12×18 RGB). Did a parseMcm (HD 24×36) result sneak in? Use parseMcmNative for analog.`,
        );
      }
      for (let row = 0; row < MCM_GLYPH_SIZE.h; row++) {
        // Each 12-pixel row splits into 3 ASCII lines of 8 chars (4 pixels × 2 bits).
        for (let subLine = 0; subLine < 3; subLine++) {
          let line = "";
          for (let i = 0; i < 4; i++) {
            const pxX = subLine * 4 + i;
            const pxOffset = (row * MCM_GLYPH_SIZE.w + pxX) * 3;
            const r = tile[pxOffset]!;
            const g = tile[pxOffset + 1]!;
            const b = tile[pxOffset + 2]!;
            line += pixelToBits(r, g, b);
          }
          out.push(line);
        }
      }
    } else {
      // Missing glyph — write 54 transparent lines.
      for (let i = 0; i < 54; i++) out.push(TRANSPARENT_LINE);
    }
    // 10 padding lines per glyph, regardless of whether the glyph had data.
    for (let i = 0; i < 10; i++) out.push(PADDING_LINE);
  }
  return out.join("\n") + "\n";
}

/**
 * Map an RGB triple to a 2-char MCM bit pair. See file header for semantics.
 * Exported for tests; consumers should use writeMcm.
 */
export function pixelToBits(r: number, g: number, b: number): string {
  // Exact chroma-gray is the canonical transparent. Match parseMcmNative's
  // output color exactly so a parseMcmNative → writeMcm round-trip is
  // bit-stable.
  if (
    r === COLOR_TRANSPARENT[0] &&
    g === COLOR_TRANSPARENT[1] &&
    b === COLOR_TRANSPARENT[2]
  ) {
    return "01";
  }
  // Rec. 601 luma. Anything darker than mid-grey becomes outline (black).
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 128 ? "00" : "10";
}
