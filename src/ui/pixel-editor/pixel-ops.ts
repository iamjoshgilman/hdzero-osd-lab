// Pure pixel-buffer operations for the PixelEditor. No DOM, no Preact —
// just byte math over RGB Uint8ClampedArrays. Keeps the editor's drawing
// logic trivially testable and reusable for the multi-tile decoration
// canvas that'll ride on top of the same primitives.
//
// Buffer convention: row-major RGB, length = width * height * 3. Same as
// the compositor's Tile / RgbImage types. Chroma-gray (127,127,127) is
// the transparency sentinel — "eraser" writes that.

import { COLOR_TRANSPARENT } from "@/compositor/constants";

export type Rgb = readonly [number, number, number];

/** Read the RGB triple at (x, y). Returns chroma-gray on out-of-bounds. */
export function getPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Rgb {
  if (x < 0 || y < 0 || x >= width || y >= height) return COLOR_TRANSPARENT;
  const off = (y * width + x) * 3;
  return [pixels[off]!, pixels[off + 1]!, pixels[off + 2]!] as const;
}

/** Write an RGB triple at (x, y). No-op if out of bounds. */
export function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: Rgb,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const off = (y * width + x) * 3;
  pixels[off] = rgb[0];
  pixels[off + 1] = rgb[1];
  pixels[off + 2] = rgb[2];
}

/** Convenience: set to chroma-gray (transparent on-goggle). */
export function erasePixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): void {
  setPixel(pixels, width, height, x, y, COLOR_TRANSPARENT);
}

/**
 * BFS flood fill from (x, y): every pixel connected 4-way that matches the
 * start pixel's RGB gets replaced with `newColor`. No-op when the clicked
 * pixel already matches newColor (saves a redundant fill + undo entry).
 * Modifies `pixels` in place.
 */
export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  newColor: Rgb,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const target = getPixel(pixels, width, height, x, y);
  if (colorsEqual(target, newColor)) return;

  const queue: Array<[number, number]> = [[x, y]];
  while (queue.length > 0) {
    const [cx, cy] = queue.pop()!;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const cur = getPixel(pixels, width, height, cx, cy);
    if (!colorsEqual(cur, target)) continue;
    setPixel(pixels, width, height, cx, cy, newColor);
    queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

export function colorsEqual(a: Rgb, b: Rgb): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Draw a 1-pixel-wide line of `rgb` from (x0,y0) to (x1,y1). Bresenham;
 * covers the "click-drag" painting path so fast mouse sweeps don't leave
 * gaps between sampled points.
 */
export function drawLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: Rgb,
): void {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    setPixel(pixels, width, height, cx, cy, rgb);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

/** Structural clone of a pixel buffer — used for undo snapshots. */
export function clonePixels(pixels: Uint8ClampedArray): Uint8ClampedArray {
  const copy = new Uint8ClampedArray(pixels.length);
  copy.set(pixels);
  return copy;
}

/** Hex-color helper: "#rrggbb" → [r, g, b]. Tolerates missing leading "#". */
export function parseHexRgb(hex: string): Rgb {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ] as const;
}

/** RGB triple → "#rrggbb" for color-picker binding. */
export function rgbToHex(rgb: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

/**
 * Convert RGB (0..255) to HSL (hue 0..360, saturation/lightness 0..100).
 * Standard algorithm; tolerates grayscale inputs (returns h=0 when s=0).
 */
export function rgbToHsl(rgb: Rgb): [number, number, number] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** HSL (h 0..360, s/l 0..100) → RGB (0..255). Inverse of rgbToHsl. */
export function hslToRgb(hsl: [number, number, number]): Rgb {
  const h = hsl[0] / 360;
  const s = hsl[1] / 100;
  const l = hsl[2] / 100;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)] as const;
}

/**
 * Shift an RGB color's lightness by `deltaPercent` (−100..+100). Negative =
 * darker, positive = lighter. Hue and saturation are preserved so shading is
 * natural, not a muddy grey wash. Grayscale inputs get a narrower range since
 * they have no hue to preserve.
 */
export function shadeColor(rgb: Rgb, deltaPercent: number): Rgb {
  const [h, s, l] = rgbToHsl(rgb);
  const newL = Math.max(0, Math.min(100, l + deltaPercent));
  return hslToRgb([h, s, newL]);
}

/**
 * Encode an RGB pixel buffer as a PNG blob. Browser-only (relies on
 * OffscreenCanvas + canvas.convertToBlob). Used when committing an edited
 * tile back into the project as a glyph override — putAsset stores the PNG
 * blob, and the existing imageRgbaToTile pipeline decodes it on the next
 * compose.
 */
export async function rgbToPngBlob(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("rgbToPngBlob: OffscreenCanvas unavailable");
  }
  // OffscreenCanvas.getContext('2d') + putImageData wants RGBA; widen from RGB.
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i]!;
    rgba[j + 1] = pixels[i + 1]!;
    rgba[j + 2] = pixels[i + 2]!;
    rgba[j + 3] = 255;
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rgbToPngBlob: 2D context unavailable");
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
