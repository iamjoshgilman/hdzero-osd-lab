// Low-level buffer ops over an RGB atlas. All operations are pure byte math;
// no DOM, no Canvas. Kept split from compose.ts so they can be unit-tested
// independently and reused by loaders when extracting tiles.

import { GLYPH_SIZE, FONT_GRID, FONT_SIZE, codeToOrigin } from "./constants";
import type { Rgb } from "./palette";
import type { Tile } from "./types";

/** Number of bytes in a single 24×36 RGB tile. */
export const TILE_BYTES = GLYPH_SIZE.w * GLYPH_SIZE.h * 3;

/** Number of bytes in a full 384×1152 RGB atlas. */
export const ATLAS_BYTES = FONT_SIZE.w * FONT_SIZE.h * 3;

/** Allocate an atlas-sized RGB buffer filled with the chroma-key gray. */
export function createAtlas(fill: Rgb = [127, 127, 127]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(ATLAS_BYTES);
  fillRgb(buf, fill);
  return buf;
}

/** Fill every pixel of an RGB buffer with a single color. */
export function fillRgb(buf: Uint8ClampedArray, color: Rgb): void {
  const [r, g, b] = color;
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
}

/** Allocate a single 24×36 RGB tile filled with the chroma-key gray. */
export function createTile(fill: Rgb = [127, 127, 127]): Tile {
  const t = new Uint8ClampedArray(TILE_BYTES);
  fillRgb(t, fill);
  return t;
}

/**
 * Multiplicative tint applied in place to an atlas tile.
 * Chroma-gray (transparency) pixels are left alone so OSD compositing still
 * sees-through correctly. Every other pixel gets each channel multiplied by
 * the target color / 255 — so white glyph fill → target color, black
 * outline stays black, mid-gray becomes a darker variant of the target.
 */
export function tintTileInPlace(
  atlas: Uint8ClampedArray,
  code: number,
  tint: Rgb,
): void {
  if (code < 0 || code >= FONT_GRID.cols * FONT_GRID.rows) return;
  const { x, y } = codeToOrigin(code);
  const stride = FONT_SIZE.w * 3;
  const [tr, tg, tb] = tint;
  for (let row = 0; row < GLYPH_SIZE.h; row++) {
    let off = (y + row) * stride + x * 3;
    for (let col = 0; col < GLYPH_SIZE.w; col++) {
      const r = atlas[off]!;
      const g = atlas[off + 1]!;
      const b = atlas[off + 2]!;
      // Skip the chroma-key pixels — those map to transparent on the goggle.
      if (!(r === 127 && g === 127 && b === 127)) {
        // Integer round-divide by 255 via the classic (x * 257 + 0x8080) >>> 16
        // trick — so 255 × 255 = 255, not the off-by-one 254 you'd get from >>> 8.
        atlas[off] = (r * tr * 257 + 0x8080) >>> 16;
        atlas[off + 1] = (g * tg * 257 + 0x8080) >>> 16;
        atlas[off + 2] = (b * tb * 257 + 0x8080) >>> 16;
      }
      off += 3;
    }
  }
}

/**
 * Blit a 24×36 tile into the atlas at the given glyph code.
 * Out-of-range codes are silently ignored (compose uses this for -32
 * lowercase offsets where lowletters past 'z' would underflow past code 65).
 */
export function blitTile(atlas: Uint8ClampedArray, tile: Tile, code: number): void {
  if (code < 0 || code >= FONT_GRID.cols * FONT_GRID.rows) return;
  const { x, y } = codeToOrigin(code);
  const atlasStride = FONT_SIZE.w * 3;
  const tileStride = GLYPH_SIZE.w * 3;
  for (let row = 0; row < GLYPH_SIZE.h; row++) {
    const dst = (y + row) * atlasStride + x * 3;
    const src = row * tileStride;
    // Fast path: copy full row in one go.
    atlas.set(tile.subarray(src, src + tileStride), dst);
  }
}

/**
 * Extract a 24×36 tile from a source atlas at a given glyph code.
 * Returns a newly-allocated tile buffer (caller owns it).
 */
export function extractTile(atlas: Uint8ClampedArray, code: number): Tile {
  const tile = new Uint8ClampedArray(TILE_BYTES);
  const { x, y } = codeToOrigin(code);
  const atlasStride = FONT_SIZE.w * 3;
  const tileStride = GLYPH_SIZE.w * 3;
  for (let row = 0; row < GLYPH_SIZE.h; row++) {
    const src = (y + row) * atlasStride + x * 3;
    const dst = row * tileStride;
    tile.set(atlas.subarray(src, src + tileStride), dst);
  }
  return tile;
}

/**
 * Reverse of the BTFL logo Z-wrap in compose.ts: reassemble the 576×144
 * BETAFLIGHT banner from its 8 scattered strips across atlas rows 10..15.
 * This is how the banner appears in-flight when Betaflight unwraps the tiles.
 *
 * Returns a fresh 576×144 RGB buffer (no alpha — use the same chroma-key
 * semantics as the source atlas).
 */
export function extractBtflLogoBanner(atlas: Uint8ClampedArray): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const bw = 576;
  const bh = 144;
  const out = new Uint8ClampedArray(bw * bh * 3);
  const atlasStride = FONT_SIZE.w * 3; // 1152
  const bannerStride = bw * 3; // 1728

  // Mirror image of the rect list in compose.ts applyLogoLayer (btfl slot).
  // Each entry: copy from atlas[(dx,dy)..(dx+sw,dy+sh)] → banner[(sx,sy)..(sx+sw,sy+sh)].
  const rects: Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> = [
    { sx: 0, sy: 0, sw: 384, sh: 36, dx: 0, dy: 360 },
    { sx: 384, sy: 0, sw: 192, sh: 36, dx: 0, dy: 396 },
    { sx: 0, sy: 36, sw: 192, sh: 36, dx: 192, dy: 396 },
    { sx: 192, sy: 36, sw: 384, sh: 36, dx: 0, dy: 432 },
    { sx: 0, sy: 72, sw: 384, sh: 36, dx: 0, dy: 468 },
    { sx: 384, sy: 72, sw: 192, sh: 36, dx: 0, dy: 504 },
    { sx: 0, sy: 108, sw: 192, sh: 36, dx: 192, dy: 504 },
    { sx: 192, sy: 108, sw: 384, sh: 36, dx: 0, dy: 540 },
  ];

  for (const r of rects) {
    for (let row = 0; row < r.sh; row++) {
      const srcOff = (r.dy + row) * atlasStride + r.dx * 3;
      const dstOff = (r.sy + row) * bannerStride + r.sx * 3;
      out.set(atlas.subarray(srcOff, srcOff + r.sw * 3), dstOff);
    }
  }
  return { width: bw, height: bh, data: out };
}

/**
 * Blit an arbitrarily-sized RGBA strip into a rectangular region of the atlas.
 * Transparent pixels (alpha 0) are skipped; partially-transparent pixels are
 * alpha-composited onto the atlas. Used by logo placement.
 *
 * @param atlas  Destination RGB atlas (FONT_SIZE).
 * @param rgba   Source RGBA image data (row-major, RGBA bytes).
 * @param srcW   Source width in pixels.
 * @param srcH   Source height in pixels.
 * @param srcRect  {sx, sy, sw, sh} slice of the source to copy (pre-clamped).
 * @param dstXY  {x, y} destination top-left in the atlas.
 */
export function blitRgbaRegionIntoAtlas(
  atlas: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
  srcW: number,
  srcRect: { sx: number; sy: number; sw: number; sh: number },
  dstXY: { x: number; y: number },
): void {
  const { sx, sy, sw, sh } = srcRect;
  const { x: dx, y: dy } = dstXY;
  const atlasStride = FONT_SIZE.w * 3;
  const srcStride = srcW * 4;
  for (let row = 0; row < sh; row++) {
    const srcRow = (sy + row) * srcStride + sx * 4;
    const dstRow = (dy + row) * atlasStride + dx * 3;
    for (let col = 0; col < sw; col++) {
      const sOff = srcRow + col * 4;
      const dOff = dstRow + col * 3;
      const a = rgba[sOff + 3]!;
      if (a === 0) continue;
      if (a === 255) {
        atlas[dOff] = rgba[sOff]!;
        atlas[dOff + 1] = rgba[sOff + 1]!;
        atlas[dOff + 2] = rgba[sOff + 2]!;
      } else {
        // alpha blend: out = src*a + dst*(1-a), a normalized to [0,1].
        const af = a / 255;
        const inv = 1 - af;
        atlas[dOff] = (rgba[sOff]! * af + atlas[dOff]! * inv) | 0;
        atlas[dOff + 1] = (rgba[sOff + 1]! * af + atlas[dOff + 1]! * inv) | 0;
        atlas[dOff + 2] = (rgba[sOff + 2]! * af + atlas[dOff + 2]! * inv) | 0;
      }
    }
  }
}
