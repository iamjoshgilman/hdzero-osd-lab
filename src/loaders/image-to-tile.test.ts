import { describe, it, expect } from "vitest";
import { imageRgbaToTile } from "./image-to-tile";
import type { RgbaImage } from "@/compositor/types";
import { GLYPH_SIZE } from "@/compositor/constants";

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
});
