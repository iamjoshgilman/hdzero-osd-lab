import { describe, it, expect } from "vitest";
import { writeBmp24 } from "./bmp";
import { FONT_SIZE } from "@/compositor/constants";

describe("writeBmp24", () => {
  it("writes a minimal 2×2 BMP with the correct header and BGR pixels", () => {
    // 2×2 red/green/blue/white in RGB row-major order.
    const rgb = new Uint8ClampedArray([
      255, 0, 0,   0, 255, 0,   // row 0: red, green
      0, 0, 255,   255, 255, 255, // row 1: blue, white
    ]);
    const bmp = writeBmp24({ width: 2, height: 2, data: rgb });
    // 14 + 40 + 2 rows × (2×3 bytes padded to 4-byte alignment = 8 bytes) = 70.
    expect(bmp.length).toBe(70);
    // Signature 'BM'
    expect(bmp[0]).toBe(0x42);
    expect(bmp[1]).toBe(0x4d);
    // File size LE
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    expect(view.getUint32(2, true)).toBe(70);
    expect(view.getUint32(10, true)).toBe(54); // pixel data offset
    // DIB header
    expect(view.getUint32(14, true)).toBe(40);
    expect(view.getInt32(18, true)).toBe(2); // width
    expect(view.getInt32(22, true)).toBe(2); // height
    expect(view.getUint16(26, true)).toBe(1); // planes
    expect(view.getUint16(28, true)).toBe(24); // bitcount
    expect(view.getUint32(30, true)).toBe(0); // BI_RGB

    // Pixel data — bottom row first, BGR order.
    // Bottom row (y=1 of source): blue, white
    expect([bmp[54], bmp[55], bmp[56]]).toEqual([255, 0, 0]); // blue as BGR
    expect([bmp[57], bmp[58], bmp[59]]).toEqual([255, 255, 255]); // white BGR
    // 2 bytes of row padding
    expect([bmp[60], bmp[61]]).toEqual([0, 0]);

    // Top row (y=0 of source): red, green
    expect([bmp[62], bmp[63], bmp[64]]).toEqual([0, 0, 255]); // red BGR
    expect([bmp[65], bmp[66], bmp[67]]).toEqual([0, 255, 0]); // green BGR
    expect([bmp[68], bmp[69]]).toEqual([0, 0]);
  });

  it("produces exactly 1,327,158 bytes for a 384×1152 atlas", () => {
    const data = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    data.fill(127); // chroma-gray
    const bmp = writeBmp24({ width: FONT_SIZE.w, height: FONT_SIZE.h, data });
    expect(bmp.length).toBe(1_327_158);
  });

  it("384-wide row needs no padding (1152 = multiple of 4)", () => {
    const data = new Uint8ClampedArray(384 * 1 * 3);
    const bmp = writeBmp24({ width: 384, height: 1, data });
    // 14 + 40 + 384×3 = 1206 (384*3 = 1152 which is already aligned)
    expect(bmp.length).toBe(14 + 40 + 1152);
  });

  it("throws on size/data mismatch", () => {
    expect(() =>
      writeBmp24({ width: 4, height: 4, data: new Uint8ClampedArray(10) }),
    ).toThrow(/data length/);
  });

  it("throws on non-positive dimensions", () => {
    expect(() =>
      writeBmp24({ width: 0, height: 10, data: new Uint8ClampedArray(0) }),
    ).toThrow(/invalid dimensions/);
  });
});
