// 24-bit BMP v3 writer. No DOM, no Canvas — pure byte layout.
// Matches the file pygame's image.save() emits for RGB surfaces, which is
// what HDZero goggles expect on the SD card as BTFL_000.bmp.
//
// Wire format:
//   [0 .. 13]  BITMAPFILEHEADER (14 bytes)
//   [14 .. 53] BITMAPINFOHEADER (40 bytes)
//   [54 ..  N] pixel data, bottom-up rows, BGR, each row 4-byte aligned
//
// Spec reference: https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-storage

import type { RgbImage } from "@/compositor/types";

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;

/** Pad `byteLen` up to the next multiple of 4. BMP rows are 4-byte aligned. */
function rowStride(width: number): number {
  return Math.ceil((width * 3) / 4) * 4;
}

/**
 * Encode an RGB image as a 24-bit BMP v3 file.
 * Input pixel order: row-major, top-to-bottom, R,G,B per pixel.
 * Output pixel order: bottom-to-top rows, B,G,R per pixel, 4-byte-aligned rows.
 *
 * For a 384×1152 image (our HD OSD font atlas) the output is exactly
 * 14 + 40 + 384×1152×3 = 1,327,158 bytes (no row padding — 1152 is already
 * aligned).
 */
export function writeBmp24(image: RgbImage): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) {
    throw new Error(`writeBmp24: invalid dimensions ${width}×${height}`);
  }
  const expectedInputLen = width * height * 3;
  if (data.length !== expectedInputLen) {
    throw new Error(
      `writeBmp24: data length ${data.length} does not match ${width}×${height}×3 = ${expectedInputLen}`,
    );
  }

  const stride = rowStride(width);
  const pixelBytes = stride * height;
  const totalBytes = FILE_HEADER_SIZE + DIB_HEADER_SIZE + pixelBytes;

  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  // BITMAPFILEHEADER
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, totalBytes, true); // bfSize
  view.setUint16(6, 0, true); // bfReserved1
  view.setUint16(8, 0, true); // bfReserved2
  view.setUint32(10, FILE_HEADER_SIZE + DIB_HEADER_SIZE, true); // bfOffBits

  // BITMAPINFOHEADER (40 bytes, v3)
  const dib = FILE_HEADER_SIZE;
  view.setUint32(dib + 0, DIB_HEADER_SIZE, true); // biSize
  view.setInt32(dib + 4, width, true); // biWidth
  view.setInt32(dib + 8, height, true); // biHeight (positive = bottom-up)
  view.setUint16(dib + 12, 1, true); // biPlanes
  view.setUint16(dib + 14, 24, true); // biBitCount
  view.setUint32(dib + 16, 0, true); // biCompression = BI_RGB
  view.setUint32(dib + 20, pixelBytes, true); // biSizeImage
  view.setInt32(dib + 24, 2835, true); // biXPelsPerMeter (≈72 dpi)
  view.setInt32(dib + 28, 2835, true); // biYPelsPerMeter
  view.setUint32(dib + 32, 0, true); // biClrUsed
  view.setUint32(dib + 36, 0, true); // biClrImportant

  // Pixel data — bottom row first, BGR per pixel, stride-aligned.
  let dstOffset = FILE_HEADER_SIZE + DIB_HEADER_SIZE;
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * width * 3;
    for (let x = 0; x < width; x++) {
      const src = srcRow + x * 3;
      out[dstOffset + x * 3 + 0] = data[src + 2]!; // B
      out[dstOffset + x * 3 + 1] = data[src + 1]!; // G
      out[dstOffset + x * 3 + 2] = data[src + 0]!; // R
    }
    // Trailing stride bytes are already zero (Uint8Array init).
    dstOffset += stride;
  }

  return out;
}
