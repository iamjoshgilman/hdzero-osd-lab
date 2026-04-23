// .MCM analog OSD font parser. Format matches MAX7456 NVM tooling:
//
//   line 0 (optional):  "MAX7456"            (magic header)
//   lines 1..N:         64 ASCII lines per glyph, each 8 chars of "0"/"1"
//                       encoding 4 pixels at 2 bits each.
//
// Each glyph is 12 wide × 18 tall = 216 pixels = 54 bytes (54 lines of 8
// chars = 54*4 pixels). The remaining 10 lines per glyph are padding (MAX7456
// allocates 64 bytes per glyph in NVM).
//
// 2-bit pixel encoding:
//   "00" → black  (outline)
//   "10" → white  (glyph fill)
//   anything else → transparent (chroma-gray)
//
// Two parse modes:
//   parseMcm       → returns 24×36 RGB tiles (upscaled 2× for HD composition)
//   parseMcmNative → returns 12×18 RGB tiles (native analog, for analog mode)

import {
  COLOR_MCM_BLACK,
  COLOR_MCM_WHITE,
  COLOR_TRANSPARENT,
  GLYPH_SIZE,
  MCM_GLYPH_SIZE,
} from "@/compositor/constants";
import type { Tile, TileMap } from "@/compositor/types";
import { parseHex } from "@/compositor/palette";
import type { HexColor } from "@/state/project";

export interface McmLoadOptions {
  /** Replace the MCM's white glyph ink with this hex. Defaults to white. */
  glyphColor?: HexColor | string;
  /** Replace the MCM's black outline with this hex. Defaults to black. */
  outlineColor?: HexColor | string;
  /**
   * Called for each glyph that has at least one malformed line (wrong
   * length, missing, etc.). The glyph is still returned with missing
   * pixels rendered as chroma-gray, but the callback lets the UI tell
   * the user the font was only partially parsed instead of silently
   * shipping a broken MCM.
   */
  onMalformed?: (code: number) => void;
}

/**
 * Parse an MCM text blob into a map of glyph-code → 24×36 RGB tile.
 * Each analog glyph is upscaled 2× via nearest-neighbor to fit the HD OSD
 * tile size. Used by HD mode when the compositor needs analog art on an
 * HD atlas. Missing glyphs (short files) simply aren't in the returned map.
 */
export function parseMcm(text: string, opts: McmLoadOptions = {}): TileMap {
  const native = parseMcmNative(text, opts);
  const out: TileMap = new Map();
  for (const [code, tile] of native) {
    out.set(code, upscale2x(tile, MCM_GLYPH_SIZE.w, MCM_GLYPH_SIZE.h));
  }
  return out;
}

/**
 * Parse an MCM text blob into a map of glyph-code → 12×18 RGB tile at
 * native analog resolution. Used by analog mode where the tiles stay at
 * their native pixel grid for on-goggle rendering and for MCM re-encoding.
 * Returned tiles have length MCM_GLYPH_SIZE.w * MCM_GLYPH_SIZE.h * 3 = 648.
 */
export function parseMcmNative(text: string, opts: McmLoadOptions = {}): TileMap {
  const glyphRgb = opts.glyphColor ? parseHex(opts.glyphColor) : COLOR_MCM_WHITE;
  const outlineRgb = opts.outlineColor ? parseHex(opts.outlineColor) : COLOR_MCM_BLACK;

  const lines = text.split(/\r?\n/);
  const idx = lines[0]?.trim() === "MAX7456" ? 1 : 0;

  const tiles: TileMap = new Map();
  for (let code = 0; idx + code * 64 < lines.length; code++) {
    const base = idx + code * 64;
    if (base + 54 > lines.length) break;
    let malformedLines = 0;
    const tile = parseGlyphNative(lines, base, glyphRgb, outlineRgb, () => {
      malformedLines++;
    });
    if (tile) {
      tiles.set(code, tile);
      if (malformedLines > 0 && opts.onMalformed) opts.onMalformed(code);
    }
  }
  return tiles;
}

function parseGlyphNative(
  lines: string[],
  base: number,
  glyphRgb: readonly [number, number, number],
  outlineRgb: readonly [number, number, number],
  onMalformedLine: () => void,
): Tile | null {
  // 12×18 analog pixel buffer, 3 bytes per pixel.
  const mcm = new Uint8ClampedArray(MCM_GLYPH_SIZE.w * MCM_GLYPH_SIZE.h * 3);
  fillRgb(mcm, COLOR_TRANSPARENT);

  for (let row = 0; row < MCM_GLYPH_SIZE.h; row++) {
    // 3 lines per row (12 pixels / 4-per-line).
    for (let subLine = 0; subLine < 3; subLine++) {
      const raw = lines[base + row * 3 + subLine];
      if (raw === undefined) return null;
      const line = raw.trim();
      if (line.length < 8) {
        onMalformedLine();
        continue; // malformed line — skip pixels, leave chroma-gray
      }
      for (let i = 0; i < 8; i += 2) {
        const bits = line.slice(i, i + 2);
        const pxX = subLine * 4 + i / 2;
        const pxOffset = (row * MCM_GLYPH_SIZE.w + pxX) * 3;
        if (bits === "00") {
          mcm[pxOffset] = outlineRgb[0];
          mcm[pxOffset + 1] = outlineRgb[1];
          mcm[pxOffset + 2] = outlineRgb[2];
        } else if (bits === "10") {
          mcm[pxOffset] = glyphRgb[0];
          mcm[pxOffset + 1] = glyphRgb[1];
          mcm[pxOffset + 2] = glyphRgb[2];
        }
        // else leave chroma-gray
      }
    }
  }
  return mcm;
}

function fillRgb(buf: Uint8ClampedArray, color: readonly [number, number, number]): void {
  const [r, g, b] = color;
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
}

function upscale2x(src: Uint8ClampedArray, srcW: number, srcH: number): Tile {
  const dst = new Uint8ClampedArray(GLYPH_SIZE.w * GLYPH_SIZE.h * 3);
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const sOff = (y * srcW + x) * 3;
      const r = src[sOff]!;
      const g = src[sOff + 1]!;
      const b = src[sOff + 2]!;
      // Write to 2x2 block in dst.
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const dOff = ((y * 2 + dy) * GLYPH_SIZE.w + (x * 2 + dx)) * 3;
          dst[dOff] = r;
          dst[dOff + 1] = g;
          dst[dOff + 2] = b;
        }
      }
    }
  }
  return dst;
}
