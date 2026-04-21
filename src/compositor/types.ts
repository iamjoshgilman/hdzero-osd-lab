// Shared compositor types. Kept separate from constants so tree-shaking stays
// clean and tests can import types without pulling in the large subset tables.

import type { SubsetName } from "./constants";

/** A single 24×36 RGB tile. Length is GLYPH_SIZE.w * GLYPH_SIZE.h * 3 = 2592 bytes. */
export type Tile = Uint8ClampedArray;

/** An RGB image buffer with explicit dimensions. */
export interface RgbImage {
  width: number;
  height: number;
  /** Row-major RGB, length = width * height * 3. */
  data: Uint8ClampedArray;
}

/** An RGBA image buffer; used by loaders that carry per-pixel transparency. */
export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, length = width * height * 4. */
  data: Uint8ClampedArray;
}

/** Per-glyph render result produced by loaders/TTF, loaders/MCM, loaders/bmp subset extraction. */
export type TileMap = Map<number, Tile>;

export type { SubsetName };
