// Take an arbitrary RGBA image and produce a single 24×36 RGB tile with the
// source scaled to fit while preserving aspect, then centered on a chroma-gray
// background. Matches fontbuilder.py's load_glyph_image().
//
// Two variants:
// - imageRgbaToTile: pure function on a pre-decoded RGBA buffer. Fully
//   unit-testable. Uses nearest-neighbor sampling during the scale.
// - imageElementToTile: browser-only convenience that pulls pixels off an
//   HTMLImageElement / ImageBitmap / OffscreenCanvas via a canvas draw. Thin
//   wrapper — not covered by vitest jsdom.

import { GLYPH_SIZE, COLOR_TRANSPARENT } from "@/compositor/constants";
import type { Tile, RgbaImage } from "@/compositor/types";
import { parseHex } from "@/compositor/palette";
import type { HexColor } from "@/state/project";

export interface ImageToTileOptions {
  /** If provided, non-transparent pixels are recolored to this hex (alpha preserved). */
  tintColor?: HexColor | string;
  /**
   * Target tile size. Defaults to HD GLYPH_SIZE (24×36). Pass ANALOG_GLYPH_SIZE
   * (12×18) to produce a native analog tile. Aspect-fit scaling always
   * preserves the source image's proportions.
   */
  targetSize?: { w: number; h: number };
}

/**
 * Scale an RGBA image to fit the target tile size preserving aspect and
 * center it on a chroma-gray background. Returns a fresh RGB tile buffer
 * sized to match `targetSize` (default HD 24×36).
 */
export function imageRgbaToTile(image: RgbaImage, opts: ImageToTileOptions = {}): Tile {
  const tint = opts.tintColor ? parseHex(opts.tintColor) : null;
  const target = opts.targetSize ?? GLYPH_SIZE;
  const scale = Math.min(target.w / image.width, target.h / image.height);
  const newW = Math.max(1, Math.round(image.width * scale));
  const newH = Math.max(1, Math.round(image.height * scale));
  const offX = Math.floor((target.w - newW) / 2);
  const offY = Math.floor((target.h - newH) / 2);

  const tile = new Uint8ClampedArray(target.w * target.h * 3);
  // Background fill.
  const [tr, tg, tb] = COLOR_TRANSPARENT;
  for (let i = 0; i < tile.length; i += 3) {
    tile[i] = tr;
    tile[i + 1] = tg;
    tile[i + 2] = tb;
  }

  // Nearest-neighbor sampling over each destination pixel inside the scaled box.
  const srcStride = image.width * 4;
  const dstStride = target.w * 3;
  const [bgR, bgG, bgB] = COLOR_TRANSPARENT;
  for (let dy = 0; dy < newH; dy++) {
    const srcY = Math.min(image.height - 1, Math.floor((dy + 0.5) / scale));
    for (let dx = 0; dx < newW; dx++) {
      const srcX = Math.min(image.width - 1, Math.floor((dx + 0.5) / scale));
      const sOff = srcY * srcStride + srcX * 4;
      const a = image.data[sOff + 3]!;
      if (a === 0) continue;
      const dOff = (offY + dy) * dstStride + (offX + dx) * 3;
      let r = tint ? tint[0] : image.data[sOff]!;
      let g = tint ? tint[1] : image.data[sOff + 1]!;
      let b = tint ? tint[2] : image.data[sOff + 2]!;
      if (a < 255) {
        const af = a / 255;
        const inv = 1 - af;
        r = (r * af + bgR * inv) | 0;
        g = (g * af + bgG * inv) | 0;
        b = (b * af + bgB * inv) | 0;
      }
      tile[dOff] = r;
      tile[dOff + 1] = g;
      tile[dOff + 2] = b;
    }
  }
  return tile;
}

/**
 * Convenience wrapper: decode an image bitmap via a canvas into an RGBA
 * buffer, then call imageRgbaToTile. Browser-only; relies on the Canvas API.
 *
 * Throws in test environments that don't implement canvas pixel ops. Callers
 * should use imageRgbaToTile directly in tests.
 */
export async function imageElementToTile(
  source: ImageBitmapSource,
  opts?: ImageToTileOptions,
): Promise<Tile> {
  const bmp = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("imageElementToTile: 2D context unavailable");
  ctx.drawImage(bmp, 0, 0);
  const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return imageRgbaToTile(
    {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data.buffer),
    },
    opts,
  );
}
