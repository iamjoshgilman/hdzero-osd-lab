// 24-bit BMP v3 decoder — inverse of encoders/bmp.ts. Accepts the subset of
// BMP files this app needs to read: uncompressed (BI_RGB) 24-bit BMPs, which
// covers every community HDZero OSD font published on github.com/hd-zero
// and every file pygame emits.
//
// Returns an RgbImage with top-to-bottom row order and R,G,B byte order,
// regardless of whether the source was bottom-up or top-down on disk.

import type { RgbImage } from "@/compositor/types";
import { FONT_SIZE, GLYPH_SIZE, FONT_GRID } from "@/compositor/constants";

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

// ---------------------------------------------------------------------------
// HD OSD font normalization — exploded → compact
// ---------------------------------------------------------------------------

/** Exploded HD OSD layout: 16 cols × 32 rows of 24×36 tiles with 6px gaps + 6px outer border. */
const EXPLODED_GAP = 6;
const EXPLODED_OUTER = 6;
const EXPLODED_W = FONT_GRID.cols * GLYPH_SIZE.w + (FONT_GRID.cols + 1) * EXPLODED_GAP; // 486
const EXPLODED_H = FONT_GRID.rows * GLYPH_SIZE.h + (FONT_GRID.rows + 1) * EXPLODED_GAP; // 1350

/**
 * Normalize an arbitrary HD OSD font bitmap to the compact 384×1152 layout
 * the compositor expects. Accepts:
 *   - 384×1152 compact (passes through unchanged)
 *   - 486×1350 exploded (strips the 6px gaps + outer border)
 *
 * Throws with a helpful message for any other dimensions so the UI can
 * surface the error rather than silently rendering garbage.
 */
export function normalizeHdOsdFont(image: RgbImage): RgbImage {
  if (image.width === FONT_SIZE.w && image.height === FONT_SIZE.h) {
    return image;
  }
  if (image.width === EXPLODED_W && image.height === EXPLODED_H) {
    return implodeExploded(image);
  }
  throw new Error(
    `HD OSD font must be ${FONT_SIZE.w}×${FONT_SIZE.h} (compact) or ` +
      `${EXPLODED_W}×${EXPLODED_H} (exploded). Got ${image.width}×${image.height}.`,
  );
}

function implodeExploded(image: RgbImage): RgbImage {
  const out = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
  const srcStride = image.width * 3;
  const dstStride = FONT_SIZE.w * 3;
  const tileRowBytes = GLYPH_SIZE.w * 3;
  for (let row = 0; row < FONT_GRID.rows; row++) {
    for (let col = 0; col < FONT_GRID.cols; col++) {
      const srcX0 = col * (GLYPH_SIZE.w + EXPLODED_GAP) + EXPLODED_OUTER;
      const srcY0 = row * (GLYPH_SIZE.h + EXPLODED_GAP) + EXPLODED_OUTER;
      const dstX0 = col * GLYPH_SIZE.w;
      const dstY0 = row * GLYPH_SIZE.h;
      for (let py = 0; py < GLYPH_SIZE.h; py++) {
        const srcOff = (srcY0 + py) * srcStride + srcX0 * 3;
        const dstOff = (dstY0 + py) * dstStride + dstX0 * 3;
        out.set(image.data.subarray(srcOff, srcOff + tileRowBytes), dstOff);
      }
    }
  }
  return { width: FONT_SIZE.w, height: FONT_SIZE.h, data: out };
}
