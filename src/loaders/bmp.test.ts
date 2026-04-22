import { describe, it, expect } from "vitest";
import { decodeBmp, normalizeHdOsdFont } from "./bmp";
import { writeBmp24 } from "@/encoders/bmp";
import { FONT_SIZE, GLYPH_SIZE, FONT_GRID } from "@/compositor/constants";

describe("decodeBmp", () => {
  it("round-trips a 2×2 via write then read", () => {
    const rgb = new Uint8ClampedArray([
      255, 0, 0,   0, 255, 0,
      0, 0, 255,   255, 255, 255,
    ]);
    const bmp = writeBmp24({ width: 2, height: 2, data: rgb });
    const decoded = decodeBmp(bmp);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.data)).toEqual(Array.from(rgb));
  });

  it("round-trips a 384×1152 atlas", () => {
    const src = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    for (let i = 0; i < src.length; i++) src[i] = i & 0xff;
    const bmp = writeBmp24({ width: FONT_SIZE.w, height: FONT_SIZE.h, data: src });
    const decoded = decodeBmp(bmp);
    expect(decoded.width).toBe(FONT_SIZE.w);
    expect(decoded.height).toBe(FONT_SIZE.h);
    // Direct memory equality
    expect(decoded.data.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) {
      if (decoded.data[i] !== src[i]) {
        throw new Error(`mismatch at byte ${i}: ${decoded.data[i]} vs ${src[i]}`);
      }
    }
  });

  it("handles top-down BMPs (negative height) by producing top-down output", () => {
    // Craft a top-down 2×1 BMP manually.
    const buf = new Uint8Array(14 + 40 + 8);
    buf[0] = 0x42;
    buf[1] = 0x4d;
    const v = new DataView(buf.buffer);
    v.setUint32(2, buf.length, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, 2, true);
    v.setInt32(22, -1, true); // negative = top-down
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    v.setUint32(30, 0, true);
    // Pixel row: two pixels BGR then 2 bytes padding (stride = 8).
    buf[54] = 10; buf[55] = 20; buf[56] = 30; // BGR
    buf[57] = 40; buf[58] = 50; buf[59] = 60;
    buf[60] = 0; buf[61] = 0;
    const decoded = decodeBmp(buf);
    // Top-down means the first row on disk IS row 0 of output.
    // Pixel 0 in RGB = [30, 20, 10], pixel 1 = [60, 50, 40].
    expect(Array.from(decoded.data)).toEqual([30, 20, 10, 60, 50, 40]);
  });

  it("rejects non-BMP input", () => {
    // Start with PNG magic but pad past the size check so the signature branch fires.
    const notBmp = new Uint8Array(60);
    notBmp[0] = 0x89;
    notBmp[1] = 0x50;
    notBmp[2] = 0x4e;
    notBmp[3] = 0x47;
    expect(() => decodeBmp(notBmp)).toThrow(/not a BMP/);
  });

  it("rejects unsupported bit depths", () => {
    const buf = new Uint8Array(14 + 40);
    buf[0] = 0x42;
    buf[1] = 0x4d;
    const v = new DataView(buf.buffer);
    v.setUint32(14, 40, true);
    v.setInt32(18, 1, true);
    v.setInt32(22, 1, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 8, true); // 8-bit palette — not supported
    v.setUint32(30, 0, true);
    expect(() => decodeBmp(buf)).toThrow(/24-bit/);
  });

  it("normalizeHdOsdFont passes compact 384×1152 through unchanged", () => {
    const data = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
    const img = { width: FONT_SIZE.w, height: FONT_SIZE.h, data };
    const normalized = normalizeHdOsdFont(img);
    expect(normalized).toBe(img);
  });

  it("normalizeHdOsdFont implodes a 486×1350 exploded bitmap", () => {
    // Build an exploded canvas where every tile's top-left pixel is a unique
    // color tagged by (col, row). Gaps filled with 255,255,255 to prove they
    // get stripped.
    const EXPLODED_W = 486;
    const EXPLODED_H = 1350;
    const data = new Uint8ClampedArray(EXPLODED_W * EXPLODED_H * 3);
    data.fill(255); // white gap pixels everywhere by default
    for (let row = 0; row < FONT_GRID.rows; row++) {
      for (let col = 0; col < FONT_GRID.cols; col++) {
        const sx = col * (GLYPH_SIZE.w + 6) + 6;
        const sy = row * (GLYPH_SIZE.h + 6) + 6;
        // Fill the 24×36 tile with a solid color unique to (col, row).
        const r = col * 16;
        const g = row * 8;
        const b = (col + row) & 0xff;
        for (let y = 0; y < GLYPH_SIZE.h; y++) {
          for (let x = 0; x < GLYPH_SIZE.w; x++) {
            const off = ((sy + y) * EXPLODED_W + (sx + x)) * 3;
            data[off] = r;
            data[off + 1] = g;
            data[off + 2] = b;
          }
        }
      }
    }
    const result = normalizeHdOsdFont({ width: EXPLODED_W, height: EXPLODED_H, data });
    expect(result.width).toBe(FONT_SIZE.w);
    expect(result.height).toBe(FONT_SIZE.h);
    // Sample a few tiles and confirm the expected solid color came through
    // (and the gap pixels got dropped).
    const stride = FONT_SIZE.w * 3;
    for (const [col, row] of [
      [0, 0],
      [5, 10],
      [15, 31],
    ] as const) {
      const topLeft = row * GLYPH_SIZE.h * stride + col * GLYPH_SIZE.w * 3;
      expect(result.data[topLeft]).toBe(col * 16);
      expect(result.data[topLeft + 1]).toBe(row * 8);
      expect(result.data[topLeft + 2]).toBe((col + row) & 0xff);
    }
  });

  it("normalizeHdOsdFont rejects other dimensions", () => {
    const bad = {
      width: 500,
      height: 500,
      data: new Uint8ClampedArray(500 * 500 * 3),
    };
    expect(() => normalizeHdOsdFont(bad)).toThrow(/384×1152|486×1350/);
  });

  it("rejects truncated pixel data", () => {
    const src = new Uint8ClampedArray(10 * 10 * 3);
    const bmp = writeBmp24({ width: 10, height: 10, data: src });
    // Chop off the last 50 bytes — pixels won't fit.
    const truncated = bmp.slice(0, bmp.length - 50);
    expect(() => decodeBmp(truncated)).toThrow(/truncated/);
  });
});
