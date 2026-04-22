import { describe, it, expect } from "vitest";
import { lookupSymbol, allSymbols, symbolCount } from "./symbols";

describe("symbols table", () => {
  it("has a stable count (guards accidental deletions)", () => {
    // 101 `#define SYM_*` lines in upstream osd_symbols.h minus two pure aliases
    // (SYM_CURSOR → SYM_AH_LEFT, SYM_GPS_DEGREE → SYM_STICK_OVERLAY_SPRITE_HIGH)
    // = 99 distinct glyph codes. Update alongside the table when upstream changes.
    expect(symbolCount()).toBe(99);
  });

  it("all codes are in 0..255", () => {
    for (const sym of allSymbols()) {
      expect(sym.code).toBeGreaterThanOrEqual(0);
      expect(sym.code).toBeLessThanOrEqual(255);
    }
  });

  it("no duplicate codes except explicit aliases", () => {
    const counts = new Map<number, number>();
    for (const sym of allSymbols()) {
      counts.set(sym.code, (counts.get(sym.code) ?? 0) + 1);
    }
    // 0x08 has GPS_DEGREE aliasing STICK_OVERLAY_SPRITE_HIGH — but the table
    // stores only the stick version so there should be no duplicates.
    for (const [code, count] of counts) {
      if (count > 1) {
        throw new Error(`code 0x${code.toString(16)} appears ${count} times`);
      }
    }
  });

  it("lookupSymbol finds well-known entries", () => {
    expect(lookupSymbol(0x01)?.name).toBe("RSSI");
    expect(lookupSymbol(0x7b)?.name).toBe("LINK_QUALITY");
    expect(lookupSymbol(0x96)?.name).toBe("BATT_EMPTY");
    expect(lookupSymbol(0x68)?.name).toBe("ARROW_NORTH");
    expect(lookupSymbol(0x18)?.name).toBe("HEADING_N");
    expect(lookupSymbol(0x06)?.name).toBe("VOLT");
    expect(lookupSymbol(0x07)?.name).toBe("MAH");
  });

  it("returns null for codes with no BF symbol mapping", () => {
    expect(lookupSymbol(0x30)).toBeNull(); // '0' digit — ASCII, not a SYM_
    expect(lookupSymbol(0x41)).toBeNull(); // 'A' letter — ASCII, not a SYM_
    expect(lookupSymbol(0xa0)).toBeNull(); // BTFL logo range
    expect(lookupSymbol(300)).toBeNull(); // unused region
  });

  it("every category appears at least once", () => {
    const seen = new Set<string>();
    for (const sym of allSymbols()) seen.add(sym.category);
    const expected = [
      "misc",
      "rssi",
      "throttle",
      "unit",
      "heading",
      "ahi",
      "sats",
      "arrow",
      "battery",
      "power",
      "time",
      "lap",
      "speed",
      "progress",
      "stick",
      "gps",
    ];
    for (const cat of expected) {
      expect(seen.has(cat)).toBe(true);
    }
  });
});
