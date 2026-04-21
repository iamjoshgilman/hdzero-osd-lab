import { describe, it, expect } from "vitest";
import {
  GLYPH_SIZE,
  FONT_GRID,
  GLYPH_COUNT,
  FONT_SIZE,
  LOGO_SIZE,
  GLYPH_SUBSETS,
  SUBSET_TARGET_OFFSET,
  codeToOrigin,
} from "./constants";

describe("constants", () => {
  it("font atlas is 384×1152", () => {
    expect(FONT_SIZE.w).toBe(384);
    expect(FONT_SIZE.h).toBe(1152);
    expect(GLYPH_SIZE.w * FONT_GRID.cols).toBe(384);
    expect(GLYPH_SIZE.h * FONT_GRID.rows).toBe(1152);
  });

  it("has 512 tile slots", () => {
    expect(GLYPH_COUNT).toBe(512);
    expect(GLYPH_SUBSETS.ALL).toHaveLength(512);
  });

  it("BTFL logo banner is 576×144", () => {
    expect(LOGO_SIZE.btfl.w).toBe(576);
    expect(LOGO_SIZE.btfl.h).toBe(144);
  });

  it("mini logo is 120×36 and spans codes 91..95", () => {
    expect(LOGO_SIZE.mini.w).toBe(120);
    expect(LOGO_SIZE.mini.h).toBe(36);
    expect(GLYPH_SUBSETS.BTFL_MINILOGO).toEqual([91, 92, 93, 94, 95]);
  });

  it("BTFL logo subset spans 160..255 (96 tiles = 24 cols × 4 rows)", () => {
    const logo = GLYPH_SUBSETS.BTFL_LOGO;
    expect(logo[0]).toBe(160);
    expect(logo[logo.length - 1]).toBe(255);
    expect(logo).toHaveLength(96);
  });

  it("letters are A..Z (65..90)", () => {
    expect(GLYPH_SUBSETS.BTFL_LETTERS).toHaveLength(26);
    expect(GLYPH_SUBSETS.BTFL_LETTERS[0]).toBe(65);
    expect(GLYPH_SUBSETS.BTFL_LETTERS[25]).toBe(90);
  });

  it("numbers are 0..9 (48..57)", () => {
    expect(GLYPH_SUBSETS.BTFL_NUMBERS).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56, 57]);
  });

  it("lowletters carries a -32 offset so it writes to the uppercase slots", () => {
    expect(SUBSET_TARGET_OFFSET.BTFL_LOWLETTERS).toBe(-32);
    // No other subset has an offset.
    const withOffset = Object.entries(SUBSET_TARGET_OFFSET).filter(([, v]) => v !== undefined);
    expect(withOffset).toHaveLength(1);
  });

  it("codeToOrigin maps code 0 to (0,0) and code 152 to (192,324)", () => {
    expect(codeToOrigin(0)).toEqual({ x: 0, y: 0 });
    // 152 = row 9, col 8 → (8*24, 9*36) = (192, 324).
    expect(codeToOrigin(152)).toEqual({ x: 192, y: 324 });
    expect(codeToOrigin(511)).toEqual({ x: 15 * 24, y: 31 * 36 });
  });
});
