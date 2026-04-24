import { describe, it, expect } from "vitest";
import {
  getPixel,
  setPixel,
  erasePixel,
  floodFill,
  drawLine,
  stampBrush,
  clonePixels,
  colorsEqual,
  parseHexRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  shadeColor,
  type Rgb,
} from "./pixel-ops";

/** Build a width×height solid-color RGB buffer for test fixtures. */
function solid(w: number, h: number, rgb: Rgb): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < px.length; i += 3) {
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
  }
  return px;
}

describe("pixel-ops: getPixel / setPixel / erasePixel", () => {
  it("set + get round-trip preserves RGB", () => {
    const px = solid(4, 4, [0, 0, 0]);
    setPixel(px, 4, 4, 2, 1, [255, 128, 64]);
    expect(getPixel(px, 4, 4, 2, 1)).toEqual([255, 128, 64]);
  });

  it("getPixel returns chroma-gray out of bounds", () => {
    const px = solid(4, 4, [50, 50, 50]);
    expect(getPixel(px, 4, 4, -1, 0)).toEqual([127, 127, 127]);
    expect(getPixel(px, 4, 4, 4, 0)).toEqual([127, 127, 127]);
    expect(getPixel(px, 4, 4, 0, 4)).toEqual([127, 127, 127]);
  });

  it("setPixel is a no-op out of bounds (doesn't crash, doesn't wrap)", () => {
    const px = solid(4, 4, [10, 10, 10]);
    setPixel(px, 4, 4, -1, 0, [255, 0, 0]);
    setPixel(px, 4, 4, 4, 0, [255, 0, 0]);
    expect([px[0], px[1], px[2]]).toEqual([10, 10, 10]);
    expect(px.every((b) => b === 10)).toBe(true);
  });

  it("erasePixel writes chroma-gray", () => {
    const px = solid(4, 4, [200, 100, 50]);
    erasePixel(px, 4, 4, 1, 1);
    expect(getPixel(px, 4, 4, 1, 1)).toEqual([127, 127, 127]);
  });
});

describe("pixel-ops: floodFill", () => {
  it("fills a solid region to the new color", () => {
    const px = solid(3, 3, [0, 0, 0]);
    floodFill(px, 3, 3, 1, 1, [255, 255, 255]);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(getPixel(px, 3, 3, x, y)).toEqual([255, 255, 255]);
      }
    }
  });

  it("stops at color boundaries", () => {
    // Draw a vertical line of red at x=1 splitting a 3×3 black square.
    const px = solid(3, 3, [0, 0, 0]);
    for (let y = 0; y < 3; y++) setPixel(px, 3, 3, 1, y, [255, 0, 0]);

    // Fill from the LEFT side (0,0) to green — right side should stay black.
    floodFill(px, 3, 3, 0, 0, [0, 255, 0]);

    // Left column now green.
    for (let y = 0; y < 3; y++) {
      expect(getPixel(px, 3, 3, 0, y)).toEqual([0, 255, 0]);
    }
    // Middle column still red.
    for (let y = 0; y < 3; y++) {
      expect(getPixel(px, 3, 3, 1, y)).toEqual([255, 0, 0]);
    }
    // Right column still black.
    for (let y = 0; y < 3; y++) {
      expect(getPixel(px, 3, 3, 2, y)).toEqual([0, 0, 0]);
    }
  });

  it("no-ops when the clicked pixel already matches newColor", () => {
    // Hitting an already-white pixel with a white fill shouldn't loop or crash,
    // and shouldn't touch any other pixels either (matters when an adjacent
    // pixel happens to match the target color by coincidence).
    const px = solid(3, 3, [255, 255, 255]);
    setPixel(px, 3, 3, 0, 0, [0, 0, 0]); // one black pixel at corner

    floodFill(px, 3, 3, 1, 1, [255, 255, 255]);

    // Black corner untouched.
    expect(getPixel(px, 3, 3, 0, 0)).toEqual([0, 0, 0]);
  });

  it("handles a disconnected same-color island (leaves it alone)", () => {
    // Two black regions with a white barrier between; fill the left one.
    const px = solid(5, 3, [0, 0, 0]);
    for (let y = 0; y < 3; y++) setPixel(px, 5, 3, 2, y, [255, 255, 255]);
    // x=0..1 black, x=2 white, x=3..4 black.

    floodFill(px, 5, 3, 0, 0, [255, 0, 0]);

    // Left island is now red.
    expect(getPixel(px, 5, 3, 0, 0)).toEqual([255, 0, 0]);
    expect(getPixel(px, 5, 3, 1, 2)).toEqual([255, 0, 0]);
    // Barrier still white.
    expect(getPixel(px, 5, 3, 2, 0)).toEqual([255, 255, 255]);
    // Right island still black — disconnected regions aren't filled.
    expect(getPixel(px, 5, 3, 3, 0)).toEqual([0, 0, 0]);
    expect(getPixel(px, 5, 3, 4, 2)).toEqual([0, 0, 0]);
  });
});

describe("pixel-ops: drawLine", () => {
  it("paints both endpoints plus the pixels between (horizontal)", () => {
    const px = solid(5, 1, [0, 0, 0]);
    drawLine(px, 5, 1, 0, 0, 4, 0, [255, 0, 0]);
    for (let x = 0; x < 5; x++) {
      expect(getPixel(px, 5, 1, x, 0)).toEqual([255, 0, 0]);
    }
  });

  it("paints a diagonal without gaps", () => {
    const px = solid(4, 4, [0, 0, 0]);
    drawLine(px, 4, 4, 0, 0, 3, 3, [255, 255, 255]);
    // Diagonal covered.
    for (let i = 0; i < 4; i++) {
      expect(getPixel(px, 4, 4, i, i)).toEqual([255, 255, 255]);
    }
    // Off-diagonal untouched.
    expect(getPixel(px, 4, 4, 0, 3)).toEqual([0, 0, 0]);
    expect(getPixel(px, 4, 4, 3, 0)).toEqual([0, 0, 0]);
  });

  it("single-point line (x0==x1, y0==y1) paints just that pixel", () => {
    const px = solid(3, 3, [0, 0, 0]);
    drawLine(px, 3, 3, 1, 1, 1, 1, [255, 0, 0]);
    expect(getPixel(px, 3, 3, 1, 1)).toEqual([255, 0, 0]);
    expect(getPixel(px, 3, 3, 0, 0)).toEqual([0, 0, 0]);
  });

  it("size > 1 paints a brush-wide trail (no gaps on a diagonal)", () => {
    const px = solid(8, 8, [0, 0, 0]);
    drawLine(px, 8, 8, 1, 1, 6, 6, [255, 0, 0], 3);
    // Diagonal-adjacent pixels that a size-1 line would miss should be red
    // once the 3×3 brush stamps at each Bresenham step.
    expect(getPixel(px, 8, 8, 2, 1)).toEqual([255, 0, 0]);
    expect(getPixel(px, 8, 8, 1, 2)).toEqual([255, 0, 0]);
    // Far corners stay untouched — brush isn't big enough to reach them.
    expect(getPixel(px, 8, 8, 0, 7)).toEqual([0, 0, 0]);
    expect(getPixel(px, 8, 8, 7, 0)).toEqual([0, 0, 0]);
  });
});

describe("pixel-ops: stampBrush", () => {
  it("size=1 behaves exactly like setPixel", () => {
    const px = solid(3, 3, [0, 0, 0]);
    stampBrush(px, 3, 3, 1, 1, [9, 9, 9], 1);
    expect(getPixel(px, 3, 3, 1, 1)).toEqual([9, 9, 9]);
    // Neighbors stay untouched.
    expect(getPixel(px, 3, 3, 0, 1)).toEqual([0, 0, 0]);
    expect(getPixel(px, 3, 3, 2, 2)).toEqual([0, 0, 0]);
  });

  it("odd size centers on the cursor (3×3 at (2,2) fills (1..3, 1..3))", () => {
    const px = solid(5, 5, [0, 0, 0]);
    stampBrush(px, 5, 5, 2, 2, [1, 2, 3], 3);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(getPixel(px, 5, 5, x, y)).toEqual([1, 2, 3]);
      }
    }
    // Outside the 3×3 block stays black.
    expect(getPixel(px, 5, 5, 0, 0)).toEqual([0, 0, 0]);
    expect(getPixel(px, 5, 5, 4, 4)).toEqual([0, 0, 0]);
  });

  it("clips at the buffer edges instead of throwing", () => {
    const px = solid(4, 4, [0, 0, 0]);
    // 5×5 brush at (0,0) would paint at negative offsets; setPixel no-ops OOB.
    stampBrush(px, 4, 4, 0, 0, [255, 0, 0], 5);
    // Top-left corner filled.
    expect(getPixel(px, 4, 4, 0, 0)).toEqual([255, 0, 0]);
    // Far corner untouched (brush can't reach).
    expect(getPixel(px, 4, 4, 3, 3)).toEqual([0, 0, 0]);
  });
});

describe("pixel-ops: helpers", () => {
  it("clonePixels is an independent copy", () => {
    const a = solid(2, 2, [0, 0, 0]);
    const b = clonePixels(a);
    setPixel(b, 2, 2, 0, 0, [255, 255, 255]);
    expect(getPixel(a, 2, 2, 0, 0)).toEqual([0, 0, 0]);
  });

  it("colorsEqual", () => {
    expect(colorsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(colorsEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("parseHexRgb / rgbToHex round-trip", () => {
    expect(parseHexRgb("#ff00aa")).toEqual([255, 0, 170]);
    expect(parseHexRgb("ff00aa")).toEqual([255, 0, 170]);
    expect(rgbToHex([255, 0, 170])).toBe("#ff00aa");
    expect(rgbToHex([0, 0, 0])).toBe("#000000");
  });

  it("parseHexRgb returns black on malformed input (doesn't throw)", () => {
    expect(parseHexRgb("garbage")).toEqual([0, 0, 0]);
    expect(parseHexRgb("#abc")).toEqual([0, 0, 0]);
  });
});

describe("pixel-ops: HSL + shadeColor", () => {
  it("rgbToHsl → hslToRgb round-trips near-exactly for pure colors", () => {
    // Some rounding loss is expected; allow ±1 per channel.
    const colors: Rgb[] = [
      [255, 0, 0], // red
      [0, 255, 0], // green
      [0, 0, 255], // blue
      [255, 255, 0], // yellow
      [128, 64, 200], // mid purple
      [50, 50, 50], // grey
    ];
    for (const rgb of colors) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back[0] - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(back[1] - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(back[2] - rgb[2])).toBeLessThanOrEqual(1);
    }
  });

  it("rgbToHsl handles pure grayscale without NaN (h=0, s=0)", () => {
    const [h, s, l] = rgbToHsl([127, 127, 127]);
    expect(h).toBe(0);
    expect(s).toBe(0);
    expect(Math.abs(l - 50)).toBeLessThanOrEqual(1);
  });

  it("shadeColor preserves hue, shifts lightness", () => {
    const base: Rgb = [100, 50, 200]; // bluish purple
    const darker = shadeColor(base, -30);
    const lighter = shadeColor(base, 30);

    // Darker variant has lower luma.
    const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    expect(luma(darker)).toBeLessThan(luma(base));
    expect(luma(lighter)).toBeGreaterThan(luma(base));

    // Hue survives (small drift from rounding OK).
    const baseHue = rgbToHsl(base)[0];
    const darkHue = rgbToHsl(darker)[0];
    const lightHue = rgbToHsl(lighter)[0];
    expect(Math.abs(darkHue - baseHue)).toBeLessThanOrEqual(2);
    expect(Math.abs(lightHue - baseHue)).toBeLessThanOrEqual(2);
  });

  it("shadeColor clamps at the extremes (no over-/under-flow)", () => {
    expect(shadeColor([255, 255, 255], 50)).toEqual([255, 255, 255]);
    expect(shadeColor([0, 0, 0], -50)).toEqual([0, 0, 0]);
  });
});
