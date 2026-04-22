import { describe, it, expect } from "vitest";
import {
  createAtlas,
  createTile,
  fillRgb,
  blitTile,
  extractTile,
  blitRgbaRegionIntoAtlas,
  tintTileInPlace,
  TILE_BYTES,
  ATLAS_BYTES,
} from "./atlas";
import { codeToOrigin, FONT_SIZE } from "./constants";

describe("TILE_BYTES / ATLAS_BYTES", () => {
  it("tile is 24×36×3 = 2592 bytes", () => {
    expect(TILE_BYTES).toBe(2592);
  });
  it("atlas is 384×1152×3 = 1,327,104 bytes", () => {
    expect(ATLAS_BYTES).toBe(1_327_104);
  });
});

describe("createAtlas + fillRgb", () => {
  it("default fill is chroma-gray (127,127,127)", () => {
    const a = createAtlas();
    expect(a.length).toBe(ATLAS_BYTES);
    expect(a[0]).toBe(127);
    expect(a[1]).toBe(127);
    expect(a[2]).toBe(127);
    expect(a[ATLAS_BYTES - 1]).toBe(127);
  });
  it("custom fill applies everywhere", () => {
    const a = createAtlas([10, 20, 30]);
    expect(a[0]).toBe(10);
    expect(a[1]).toBe(20);
    expect(a[2]).toBe(30);
    expect(a[ATLAS_BYTES - 3]).toBe(10);
  });
});

describe("blitTile", () => {
  it("writes a tile to the correct atlas offset for code 0", () => {
    const atlas = createAtlas([0, 0, 0]);
    const tile = createTile([255, 0, 0]);
    blitTile(atlas, tile, 0);
    expect(atlas[0]).toBe(255);
    expect(atlas[1]).toBe(0);
    expect(atlas[2]).toBe(0);
    // Pixel just past the tile width should still be untouched (0,0,0)
    expect(atlas[24 * 3]).toBe(0);
  });

  it("writes a tile to the correct offset for code 152 (col 8, row 9)", () => {
    const atlas = createAtlas([0, 0, 0]);
    const tile = createTile([10, 20, 30]);
    blitTile(atlas, tile, 152);
    const { x, y } = codeToOrigin(152);
    const stride = FONT_SIZE.w * 3;
    const topLeft = y * stride + x * 3;
    expect(atlas[topLeft]).toBe(10);
    expect(atlas[topLeft + 1]).toBe(20);
    expect(atlas[topLeft + 2]).toBe(30);
  });

  it("ignores out-of-range codes", () => {
    const atlas = createAtlas([5, 5, 5]);
    const tile = createTile([9, 9, 9]);
    blitTile(atlas, tile, -1);
    blitTile(atlas, tile, 999);
    expect(atlas[0]).toBe(5);
    expect(atlas[ATLAS_BYTES - 1]).toBe(5);
  });

  it("tile round-trips through blit + extract", () => {
    const atlas = createAtlas([0, 0, 0]);
    const src = createTile([0, 0, 0]);
    // Paint a gradient in the tile
    for (let i = 0; i < TILE_BYTES; i++) src[i] = i & 0xff;
    blitTile(atlas, src, 42);
    const got = extractTile(atlas, 42);
    expect(got).toEqual(src);
  });
});

describe("tintTileInPlace", () => {
  it("multiplies a white tile by red → red tile", () => {
    const atlas = createAtlas([0, 0, 0]);
    const white = createTile([255, 255, 255]);
    blitTile(atlas, white, 0);
    tintTileInPlace(atlas, 0, [255, 0, 0]);
    const out = extractTile(atlas, 0);
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]);
  });

  it("leaves chroma-gray pixels alone so transparency survives", () => {
    const atlas = createAtlas([127, 127, 127]);
    const tile = createTile([127, 127, 127]);
    // One non-chroma pixel in the corner.
    tile[0] = 255;
    tile[1] = 255;
    tile[2] = 255;
    blitTile(atlas, tile, 0);
    tintTileInPlace(atlas, 0, [0, 255, 0]);
    const out = extractTile(atlas, 0);
    expect([out[0], out[1], out[2]]).toEqual([0, 255, 0]);
    // chroma-gray at a non-corner position: untouched
    expect([out[3], out[4], out[5]]).toEqual([127, 127, 127]);
  });

  it("multiplies preserves outline darkness — black stays black under any tint", () => {
    const atlas = createAtlas([0, 0, 0]);
    const out = extractTile(atlas, 5);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    tintTileInPlace(atlas, 5, [255, 0, 0]);
    const after = extractTile(atlas, 5);
    expect([after[0], after[1], after[2]]).toEqual([0, 0, 0]);
  });

  it("mid-gray fill becomes a darker variant of the target", () => {
    const atlas = createAtlas([0, 0, 0]);
    const tile = createTile([128, 128, 128]);
    blitTile(atlas, tile, 10);
    tintTileInPlace(atlas, 10, [255, 0, 0]);
    const out = extractTile(atlas, 10);
    // 128 * 255 / 256 = 127.5 ≈ 127 (shifted down 1 due to >>>8 vs /255)
    expect(out[0]).toBeGreaterThanOrEqual(126);
    expect(out[0]).toBeLessThanOrEqual(128);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it("out-of-range codes are ignored", () => {
    const atlas = createAtlas([200, 200, 200]);
    tintTileInPlace(atlas, -1, [255, 0, 0]);
    tintTileInPlace(atlas, 9999, [255, 0, 0]);
    expect(atlas[0]).toBe(200);
  });
});

describe("blitRgbaRegionIntoAtlas", () => {
  it("opaque pixels replace the atlas", () => {
    const atlas = createAtlas([127, 127, 127]);
    // 2×2 pure red with full alpha
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    blitRgbaRegionIntoAtlas(
      atlas,
      rgba,
      2,
      { sx: 0, sy: 0, sw: 2, sh: 2 },
      { x: 10, y: 10 },
    );
    const stride = FONT_SIZE.w * 3;
    expect(atlas[10 * stride + 10 * 3]).toBe(255);
    expect(atlas[10 * stride + 10 * 3 + 1]).toBe(0);
    expect(atlas[10 * stride + 10 * 3 + 2]).toBe(0);
  });

  it("transparent pixels leave the atlas unchanged", () => {
    const atlas = createAtlas([50, 60, 70]);
    const rgba = new Uint8ClampedArray([255, 0, 0, 0]); // 1×1 fully transparent red
    blitRgbaRegionIntoAtlas(
      atlas,
      rgba,
      1,
      { sx: 0, sy: 0, sw: 1, sh: 1 },
      { x: 5, y: 5 },
    );
    const stride = FONT_SIZE.w * 3;
    expect([atlas[5 * stride + 15], atlas[5 * stride + 16], atlas[5 * stride + 17]]).toEqual([
      50, 60, 70,
    ]);
  });

  it("half-alpha pixels blend 50/50", () => {
    const atlas = createAtlas([0, 0, 0]);
    const rgba = new Uint8ClampedArray([200, 200, 200, 128]); // ~50% alpha white-ish
    blitRgbaRegionIntoAtlas(
      atlas,
      rgba,
      1,
      { sx: 0, sy: 0, sw: 1, sh: 1 },
      { x: 0, y: 0 },
    );
    // blend: 200 * 128/255 ≈ 100
    expect(atlas[0]).toBeGreaterThanOrEqual(95);
    expect(atlas[0]).toBeLessThanOrEqual(105);
  });
});
