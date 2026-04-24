import { describe, it, expect } from "vitest";
import { ttfCacheKey, isSvgSource } from "./useResolvedAssets";
import type { TtfLayer } from "@/state/project";

// The TTF rasterization cache in useResolvedAssets keys on a stable fingerprint
// of the layer's rasterizer inputs. These tests lock in which fields do and
// don't influence the key — regressions here would reintroduce the palette-
// reshuffle bug (same fingerprint -> reuse cached tiles -> stable colors).

function baseLayer(): TtfLayer {
  return {
    id: "ttf-a",
    kind: "ttf",
    source: { kind: "user", hash: "h".repeat(64), name: "f.ttf", mime: "font/ttf" },
    subset: "BTFL_LETTERS",
    size: 22,
    outlineThickness: 1,
    vStretch: 1,
    glyphOffset: { x: 0, y: 0 },
    outlineOffset: { x: 0, y: 0 },
    glyphColor: "#ffffff",
    outlineColor: "#000000",
    superSampling: 8,
    paletteSeed: 42,
    enabled: true,
  };
}

const TARGET = { w: 24, h: 36 };

describe("ttfCacheKey", () => {
  it("returns the same key for the same inputs", () => {
    const a = ttfCacheKey(baseLayer(), null, TARGET);
    const b = ttfCacheKey(baseLayer(), null, TARGET);
    expect(a).toBe(b);
  });

  it("does not depend on layer.enabled (toggle shouldn't reshuffle)", () => {
    const on = baseLayer();
    const off = { ...baseLayer(), enabled: false };
    expect(ttfCacheKey(on, null, TARGET)).toBe(ttfCacheKey(off, null, TARGET));
  });

  it("changes when paletteSeed changes (reroll invalidates cache)", () => {
    const a = ttfCacheKey(baseLayer(), null, TARGET);
    const b = ttfCacheKey({ ...baseLayer(), paletteSeed: 99 }, null, TARGET);
    expect(a).not.toBe(b);
  });

  it("changes when glyphColor palette changes", () => {
    const mono = ttfCacheKey(baseLayer(), null, TARGET);
    const palette = ttfCacheKey(
      { ...baseLayer(), glyphColor: ["#ff0000", "#00ff00"] },
      null,
      TARGET,
    );
    expect(mono).not.toBe(palette);
  });

  it("changes when the target tile size changes (HD ↔ analog)", () => {
    const hd = ttfCacheKey(baseLayer(), null, { w: 24, h: 36 });
    const analog = ttfCacheKey(baseLayer(), null, { w: 12, h: 18 });
    expect(hd).not.toBe(analog);
  });

  it("changes when the source asset hash changes (new file upload)", () => {
    const a = ttfCacheKey(baseLayer(), null, TARGET);
    const replaced = baseLayer();
    replaced.source = { kind: "user", hash: "z".repeat(64), name: "x.ttf", mime: "font/ttf" };
    const b = ttfCacheKey(replaced, null, TARGET);
    expect(a).not.toBe(b);
  });

  it("changes when size / outline / stretch / offsets change", () => {
    const base = ttfCacheKey(baseLayer(), null, TARGET);
    expect(ttfCacheKey({ ...baseLayer(), size: 24 }, null, TARGET)).not.toBe(base);
    expect(ttfCacheKey({ ...baseLayer(), outlineThickness: 2 }, null, TARGET)).not.toBe(base);
    expect(ttfCacheKey({ ...baseLayer(), vStretch: 1.5 }, null, TARGET)).not.toBe(base);
    expect(
      ttfCacheKey({ ...baseLayer(), glyphOffset: { x: 1, y: 0 } }, null, TARGET),
    ).not.toBe(base);
  });

  it("changes when layer.id changes (distinct layers stay independent)", () => {
    const a = ttfCacheKey(baseLayer(), null, TARGET);
    const b = ttfCacheKey({ ...baseLayer(), id: "ttf-b" }, null, TARGET);
    expect(a).not.toBe(b);
  });

  it("folds doc-level rngSeed into the key when layer has no paletteSeed", () => {
    // Old-migration path: if a layer is missing paletteSeed (shouldn't happen
    // post-migration, but the code supports it), the doc seed still
    // differentiates.
    const layer = baseLayer();
    delete (layer as { paletteSeed?: number }).paletteSeed;
    expect(ttfCacheKey(layer, 1, TARGET)).not.toBe(ttfCacheKey(layer, 2, TARGET));
  });
});

describe("isSvgSource", () => {
  // Glyph overrides accept SVG. Detection needs to be permissive about MIME
  // because some OSes / drag-drop flows don't populate it — filename fallback
  // keeps those working.

  it("detects SVG via the canonical MIME type", () => {
    expect(isSvgSource("image/svg+xml", "anything.bin")).toBe(true);
  });

  it("detects SVG via filename extension when MIME is missing", () => {
    expect(isSvgSource("", "icon.svg")).toBe(true);
  });

  it("is case-insensitive on the extension", () => {
    expect(isSvgSource("", "LOGO.SVG")).toBe(true);
    expect(isSvgSource("", "LoGo.Svg")).toBe(true);
  });

  it("does NOT trigger on PNG / JPEG / BMP", () => {
    expect(isSvgSource("image/png", "a.png")).toBe(false);
    expect(isSvgSource("image/jpeg", "a.jpg")).toBe(false);
    expect(isSvgSource("image/bmp", "a.bmp")).toBe(false);
  });

  it("does NOT trigger on filenames that merely contain 'svg' mid-string", () => {
    expect(isSvgSource("image/png", "my-svg-icons.png")).toBe(false);
    expect(isSvgSource("", "svg-logo-renamed.gif")).toBe(false);
  });
});
