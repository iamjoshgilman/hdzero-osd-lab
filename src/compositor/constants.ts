// HD OSD font geometry and glyph-subset tables. These are the authoritative
// constants all modules reference. Ported from fontbuilder.py (the Python
// prior art) — see PLAN.md §12 glossary.

/** One glyph tile = 24 wide × 36 tall RGB pixels. */
export const GLYPH_SIZE = { w: 24, h: 36 } as const;

/** Font atlas layout: 16 columns × 32 rows of tiles → 384×1152 px BMP. */
export const FONT_GRID = { cols: 16, rows: 32 } as const;

/** Total tile slots in the atlas (0..511). */
export const GLYPH_COUNT = FONT_GRID.cols * FONT_GRID.rows;

/** Final BMP dimensions in pixels. */
export const FONT_SIZE = {
  w: FONT_GRID.cols * GLYPH_SIZE.w,
  h: FONT_GRID.rows * GLYPH_SIZE.h,
} as const;

/** Analog MCM glyph is 12×18, upscaled 2× into a HD glyph tile. */
export const MCM_GLYPH_SIZE = { w: 12, h: 18 } as const;

/** Logo slot sizes referenced by the various -btfl*logo switches. */
export const LOGO_SIZE = {
  btfl: { w: 576, h: 144 },
  inav: { w: 240, h: 144 },
  mini: { w: 120, h: 36 },
} as const;

/** HDZero firmware treats this RGB as transparent (chroma-key). */
export const COLOR_TRANSPARENT: readonly [number, number, number] = [127, 127, 127];

/** Default MCM "ink" pixel = white glyph on black outline. */
export const COLOR_MCM_WHITE: readonly [number, number, number] = [255, 255, 255];
export const COLOR_MCM_BLACK: readonly [number, number, number] = [0, 0, 0];

/** Default TTF render colors. */
export const COLOR_TTF_GLYPH: readonly [number, number, number] = [255, 255, 255];
export const COLOR_TTF_OUTLINE: readonly [number, number, number] = [0, 0, 0];

// ------------------------------------------------------------------
// Named glyph subsets. Every Layer in the project document references
// a subset by name; the compositor looks up the code list here.
// Ranges mirror fontbuilder.py exactly.
// ------------------------------------------------------------------

const range = (start: number, endExclusive: number): number[] =>
  Array.from({ length: endExclusive - start }, (_, i) => start + i);

export type SubsetName =
  | "ALL"
  | "BTFL_CHARACTERS"
  | "BTFL_LETTERS"
  | "BTFL_LOWLETTERS"
  | "BTFL_NUMBERS"
  | "BTFL_SPECIALS"
  | "BTFL_VALUES"
  | "BTFL_UNITS"
  | "BTFL_AHI"
  | "BTFL_COMPASS"
  | "BTFL_BATTERY"
  | "BTFL_ARROW"
  | "BTFL_FRAME"
  | "BTFL_PROGRESS"
  | "BTFL_LOGO"
  | "BTFL_MINILOGO"
  | "INAV_LOGO";

export const GLYPH_SUBSETS: Readonly<Record<SubsetName, readonly number[]>> = {
  ALL: range(0, 512),

  // Characters = specials ∪ numbers ∪ letters ∪ '|'
  BTFL_CHARACTERS: [...range(32, 36), ...range(37, 96), 124],

  // Uppercase A..Z
  BTFL_LETTERS: range(65, 91),

  // Lowercase a..z (offset -32 maps them onto the uppercase slots at composite time).
  BTFL_LOWLETTERS: range(97, 123),

  // 0..9
  BTFL_NUMBERS: range(48, 58),

  // Punctuation + pipe; excludes letters/numbers.
  BTFL_SPECIALS: [...range(32, 36), ...range(37, 48), ...range(58, 65), ...range(91, 96), 124],

  BTFL_VALUES: [1, 4, 5, 16, 17, 18, 20, 21, 30, 31, 36, 112, 113, 122, 123, 127, 137, 152, 155, 156],
  BTFL_UNITS: [6, 7, 12, 13, 14, 15, 125, 126, 153, 154, 157, 158, 159],
  BTFL_AHI: [2, 3, 19, 114, 115, 116, 117, 118, 119, 120, 128, 129, 130, 131, 132, 133, 134, 135, 136],
  BTFL_COMPASS: range(24, 30),
  BTFL_BATTERY: range(144, 152),
  BTFL_ARROW: range(96, 112),
  BTFL_FRAME: [8, 9, 10, 11, 22, 23],
  BTFL_PROGRESS: range(138, 144),
  BTFL_LOGO: range(160, 256),
  BTFL_MINILOGO: range(91, 96),

  INAV_LOGO: range(257, 297),
} as const;

/**
 * Offset applied to a subset's glyph codes when blitting into the target atlas.
 * Only BTFL_LOWLETTERS has a non-zero offset — it renders lowercase glyph
 * shapes from a TTF but places them at the uppercase code positions so
 * Betaflight (which addresses all text in uppercase) renders lowercase text.
 */
export const SUBSET_TARGET_OFFSET: Readonly<Partial<Record<SubsetName, number>>> = {
  BTFL_LOWLETTERS: -32,
};

/**
 * Helper: resolve a glyph code (0..511) to its top-left pixel in the font atlas.
 */
export function codeToOrigin(code: number): { x: number; y: number } {
  const row = Math.floor(code / FONT_GRID.cols);
  const col = code - row * FONT_GRID.cols;
  return { x: col * GLYPH_SIZE.w, y: row * GLYPH_SIZE.h };
}
