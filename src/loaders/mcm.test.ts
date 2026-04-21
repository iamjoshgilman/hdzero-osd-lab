import { describe, it, expect } from "vitest";
import { parseMcm } from "./mcm";

// Helper: build a minimal MCM blob. Each glyph occupies 64 lines; 54 of those
// carry pixel rows (18 rows × 3 sub-lines). We build by pixel rows (12 wide)
// and split into three 4-pixel sub-lines of 8 bits each.
function buildGlyph(rows: string[]): string {
  // Each row is exactly 12 chars, each char is '0' (black), '1' (white), or '.' (transparent).
  if (rows.length !== 18) throw new Error("need 18 rows");
  const lines: string[] = [];
  for (const row of rows) {
    if (row.length !== 12) throw new Error("row must be 12 chars");
    for (let sub = 0; sub < 3; sub++) {
      const chunk = row.slice(sub * 4, sub * 4 + 4);
      let bits = "";
      for (const ch of chunk) {
        if (ch === "0") bits += "00";
        else if (ch === "1") bits += "10";
        else bits += "01"; // any non-00, non-10 = transparent
      }
      lines.push(bits);
    }
  }
  // 10 padding lines per glyph.
  for (let i = 0; i < 10; i++) lines.push("00000000");
  return lines.join("\n");
}

describe("parseMcm", () => {
  it("returns empty on empty input", () => {
    expect(parseMcm("").size).toBe(0);
  });

  it("skips the MAX7456 magic line if present", () => {
    const glyph0 = buildGlyph([
      "111111111111",
      "100000000001",
      "101111111101",
      "101000000101",
      "101011110101",
      "101010010101",
      "101010010101",
      "101011110101",
      "101000000101",
      "101111111101",
      "100000000001",
      "111111111111",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
    ]);
    const withMagic = "MAX7456\n" + glyph0;
    const tiles = parseMcm(withMagic);
    expect(tiles.size).toBe(1);
    expect(tiles.get(0)).toBeDefined();
  });

  it("upscales a 12×18 analog glyph to a 24×36 HD tile", () => {
    const glyph = buildGlyph([
      "111111111111",
      ...Array(17).fill("............"),
    ]);
    const tiles = parseMcm(glyph);
    const tile = tiles.get(0)!;
    expect(tile.length).toBe(24 * 36 * 3);
    // Top-left 2×2 block should be white (255,255,255) due to 2× upscale.
    expect([tile[0], tile[1], tile[2]]).toEqual([255, 255, 255]);
    expect([tile[3], tile[4], tile[5]]).toEqual([255, 255, 255]);
    const row1 = 24 * 3; // second row of dst
    expect([tile[row1], tile[row1 + 1], tile[row1 + 2]]).toEqual([255, 255, 255]);
    // Row 2 (after the first 2×2 block) should be chroma-gray for the transparent rows.
    const row2 = 2 * 24 * 3;
    expect([tile[row2], tile[row2 + 1], tile[row2 + 2]]).toEqual([127, 127, 127]);
  });

  it("applies custom glyph and outline colors", () => {
    // A 2-pixel-wide row: "10" pattern (one white, one black) then transparent.
    const glyph = buildGlyph([
      "10..........",
      ...Array(17).fill("............"),
    ]);
    const tiles = parseMcm(glyph, { glyphColor: "#ff00ff", outlineColor: "#00ff00" });
    const tile = tiles.get(0)!;
    // First upscaled pixel = glyphColor magenta
    expect([tile[0], tile[1], tile[2]]).toEqual([255, 0, 255]);
    // Third pixel in source (after 2× = src x=1 → dst x=2,3) = outlineColor green.
    // dst x=2, y=0: offset = 2*3 = 6.
    expect([tile[6], tile[7], tile[8]]).toEqual([0, 255, 0]);
  });

  it("parses multiple glyphs back-to-back", () => {
    const glyph0 = buildGlyph([
      "1...........",
      ...Array(17).fill("............"),
    ]);
    const glyph1 = buildGlyph([
      ".0..........",
      ...Array(17).fill("............"),
    ]);
    const tiles = parseMcm(glyph0 + "\n" + glyph1);
    expect(tiles.size).toBe(2);
    // glyph 0 top-left is white
    expect([tiles.get(0)![0], tiles.get(0)![1], tiles.get(0)![2]]).toEqual([255, 255, 255]);
    // glyph 1 has outline at src col 1 → dst col 2
    const t1 = tiles.get(1)!;
    expect([t1[6], t1[7], t1[8]]).toEqual([0, 0, 0]);
  });

  it("handles CRLF line endings", () => {
    const glyph = buildGlyph([
      "111111111111",
      ...Array(17).fill("............"),
    ]);
    const crlf = "MAX7456\r\n" + glyph.replace(/\n/g, "\r\n");
    const tiles = parseMcm(crlf);
    expect(tiles.size).toBe(1);
  });
});
