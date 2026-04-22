// Top-level font compositor. Takes a ProjectDoc plus pre-loaded binary
// assets and returns a 384×1152 RGB atlas ready for writeBmp24.
//
// compose() is a PURE FUNCTION of its inputs. All I/O (reading BMPs, parsing
// MCM, rasterizing TTF, decoding images) happens in loaders/ ahead of time,
// and the results are passed in via the ResolvedAssets param. This split
// keeps compose() web-worker-safe and trivially unit-testable.
//
// Layer precedence (matches fontbuilder.py):
//   1. Start with COLOR_TRANSPARENT everywhere (chroma-gray).
//   2. Apply each enabled layer in order. Later layers win.
//   3. Apply per-tile overrides. Overrides always win.

import type { ProjectDoc, Layer, BitmapLayer, McmLayer, TtfLayer, LogoLayer } from "@/state/project";
import {
  GLYPH_SUBSETS,
  SUBSET_TARGET_OFFSET,
  FONT_SIZE,
  LOGO_SIZE,
  COLOR_TRANSPARENT,
  codeToOrigin,
} from "./constants";
import type { RgbImage, RgbaImage, Tile, TileMap } from "./types";
import { createAtlas, blitTile, blitRgbaRegionIntoAtlas, extractTile, tintTileInPlace } from "./atlas";
import { createRng, parseHex } from "./palette";

/**
 * Pre-loaded assets keyed by the thing that needs them.
 *
 * - `bitmap` holds full 384×1152 RGB atlases parsed from community BMPs; keyed
 *   by the asset's content hash (same source ⇒ same atlas, regardless of
 *   which layer uses it).
 * - `mcm` holds per-glyph tile maps parsed from .mcm files. Keyed by LAYER id
 *   because the same MCM may be colored differently per layer.
 * - `ttf` holds per-glyph tile maps rasterized from a TTF. Keyed by LAYER id
 *   (size/color/stretch vary per layer).
 * - `logo` holds RGBA images resized to the layer's slot (btfl 576×144, inav
 *   240×144, mini 120×36). Keyed by LAYER id.
 * - `overrides` holds single 24×36 RGB tiles; keyed by the glyph code they
 *   write to (matches `project.font.overrides` map).
 */
export interface ResolvedAssets {
  bitmap: Map<string, RgbImage>;
  mcm: Map<string, TileMap>;
  ttf: Map<string, TileMap>;
  logo: Map<string, RgbaImage>;
  overrides: Map<number, Tile>;
}

/** An empty asset bundle for testing or "no assets needed" compositions. */
export function emptyResolvedAssets(): ResolvedAssets {
  return {
    bitmap: new Map(),
    mcm: new Map(),
    ttf: new Map(),
    logo: new Map(),
    overrides: new Map(),
  };
}

export interface ComposeOptions {
  /** Override the project's RNG seed just for this run. Null = Math.random. */
  rngSeed?: number | null;
}

/**
 * Compose a font atlas from the project document and pre-loaded assets.
 * Returns a 384*1152*3 = 1,327,104-byte RGB buffer.
 */
export function compose(
  project: ProjectDoc,
  assets: ResolvedAssets = emptyResolvedAssets(),
  options: ComposeOptions = {},
): Uint8ClampedArray {
  const atlas = createAtlas(COLOR_TRANSPARENT);
  const seed = options.rngSeed !== undefined ? options.rngSeed : project.meta.rngSeed;
  // RNG is shared across layers so palette shuffling is reproducible per-seed
  // regardless of whether a given layer is enabled (layers still advance the
  // stream when they draw, which gives the whole composition a single coherent
  // random sequence).
  const rng = createRng(seed);

  for (const layer of project.font.layers) {
    if (!layer.enabled) continue;
    applyLayer(atlas, layer, assets, rng);
  }

  // Per-tile overrides always win.
  for (const [codeStr] of Object.entries(project.font.overrides)) {
    const code = Number(codeStr);
    const tile = assets.overrides.get(code);
    if (tile) blitTile(atlas, tile, code);
  }

  // Per-tile color tints: final post-composite pass. Multiplicative so
  // outlines stay dark and fills take the target hue. `?? {}` guards old
  // project JSONs that predate v0.2.5.
  for (const [codeStr, tintHex] of Object.entries(project.font.tints ?? {})) {
    const code = Number(codeStr);
    tintTileInPlace(atlas, code, parseHex(tintHex));
  }

  return atlas;
}

// ----------------------------------------------------------------------------
// Layer dispatch
// ----------------------------------------------------------------------------

function applyLayer(
  atlas: Uint8ClampedArray,
  layer: Layer,
  assets: ResolvedAssets,
  rng: () => number,
): void {
  switch (layer.kind) {
    case "bitmap":
      applyBitmapLayer(atlas, layer, assets);
      return;
    case "mcm":
      applyTileMapLayer(atlas, layer.subset, assets.mcm.get(layer.id));
      return;
    case "ttf":
      applyTileMapLayer(atlas, layer.subset, assets.ttf.get(layer.id));
      // rng kept in the signature for future per-layer palette randomness
      // (loaders currently pre-resolve palette colors before tile render)
      void rng;
      return;
    case "logo":
      applyLogoLayer(atlas, layer, assets);
      return;
  }
}

/** Copy glyphs from a bitmap atlas into matching slots in the target atlas. */
function applyBitmapLayer(
  atlas: Uint8ClampedArray,
  layer: BitmapLayer,
  assets: ResolvedAssets,
): void {
  const hash = refHash(layer.source);
  if (!hash) return;
  const source = assets.bitmap.get(hash);
  if (!source) return;
  if (source.width !== FONT_SIZE.w || source.height !== FONT_SIZE.h) {
    // Bitmap base fonts must be pre-normalized to the atlas size by loaders.
    throw new Error(
      `compose: bitmap layer "${layer.id}" source is ${source.width}×${source.height}, ` +
        `expected ${FONT_SIZE.w}×${FONT_SIZE.h}`,
    );
  }
  const codes = GLYPH_SUBSETS[layer.subset];
  const offset = SUBSET_TARGET_OFFSET[layer.subset] ?? 0;
  for (const code of codes) {
    const tile = extractTile(source.data, code);
    blitTile(atlas, tile, code + offset);
  }
}

/** Used by mcm/ttf layers: their loader pre-produced a TileMap, we just blit. */
function applyTileMapLayer(
  atlas: Uint8ClampedArray,
  subset: BitmapLayer["subset"],
  tileMap: TileMap | undefined,
): void {
  if (!tileMap) return;
  const codes = GLYPH_SUBSETS[subset];
  const offset = SUBSET_TARGET_OFFSET[subset] ?? 0;
  for (const code of codes) {
    const tile = tileMap.get(code);
    if (tile) blitTile(atlas, tile, code + offset);
  }
}

/**
 * Place a logo RGBA image into its slot. Behavior matches fontbuilder.py's
 * load_bitmap logo handling exactly so the resulting .bmp is compatible with
 * what Betaflight / HDZero expect.
 *
 * - mini (120×36): one straight strip at font-grid (col 11, row 5), i.e.
 *   pixel (264, 180). Covers glyph codes 91..95.
 * - btfl (576×144): the 24×4 tile banner gets "Z-wrapped" into a 16-wide
 *   atlas across rows 10..15. The exact slicing pattern is load-bearing;
 *   Betaflight reassembles this to 576×144 at draw time.
 * - inav (240×144): a similar wrap spanning codes 257..296. Rows 16..18.
 */
function applyLogoLayer(
  atlas: Uint8ClampedArray,
  layer: LogoLayer,
  assets: ResolvedAssets,
): void {
  const image = assets.logo.get(layer.id);
  if (!image) return;
  const expected = LOGO_SIZE[layer.slot];
  if (image.width !== expected.w || image.height !== expected.h) {
    throw new Error(
      `compose: logo layer "${layer.id}" expected ${expected.w}×${expected.h} for slot ` +
        `"${layer.slot}", got ${image.width}×${image.height}`,
    );
  }

  if (layer.slot === "mini") {
    // Straight 120×36 strip into (264, 180) — codes 91..95 contiguous row.
    blitRgbaRegionIntoAtlas(
      atlas,
      image.data,
      image.width,
      { sx: 0, sy: 0, sw: 120, sh: 36 },
      { x: 264, y: 180 },
    );
    return;
  }

  if (layer.slot === "btfl") {
    // Pattern from fontbuilder.py load_bitmap. Source is 576×144; target rows 10..15.
    const rects: Array<{
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      dx: number;
      dy: number;
    }> = [
      { sx: 0, sy: 0, sw: 384, sh: 36, dx: 0, dy: 360 },
      { sx: 384, sy: 0, sw: 192, sh: 36, dx: 0, dy: 396 },
      { sx: 0, sy: 36, sw: 192, sh: 36, dx: 192, dy: 396 },
      { sx: 192, sy: 36, sw: 384, sh: 36, dx: 0, dy: 432 },
      { sx: 0, sy: 72, sw: 384, sh: 36, dx: 0, dy: 468 },
      { sx: 384, sy: 72, sw: 192, sh: 36, dx: 0, dy: 504 },
      { sx: 0, sy: 108, sw: 192, sh: 36, dx: 192, dy: 504 },
      { sx: 192, sy: 108, sw: 384, sh: 36, dx: 0, dy: 540 },
    ];
    for (const r of rects) {
      blitRgbaRegionIntoAtlas(
        atlas,
        image.data,
        image.width,
        { sx: r.sx, sy: r.sy, sw: r.sw, sh: r.sh },
        { x: r.dx, y: r.dy },
      );
    }
    return;
  }

  // INAV logo (240×144) — pattern from fontbuilder.py.
  if (layer.slot === "inav") {
    const rects: Array<{
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      dx: number;
      dy: number;
    }> = [
      { sx: 0, sy: 0, sw: 240, sh: 36, dx: 24, dy: 576 },
      { sx: 0, sy: 36, sw: 120, sh: 36, dx: 264, dy: 576 },
      { sx: 120, sy: 36, sw: 120, sh: 36, dx: 0, dy: 612 },
      { sx: 0, sy: 72, sw: 240, sh: 36, dx: 120, dy: 612 },
      { sx: 0, sy: 108, sw: 24, sh: 36, dx: 360, dy: 612 },
      { sx: 24, sy: 108, sw: 216, sh: 36, dx: 0, dy: 648 },
    ];
    for (const r of rects) {
      blitRgbaRegionIntoAtlas(
        atlas,
        image.data,
        image.width,
        { sx: r.sx, sy: r.sy, sw: r.sw, sh: r.sh },
        { x: r.dx, y: r.dy },
      );
    }
    return;
  }
}

function refHash(ref: { kind: "builtin"; id: string } | { kind: "user"; hash: string }): string {
  return ref.kind === "user" ? ref.hash : `builtin:${ref.id}`;
}

// keep these utilities private-ish but exported for potential reuse
export { applyBitmapLayer, applyTileMapLayer, applyLogoLayer };

// Used in tests: expose the `codeToOrigin` re-export for convenience.
export { codeToOrigin };

// Dead-code-guard: a no-op reference that also silences unused-type warnings
// for the per-layer union members.
export type { BitmapLayer, McmLayer, TtfLayer, LogoLayer };
