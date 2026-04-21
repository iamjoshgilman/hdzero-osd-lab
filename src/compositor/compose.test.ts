import { describe, it, expect } from "vitest";
import { compose, emptyResolvedAssets } from "./compose";
import { createDefaultProject } from "@/state/project";
import { createTile, extractTile, ATLAS_BYTES } from "./atlas";
import { FONT_SIZE, codeToOrigin } from "./constants";
import type { ProjectDoc } from "@/state/project";

describe("compose", () => {
  it("empty project returns an all-chroma-gray atlas", () => {
    const atlas = compose(createDefaultProject());
    expect(atlas.length).toBe(ATLAS_BYTES);
    expect(atlas[0]).toBe(127);
    expect(atlas[ATLAS_BYTES - 1]).toBe(127);
  });

  it("bitmap layer blits the correct subset", () => {
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: {},
        layers: [
          {
            id: "base",
            kind: "bitmap",
            source: { kind: "user", hash: "h1", name: "t.bmp", mime: "image/bmp" },
            subset: "BTFL_NUMBERS",
            enabled: true,
          },
        ],
      },
    };
    // Build a fake 384×1152 source atlas filled with red.
    const source = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    for (let i = 0; i < source.length; i += 3) {
      source[i] = 255;
      source[i + 1] = 0;
      source[i + 2] = 0;
    }
    const assets = emptyResolvedAssets();
    assets.bitmap.set("h1", { width: FONT_SIZE.w, height: FONT_SIZE.h, data: source });
    const atlas = compose(project, assets);

    // Code 48 (digit '0') should now be red.
    const { x, y } = codeToOrigin(48);
    const stride = FONT_SIZE.w * 3;
    expect(atlas[y * stride + x * 3]).toBe(255);
    // Code 0 (not in BTFL_NUMBERS) should still be chroma-gray.
    expect(atlas[0]).toBe(127);
  });

  it("disabled layer is skipped", () => {
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: {},
        layers: [
          {
            id: "base",
            kind: "bitmap",
            source: { kind: "user", hash: "h1", name: "t.bmp", mime: "image/bmp" },
            subset: "ALL",
            enabled: false,
          },
        ],
      },
    };
    const source = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    source.fill(200);
    const assets = emptyResolvedAssets();
    assets.bitmap.set("h1", { width: FONT_SIZE.w, height: FONT_SIZE.h, data: source });
    const atlas = compose(project, assets);
    expect(atlas[0]).toBe(127); // chroma-gray, untouched
  });

  it("override wins over a layer at the same code", () => {
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: { 100: { source: { kind: "user", hash: "ov", name: "o.png", mime: "image/png" } } },
        layers: [
          {
            id: "base",
            kind: "bitmap",
            source: { kind: "user", hash: "h1", name: "t.bmp", mime: "image/bmp" },
            subset: "ALL",
            enabled: true,
          },
        ],
      },
    };
    const source = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    source.fill(50); // base layer is dark gray everywhere
    const assets = emptyResolvedAssets();
    assets.bitmap.set("h1", { width: FONT_SIZE.w, height: FONT_SIZE.h, data: source });
    const overrideTile = createTile([255, 255, 0]); // bright yellow override
    assets.overrides.set(100, overrideTile);
    const atlas = compose(project, assets);
    // Code 100 should now be the yellow override, not the dark-gray base.
    const got = extractTile(atlas, 100);
    expect([got[0], got[1], got[2]]).toEqual([255, 255, 0]);
  });

  it("lowletters layer offsets target codes by -32 (writes to uppercase slots)", () => {
    const tileMap = new Map<number, Uint8ClampedArray>();
    for (let code = 97; code < 123; code++) {
      tileMap.set(code, createTile([0, 0, 255])); // blue
    }
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: {},
        layers: [
          {
            id: "lo",
            kind: "ttf",
            source: { kind: "user", hash: "t", name: "f.ttf", mime: "font/ttf" },
            subset: "BTFL_LOWLETTERS",
            size: 20,
            outlineThickness: 1,
            vStretch: 1,
            glyphOffset: { x: 0, y: 0 },
            outlineOffset: { x: 0, y: 0 },
            glyphColor: "#0000ff",
            outlineColor: "#000000",
            superSampling: 8,
            enabled: true,
          },
        ],
      },
    };
    const assets = emptyResolvedAssets();
    assets.ttf.set("lo", tileMap);
    const atlas = compose(project, assets);
    // 'a'=97 would offset to 65 = 'A'. Check code 65 is blue.
    const tile = extractTile(atlas, 65);
    expect([tile[0], tile[1], tile[2]]).toEqual([0, 0, 255]);
    // 'a' code 97 itself (the lowercase slot) remains chroma-gray (no tile there).
    const untouched = extractTile(atlas, 97);
    expect([untouched[0], untouched[1], untouched[2]]).toEqual([127, 127, 127]);
  });

  it("layer order: later layers overwrite earlier", () => {
    const redSource = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    for (let i = 0; i < redSource.length; i += 3) {
      redSource[i] = 255;
    }
    const blueSource = new Uint8ClampedArray(FONT_SIZE.w * FONT_SIZE.h * 3);
    for (let i = 0; i < blueSource.length; i += 3) {
      blueSource[i + 2] = 255;
    }
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: {},
        layers: [
          {
            id: "a",
            kind: "bitmap",
            source: { kind: "user", hash: "R", name: "r.bmp", mime: "image/bmp" },
            subset: "ALL",
            enabled: true,
          },
          {
            id: "b",
            kind: "bitmap",
            source: { kind: "user", hash: "B", name: "b.bmp", mime: "image/bmp" },
            subset: "BTFL_LETTERS",
            enabled: true,
          },
        ],
      },
    };
    const assets = emptyResolvedAssets();
    assets.bitmap.set("R", { width: FONT_SIZE.w, height: FONT_SIZE.h, data: redSource });
    assets.bitmap.set("B", { width: FONT_SIZE.w, height: FONT_SIZE.h, data: blueSource });
    const atlas = compose(project, assets);
    // Code 65 ('A') is covered by both layers; blue should win.
    const letter = extractTile(atlas, 65);
    expect(letter[2]).toBe(255);
    // Code 0 only covered by the red ALL layer.
    const zeroth = extractTile(atlas, 0);
    expect(zeroth[0]).toBe(255);
  });

  it("throws when a bitmap source is not the atlas size", () => {
    const project: ProjectDoc = {
      ...createDefaultProject(),
      font: {
        overrides: {},
        layers: [
          {
            id: "bad",
            kind: "bitmap",
            source: { kind: "user", hash: "h1", name: "t.bmp", mime: "image/bmp" },
            subset: "ALL",
            enabled: true,
          },
        ],
      },
    };
    const assets = emptyResolvedAssets();
    assets.bitmap.set("h1", {
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 3),
    });
    expect(() => compose(project, assets)).toThrow(/expected 384×1152/);
  });
});
