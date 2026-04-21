// 24-bit BMP v3 decoder — inverse of encoders/bmp.ts. Accepts the subset of
// BMP files this app needs to read: uncompressed (BI_RGB) 24-bit BMPs, which
// covers every community HDZero OSD font published on github.com/hd-zero
// and every file pygame emits.
//
// Returns an RgbImage with top-to-bottom row order and R,G,B byte order,
// regardless of whether the source was bottom-up or top-down on disk.

import type { RgbImage } from "@/compositor/types";

/** Decode a 24-bit BI_RGB BMP into a top-down RGB image. */
export function decodeBmp(bytes: ArrayBuffer | Uint8Array): RgbImage {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length < 54) throw new Error(`decodeBmp: file too small (${buf.length} bytes)`);
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) {
    throw new Error("decodeBmp: not a BMP file (missing 'BM' signature)");
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  if (dibSize < 12) throw new Error(`decodeBmp: unexpected DIB header size ${dibSize}`);

  // v3 BITMAPINFOHEADER and compatible v4/v5 all start with the same 40-byte
  // prefix we care about.
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitCount = view.getUint16(28, true);
  const compression = view.getUint32(30, true);

  if (planes !== 1) throw new Error(`decodeBmp: unexpected planes=${planes}`);
  if (bitCount !== 24) {
    throw new Error(`decodeBmp: only 24-bit BMPs supported (got ${bitCount}-bit)`);
  }
  if (compression !== 0 && compression !== 3) {
    // BI_RGB=0 always ok. BI_BITFIELDS=3 with the default masks happens to
    // look identical for 24-bit, but we don't support it formally.
    throw new Error(`decodeBmp: only BI_RGB compression supported (got ${compression})`);
  }
  if (width <= 0) throw new Error(`decodeBmp: invalid width ${width}`);

  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (height === 0) throw new Error("decodeBmp: zero-height image");

  const stride = Math.ceil((width * 3) / 4) * 4;
  const pixelEnd = pixelOffset + stride * height;
  if (pixelEnd > buf.length) {
    throw new Error(
      `decodeBmp: pixel data truncated (needs ${pixelEnd} bytes, have ${buf.length})`,
    );
  }

  const out = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y; // always produce top-down output
    const srcRow = pixelOffset + srcY * stride;
    const dstRow = y * width * 3;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 3;
      out[dstRow + x * 3 + 0] = buf[s + 2]!; // R (BMP stores BGR)
      out[dstRow + x * 3 + 1] = buf[s + 1]!; // G
      out[dstRow + x * 3 + 2] = buf[s + 0]!; // B
    }
  }

  return { width, height, data: out };
}
