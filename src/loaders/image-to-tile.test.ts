import { describe, it, expect } from "vitest";
import { imageRgbaToTile } from "./image-to-tile";
import type { RgbaImage } from "@/compositor/types";
import { GLYPH_SIZE, ANALOG_GLYPH_SIZE } from "@/compositor/constants";

function solidRgba(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

describe("imageRgbaToTile", () => {
  it("outputs a 24×36×3 RGB buffer", () => {
    const src = solidRgba(10, 10, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src);
    expect(tile.length).toBe(GLYPH_SIZE.w * GLYPH_SIZE.h * 3);
  });

  it("square input: aspect-preserved scale, centered horizontally with chroma-gray bars", () => {
    const src = solidRgba(100, 100, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src);
    // scale = min(24/100, 36/100) = 24/100 → 24 × 24 red block centered vertically.
    // Top row (y=0) is outside scaled box (offY = (36-24)/2 = 6) → chroma-gray.
    expect([tile[0], tile[1], tile[2]]).toEqual([127, 127, 127]);
    // Middle row (y=18): should be red all the way across.
    const midRowOffset = 18 * GLYPH_SIZE.w * 3 + 0;
    expect([tile[midRowOffset], tile[midRowOffset + 1], tile[midRowOffset + 2]]).toEqual([255, 0, 0]);
  });

  it("fully transparent pixels do not paint over the chroma-gray background", () => {
    const src = solidRgba(24, 36, [200, 0, 0, 0]);
    const tile = imageRgbaToTile(src);
    for (let i = 0; i < tile.length; i += 3) {
      expect([tile[i], tile[i + 1], tile[i + 2]]).toEqual([127, 127, 127]);
    }
  });

  it("half-alpha pixels blend with the chroma-gray background", () => {
    const src = solidRgba(24, 36, [255, 255, 255, 128]);
    const tile = imageRgbaToTile(src);
    // 255 * (128/255) + 127 * (127/255) ≈ 128 + 63.5 = ~191
    expect(tile[0]).toBeGreaterThanOrEqual(185);
    expect(tile[0]).toBeLessThanOrEqual(195);
  });

  it("tintColor recolors opaque pixels while leaving alpha behavior intact", () => {
    const src = solidRgba(24, 36, [200, 200, 200, 255]);
    const tile = imageRgbaToTile(src, { tintColor: "#ff00ff" });
    expect([tile[0], tile[1], tile[2]]).toEqual([255, 0, 255]);
  });

  it("wide input (4:1 banner) fits to width and leaves top/bottom bars", () => {
    const src = solidRgba(96, 24, [0, 255, 0, 255]);
    const tile = imageRgbaToTile(src);
    // scale = min(24/96, 36/24) = 0.25 → 24 × 6 green band centered vertically.
    // Middle of the band (y=16) should be green.
    const mid = 16 * GLYPH_SIZE.w * 3;
    expect([tile[mid], tile[mid + 1], tile[mid + 2]]).toEqual([0, 255, 0]);
    // Top row is outside band.
    expect([tile[0], tile[1], tile[2]]).toEqual([127, 127, 127]);
  });

  it("targetSize=ANALOG produces a 12×18×3 tile (648 bytes)", () => {
    const src = solidRgba(10, 10, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src, { targetSize: ANALOG_GLYPH_SIZE });
    expect(tile.length).toBe(ANALOG_GLYPH_SIZE.w * ANALOG_GLYPH_SIZE.h * 3);
    expect(tile.length).toBe(648);
  });

  it("analog target keeps aspect-fit + chroma-gray bars", () => {
    // 24×24 source, target 12×18 → scale = min(12/24, 18/24) = 0.5 →
    // scaled output is 12×12 centered vertically inside 12×18.
    const src = solidRgba(24, 24, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src, { targetSize: ANALOG_GLYPH_SIZE });
    // offY = (18-12)/2 = 3. Top row (y=0) = chroma-gray.
    expect([tile[0], tile[1], tile[2]]).toEqual([127, 127, 127]);
    // Middle row (y=9) should be red.
    const mid = 9 * ANALOG_GLYPH_SIZE.w * 3;
    expect([tile[mid], tile[mid + 1], tile[mid + 2]]).toEqual([255, 0, 0]);
  });

  it("scale=1 matches the no-scale default (baseline invariant)", () => {
    const src = solidRgba(100, 100, [12, 34, 56, 255]);
    const baseline = imageRgbaToTile(src);
    const explicit = imageRgbaToTile(src, { scale: 1.0 });
    expect(explicit).toEqual(baseline);
  });

  it("scale > 1 enlarges the content past aspect-fit and clips at tile edges", () => {
    // 100×100 → aspect-fit scale = 0.24 → 24×24 centered in 24×36 tile
    // (offY=6, so rows 6..29 are red, rows 0..5 and 30..35 are chroma-gray).
    // With scale=2, the scaled box is 48×48 centered (offX=-12, offY=-6);
    // every in-tile pixel lands inside the red block → no chroma-gray bars.
    const src = solidRgba(100, 100, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src, { scale: 2.0 });
    // Top-left pixel used to be chroma-gray under the default; now it's red.
    expect([tile[0], tile[1], tile[2]]).toEqual([255, 0, 0]);
    // Bottom-right pixel likewise.
    const lastPixelOffset = (GLYPH_SIZE.w * GLYPH_SIZE.h - 1) * 3;
    expect([
      tile[lastPixelOffset],
      tile[lastPixelOffset + 1],
      tile[lastPixelOffset + 2],
    ]).toEqual([255, 0, 0]);
  });

  it("scale < 1 produces extra chroma-gray padding around a square input", () => {
    // 100×100 → fit=0.24 → 24×24 red. With scale=0.5, effective=0.12 → 12×12
    // red block centered (offX=6, offY=12). Corners and far edges stay gray.
    const src = solidRgba(100, 100, [255, 0, 0, 255]);
    const tile = imageRgbaToTile(src, { scale: 0.5 });
    // Corner: gray
    expect([tile[0], tile[1], tile[2]]).toEqual([127, 127, 127]);
    // Center: should be red
    const cx = Math.floor(GLYPH_SIZE.w / 2);
    const cy = Math.floor(GLYPH_SIZE.h / 2);
    const centerOffset = (cy * GLYPH_SIZE.w + cx) * 3;
    expect([
      tile[centerOffset],
      tile[centerOffset + 1],
      tile[centerOffset + 2],
    ]).toEqual([255, 0, 0]);
    // Right-edge middle row: should still be gray (scaled block is narrower).
    const rightOffset = (cy * GLYPH_SIZE.w + (GLYPH_SIZE.w - 1)) * 3;
    expect([
      tile[rightOffset],
      tile[rightOffset + 1],
      tile[rightOffset + 2],
    ]).toEqual([127, 127, 127]);
  });

  it("scale of zero / negative is treated as 1.0 (defensive fallback)", () => {
    // UI clamps the slider to > 0, but imageRgbaToTile is also called from
    // headless test harnesses and the cache layer — guard against pathological
    // inputs rather than outputting an empty tile.
    const src = solidRgba(100, 100, [12, 34, 56, 255]);
    const baseline = imageRgbaToTile(src);
    expect(imageRgbaToTile(src, { scale: 0 })).toEqual(baseline);
    expect(imageRgbaToTile(src, { scale: -1 })).toEqual(baseline);
  });
});
