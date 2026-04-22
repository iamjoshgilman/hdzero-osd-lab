import { describe, it, expect } from "vitest";
import {
  getGlyphMetadata,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "./glyph-metadata";

describe("getGlyphMetadata", () => {
  it("code 65 ('A') is a letter in BTFL_LETTERS", () => {
    const m = getGlyphMetadata(65);
    expect(m.category).toBe("letter");
    expect(m.asciiChar).toBe("A");
    expect(m.subsets).toContain("BTFL_LETTERS");
    expect(m.subsets).toContain("BTFL_CHARACTERS");
    expect(m.isUsable).toBe(true);
    expect(m.code).toBe(65);
  });

  it("code 48 ('0') is a number in BTFL_NUMBERS", () => {
    const m = getGlyphMetadata(48);
    expect(m.category).toBe("number");
    expect(m.asciiChar).toBe("0");
    expect(m.subsets).toContain("BTFL_NUMBERS");
    expect(m.isUsable).toBe(true);
  });

  it("code 91 ('[') prefers logo over special because BTFL_MINILOGO wins the priority tie", () => {
    const m = getGlyphMetadata(91);
    expect(m.category).toBe("logo");
    expect(m.asciiChar).toBe("[");
    expect(m.subsets).toContain("BTFL_MINILOGO");
    expect(m.subsets).toContain("BTFL_SPECIALS");
    // Logo category is decorative only — these 5 slots render as the mini-logo banner.
    expect(m.isUsable).toBe(false);
  });

  it("code 152 is an icon (BTFL_VALUES)", () => {
    const m = getGlyphMetadata(152);
    expect(m.category).toBe("icon");
    expect(m.subsets).toContain("BTFL_VALUES");
    // 152 is > 126, so no ASCII char.
    expect(m.asciiChar).toBe(null);
    expect(m.isUsable).toBe(true);
  });

  it("code 200 is a logo slot (BTFL_LOGO banner)", () => {
    const m = getGlyphMetadata(200);
    expect(m.category).toBe("logo");
    expect(m.subsets).toContain("BTFL_LOGO");
    expect(m.asciiChar).toBe(null);
    expect(m.isUsable).toBe(false);
  });

  it("code 300 is unused (no subset contains it; outside printable ASCII)", () => {
    const m = getGlyphMetadata(300);
    expect(m.category).toBe("unused");
    expect(m.asciiChar).toBe(null);
    expect(m.subsets).toEqual([]);
    expect(m.isUsable).toBe(false);
  });

  it("code 1 is an icon (RSSI lives in BTFL_VALUES)", () => {
    const m = getGlyphMetadata(1);
    expect(m.category).toBe("icon");
    expect(m.subsets).toContain("BTFL_VALUES");
    expect(m.isUsable).toBe(true);
  });

  it("code 121 ('y') is a letter via BTFL_LOWLETTERS with no icon/arrow collision", () => {
    const m = getGlyphMetadata(121);
    expect(m.category).toBe("letter");
    expect(m.asciiChar).toBe("y");
    expect(m.subsets).toContain("BTFL_LOWLETTERS");
  });

  it("CATEGORY_COLORS / CATEGORY_LABELS cover every category", () => {
    const cats = ["letter", "number", "special", "icon", "logo", "unused"] as const;
    for (const c of cats) {
      expect(CATEGORY_COLORS[c]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});
