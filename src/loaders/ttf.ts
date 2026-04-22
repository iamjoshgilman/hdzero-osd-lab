// TTF rasterizer. Port of fontbuilder.py's load_ttf():
// 1. Render each glyph at size × superSampling using the browser's FontFace.
// 2. Build a chunky outline by stamping the glyph at every pixel offset within
//    a thickness-radius disc.
// 3. Composite the clean AA glyph on top.
// 4. Scale down to 24×36 (× vStretch applied to Y only) with high-quality
//    resampling.
// 5. Return as a TileMap of 24×36 RGB tiles.
//
// REQUIRES the browser Canvas APIs — OffscreenCanvas, FontFace, Canvas 2D.
// Does not run in vitest's jsdom environment without a native canvas polyfill.
// A smoke test below verifies argument validation only.

import { GLYPH_SIZE, COLOR_TRANSPARENT } from "@/compositor/constants";
import type { Tile, TileMap } from "@/compositor/types";
import { resolveColor } from "@/compositor/palette";
import type { HexColor } from "@/state/project";

export interface TtfRasterOptions {
  codes: readonly number[];
  size: number;
  outlineThickness: number;
  vStretch: number;
  glyphOffset: { x: number; y: number };
  outlineOffset: { x: number; y: number };
  glyphColor: HexColor | HexColor[];
  outlineColor: HexColor | HexColor[];
  superSampling: number;
  rng: () => number;
}

let fontFaceCounter = 0;

/**
 * Rasterize a subset of glyph codes from a TTF into 24×36 RGB tiles.
 * Throws if required browser APIs are unavailable.
 */
export async function rasterizeTtfSubset(
  fontBytes: ArrayBuffer,
  opts: TtfRasterOptions,
): Promise<TileMap> {
  validateOptions(opts);

  if (typeof FontFace === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "rasterizeTtfSubset: FontFace/OffscreenCanvas not available in this environment",
    );
  }

  const family = `__hdzoslab_${++fontFaceCounter}_${Date.now()}`;
  const face = new FontFace(family, fontBytes);
  await face.load();

  // `document.fonts` on the main thread; `self.fonts` inside a Worker.
  // Canvas text rendering reads from this set.
  const fontSet =
    typeof document !== "undefined"
      ? document.fonts
      : (self as unknown as { fonts: FontFaceSet }).fonts;
  fontSet.add(face);

  // Some browsers don't propagate a newly-added FontFace to canvas contexts
  // synchronously. Explicitly asking `fonts.load()` for the exact declaration
  // we're about to use forces the wait so `ctx.fillText` actually renders
  // our font (instead of a silent fallback to sans-serif).
  const ss = opts.superSampling;
  const pxSize = opts.size * ss;
  await fontSet.load(`${pxSize}px "${family}"`);

  try {
    const workW = GLYPH_SIZE.w * ss;
    const workH = Math.floor((GLYPH_SIZE.h * ss) / opts.vStretch);
    const out: TileMap = new Map();

    for (const code of opts.codes) {
      const ch = String.fromCharCode(code);
      const glyphRgb = resolveColor(opts.glyphColor, opts.rng);
      const outlineRgb = resolveColor(opts.outlineColor, opts.rng);
      const tile = rasterizeOne(ch, family, workW, workH, opts, glyphRgb, outlineRgb);
      out.set(code, tile);
    }
    return out;
  } finally {
    fontSet.delete(face);
  }
}

function rasterizeOne(
  ch: string,
  family: string,
  workW: number,
  workH: number,
  opts: TtfRasterOptions,
  glyphRgb: readonly [number, number, number],
  outlineRgb: readonly [number, number, number],
): Tile {
  const ss = opts.superSampling;
  const pxSize = opts.size * ss;
  const outlinePx = opts.outlineThickness * ss;
  const outlinePxV = outlinePx / opts.vStretch;

  const canvas = new OffscreenCanvas(workW, workH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rasterizeOne: 2D context unavailable");

  // Outline pass: non-AA (aliased) render at each offset in a thickness disc.
  // pygame achieves this by stamping a non-AA glyph at every integer offset
  // in a bounding box; we do the same but use Canvas text which is AA —
  // close enough visually, and matches the Python tool's intent even if not
  // byte-identical.
  ctx.clearRect(0, 0, workW, workH);
  ctx.font = `${pxSize}px "${family}"`;
  ctx.fillStyle = rgbCss(outlineRgb);
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(ch);
  const centerX =
    workW / 2 + (opts.outlineOffset.x + opts.glyphOffset.x) * ss - metrics.width / 2;
  // Approximate vertical centering using ascent/descent if available.
  const ascent = metrics.actualBoundingBoxAscent ?? pxSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent ?? pxSize * 0.2;
  const baseY =
    workH / 2 +
    ((opts.outlineOffset.y + opts.glyphOffset.y) * ss) / opts.vStretch +
    (ascent - descent) / 2;

  for (let yy = -Math.floor(outlinePxV); yy <= Math.ceil(outlinePxV); yy++) {
    for (let xx = -Math.floor(outlinePx); xx <= Math.ceil(outlinePx); xx++) {
      ctx.fillText(ch, centerX + xx, baseY + yy);
    }
  }

  // Glyph pass: single AA render centered (no outline offsets).
  ctx.fillStyle = rgbCss(glyphRgb);
  const glyphCx = workW / 2 + opts.glyphOffset.x * ss - metrics.width / 2;
  const glyphCy = workH / 2 + (opts.glyphOffset.y * ss) / opts.vStretch + (ascent - descent) / 2;
  ctx.fillText(ch, glyphCx, glyphCy);

  // Downscale to 24×36. The vertical stretch scales Y back up via the target H.
  const finalCanvas = new OffscreenCanvas(GLYPH_SIZE.w, GLYPH_SIZE.h);
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("rasterizeOne: final 2D context unavailable");
  finalCtx.fillStyle = rgbCss(COLOR_TRANSPARENT);
  finalCtx.fillRect(0, 0, GLYPH_SIZE.w, GLYPH_SIZE.h);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = "high";
  finalCtx.drawImage(canvas, 0, 0, GLYPH_SIZE.w, GLYPH_SIZE.h);

  // Extract RGB from RGBA image data.
  const img = finalCtx.getImageData(0, 0, GLYPH_SIZE.w, GLYPH_SIZE.h);
  return rgbaToRgb(img.data);
}

function rgbaToRgb(rgba: Uint8ClampedArray): Tile {
  const out = new Uint8ClampedArray(GLYPH_SIZE.w * GLYPH_SIZE.h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i]!;
    out[j + 1] = rgba[i + 1]!;
    out[j + 2] = rgba[i + 2]!;
  }
  return out;
}

function rgbCss([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r},${g},${b})`;
}

function validateOptions(opts: TtfRasterOptions): void {
  if (opts.size <= 0) throw new Error(`rasterizeTtfSubset: size must be > 0 (got ${opts.size})`);
  if (opts.outlineThickness < 0) {
    throw new Error(`rasterizeTtfSubset: outlineThickness must be ≥ 0`);
  }
  if (opts.vStretch <= 0) {
    throw new Error(`rasterizeTtfSubset: vStretch must be > 0 (got ${opts.vStretch})`);
  }
  if (!Number.isInteger(opts.superSampling) || opts.superSampling < 1) {
    throw new Error("rasterizeTtfSubset: superSampling must be a positive integer");
  }
  if (opts.codes.length === 0) {
    throw new Error("rasterizeTtfSubset: codes must not be empty");
  }
}

export { validateOptions as _validateOptionsForTests };
