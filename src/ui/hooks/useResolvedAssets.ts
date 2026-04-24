// React hook that walks the ProjectDoc, fetches every referenced asset from
// IndexedDB, runs the appropriate loader, and returns a ResolvedAssets bundle
// ready for compose(). Handles bitmap, TTF, MCM, and logo layers plus
// per-tile overrides.

import { useEffect } from "preact/hooks";
import { signal, type Signal } from "@preact/signals";
import { project } from "@/state/store";
import { getAsset } from "@/state/assets";
import { decodeBmp, normalizeHdOsdFont } from "@/loaders/bmp";
import { imageRgbaToTile } from "@/loaders/image-to-tile";
import { rasterizeTtfSubset } from "@/loaders/ttf";
import { parseMcm, parseMcmNative } from "@/loaders/mcm";
import { createRng } from "@/compositor/palette";
import {
  GLYPH_SUBSETS,
  LOGO_SIZE,
  ANALOG_LOGO_SIZE,
  ANALOG_GLYPH_SIZE,
  GLYPH_SIZE,
} from "@/compositor/constants";
import {
  emptyResolvedAssets,
  type ResolvedAssets,
} from "@/compositor/compose";
import type { RgbaImage, TileMap } from "@/compositor/types";
import type { ProjectDoc, TtfLayer } from "@/state/project";

export interface ResolvedAssetsState {
  assets: Signal<ResolvedAssets>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  /** Per-layer error messages (layer.id → error). Surfaced inline in the layers list. */
  layerErrors: Signal<Record<string, string>>;
  /** OSD-preview background image, if the project has one. */
  bgImage: Signal<ImageBitmap | null>;
}

const state: ResolvedAssetsState = {
  assets: signal<ResolvedAssets>(emptyResolvedAssets()),
  loading: signal<boolean>(false),
  error: signal<string | null>(null),
  layerErrors: signal<Record<string, string>>({}),
  bgImage: signal<ImageBitmap | null>(null),
};

/**
 * Subscribe to the project signal and keep `state.assets` in sync with
 * whatever IndexedDB assets the current doc references. Returns the same
 * three signals every component shares.
 */
export function useResolvedAssets(): ResolvedAssetsState {
  useEffect(() => {
    // Each run() bumps `gen`. In-flight runs capture their myGen at start
    // and check isStale() before writing — this prevents races when the
    // user toggles mode (or rapidly mutates) while a previous async resolve
    // is still processing. Previously a single `cancelled` flag only
    // covered component unmount, so two concurrent runs could both write
    // to state.assets and whichever finished last would win — potentially
    // the wrong mode's tiles.
    let gen = 0;
    let disposed = false;

    const run = async (doc: ProjectDoc) => {
      const myGen = ++gen;
      const isStale = (): boolean => disposed || myGen !== gen;

      state.loading.value = true;
      state.error.value = null;
      const errs: Record<string, string> = {};
      try {
        const next = emptyResolvedAssets();
        await loadBitmapLayers(doc, next, errs);
        await loadTtfLayers(doc, next, errs);
        await loadMcmLayers(doc, next, errs);
        await loadLogoLayers(doc, next, errs);
        await loadOverrideTiles(doc, next, errs);
        if (!isStale()) {
          state.assets.value = next;
          state.layerErrors.value = errs;
        }
        await syncBgImage(doc, isStale);
      } catch (err) {
        if (!isStale()) {
          state.error.value = err instanceof Error ? err.message : String(err);
        }
      } finally {
        if (!isStale()) state.loading.value = false;
      }
    };

    const syncBgImage = async (doc: ProjectDoc, isStale: () => boolean) => {
      const ref = doc.osdLayout.background;
      if (!ref || ref.kind !== "user") {
        if (!isStale()) {
          state.bgImage.value?.close?.();
          state.bgImage.value = null;
        }
        return;
      }
      const rec = await getAsset(ref.hash);
      if (!rec || isStale()) return;
      const blob = new Blob([rec.bytes], { type: rec.mime });
      const bitmap = await createImageBitmap(blob);
      if (isStale()) {
        bitmap.close();
        return;
      }
      state.bgImage.value?.close?.();
      state.bgImage.value = bitmap;
    };

    run(project.value);
    const dispose = project.subscribe((doc) => {
      run(doc);
    });

    return () => {
      disposed = true;
      dispose();
    };
  }, []);

  return state;
}

async function loadBitmapLayers(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  for (const layer of doc.font.layers) {
    if (layer.kind !== "bitmap") continue;
    if (layer.source.kind !== "user") continue;
    const rec = await getAsset(layer.source.hash);
    if (!rec) {
      errs[layer.id] = "asset not found in IndexedDB";
      continue;
    }
    try {
      const rgb = decodeBmp(rec.bytes);
      // Auto-implode exploded 486×1350 community fonts down to the 384×1152
      // compact layout. Compact inputs pass through unchanged. Anything else
      // throws and surfaces to the UI as a per-layer error.
      const normalized = normalizeHdOsdFont(rgb);
      out.bitmap.set(layer.source.hash, normalized);
    } catch (err) {
      errs[layer.id] = err instanceof Error ? err.message : String(err);
    }
  }
}

/**
 * TTF rasterization is expensive and its output is a pure function of its
 * inputs. Without a cache, every project mutation (drag an OSD element,
 * change the background image, switch tabs and re-mount this hook) would
 * re-run the loader and re-rasterize every layer. For palette layers that
 * also means a fresh Math.random stream → glyphs shuffle to new colors on
 * every redraw. The cache keys tiles on a stable fingerprint of all
 * rasterization inputs so:
 *   - Unchanged layer → same TileMap reference, colors stay put.
 *   - Layer edited or paletteSeed rerolled → cache miss, fresh rasterize.
 */
const ttfTileCache = new Map<string, TileMap>();

export function ttfCacheKey(
  layer: TtfLayer,
  seed: number | null,
  targetSize: { w: number; h: number },
): string {
  const sourceKey =
    layer.source.kind === "user"
      ? `u:${layer.source.hash}`
      : `b:${layer.source.id}`;
  return JSON.stringify([
    layer.id,
    sourceKey,
    layer.subset,
    layer.size,
    layer.outlineThickness,
    layer.vStretch,
    layer.glyphOffset,
    layer.outlineOffset,
    layer.glyphColor,
    layer.outlineColor,
    layer.superSampling,
    layer.paletteSeed ?? null,
    seed,
    targetSize.w,
    targetSize.h,
  ]);
}

/**
 * Rasterize every enabled TTF layer. Each layer produces its own TileMap
 * keyed by layer.id (not asset hash) since two layers can share a TTF but
 * render with different sizes / colors / subsets.
 */
async function loadTtfLayers(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  const seed = doc.meta.rngSeed;
  const targetSize = doc.meta.mode === "analog" ? ANALOG_GLYPH_SIZE : GLYPH_SIZE;

  // Build the set of cache keys the current doc references so we can GC
  // entries for layers that were removed / had their params changed. We walk
  // ALL ttf layers (enabled or not) so that toggling a layer off-then-on
  // doesn't invalidate its cached palette picks.
  const liveKeys = new Set<string>();
  for (const layer of doc.font.layers) {
    if (layer.kind !== "ttf") continue;
    liveKeys.add(ttfCacheKey(layer, seed, targetSize));
  }

  for (const layer of doc.font.layers) {
    if (layer.kind !== "ttf") continue;
    if (!layer.enabled) continue;
    if (layer.source.kind !== "user") continue;

    const key = ttfCacheKey(layer, seed, targetSize);
    const cached = ttfTileCache.get(key);
    if (cached) {
      out.ttf.set(layer.id, cached);
      continue;
    }

    const rec = await getAsset(layer.source.hash);
    if (!rec) {
      errs[layer.id] = "asset not found in IndexedDB";
      continue;
    }
    try {
      const tiles = await rasterizeOneTtfLayer(layer, rec.bytes, seed, targetSize);
      ttfTileCache.set(key, tiles);
      out.ttf.set(layer.id, tiles);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errs[layer.id] = msg;
      console.error(`TTF layer "${layer.id}" failed to rasterize:`, err);
    }
  }

  for (const k of ttfTileCache.keys()) {
    if (!liveKeys.has(k)) ttfTileCache.delete(k);
  }
}

/**
 * Parse every enabled MCM layer into its TileMap. Each layer gets its own
 * entry keyed by layer.id (not asset hash) because the same .mcm can be
 * colored differently per layer — the parser bakes the ink colors into the
 * output tiles.
 *
 * HD mode uses parseMcm (2× upscaled to 24×36 HD tiles) with the layer's
 * stored glyph/outline colors. Analog mode uses parseMcmNative (native
 * 12×18) and FORCES pure white / pure black regardless of what the layer
 * stored — the MAX7456 chip renders only three states, and any soft-white
 * like HD's `#E0E0E0` default would show up in the preview as a middle
 * grey that gets flattened to pure white on MCM export anyway. Forcing
 * pure colors here keeps the preview truthful. The layer's HD colors are
 * preserved in the stored state for when the user flips back to HD mode.
 */
async function loadMcmLayers(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  const isAnalog = doc.meta.mode === "analog";
  const parse = isAnalog ? parseMcmNative : parseMcm;
  for (const layer of doc.font.layers) {
    if (layer.kind !== "mcm") continue;
    if (!layer.enabled) continue;
    if (layer.source.kind !== "user") continue;
    const rec = await getAsset(layer.source.hash);
    if (!rec) {
      errs[layer.id] = "asset not found in IndexedDB";
      continue;
    }
    try {
      const text = new TextDecoder().decode(rec.bytes);
      const malformed: number[] = [];
      const tiles = parse(text, {
        glyphColor: isAnalog ? "#ffffff" : layer.glyphColor,
        outlineColor: isAnalog ? "#000000" : layer.outlineColor,
        onMalformed: (code) => malformed.push(code),
      });
      if (tiles.size === 0) {
        errs[layer.id] =
          "no glyphs parsed from .mcm (check the file isn't a binary dump and has the 64-line-per-glyph ASCII format)";
        continue;
      }
      out.mcm.set(layer.id, tiles);
      if (malformed.length > 0) {
        // Non-fatal: the glyphs are still returned, just with some pixels
        // dropped to chroma-gray where source lines were too short. Flag
        // it so the pilot knows their font may render with gaps.
        errs[layer.id] =
          `${malformed.length} glyph${malformed.length === 1 ? "" : "s"} had malformed lines — some pixels may render as transparent. Source .mcm may be corrupted.`;
      }
    } catch (err) {
      errs[layer.id] = err instanceof Error ? err.message : String(err);
    }
  }
}

/**
 * Decode a user's uploaded logo image, scale it to the target slot dimensions
 * (aspect-preserved, letterboxed with chroma-gray), and hand the compositor an
 * RGBA buffer it can blit into codes 160..255 / 91..95 / 257..296.
 */
async function loadLogoLayers(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  const logoSize = doc.meta.mode === "analog" ? ANALOG_LOGO_SIZE : LOGO_SIZE;
  for (const layer of doc.font.layers) {
    if (layer.kind !== "logo") continue;
    if (!layer.enabled) continue;
    if (layer.source.kind !== "user") continue;
    const rec = await getAsset(layer.source.hash);
    if (!rec) {
      errs[layer.id] = "asset not found in IndexedDB";
      continue;
    }
    try {
      const target = logoSize[layer.slot];
      const sized = await scaleImageToLogoSlot(rec.bytes, rec.mime, target);
      out.logo.set(layer.id, sized);
    } catch (err) {
      errs[layer.id] = err instanceof Error ? err.message : String(err);
    }
  }
}

/**
 * Fit-scale an arbitrary user image into the exact pixel dimensions the
 * compositor expects for a given logo slot. Preserves aspect ratio;
 * non-matching inputs get letterboxed onto chroma-gray (transparent on the
 * goggle). Transparent-PNG inputs likewise resolve to chroma-gray in the
 * untouched regions so compositing on-goggle looks right.
 */
async function scaleImageToLogoSlot(
  bytes: ArrayBuffer,
  mime: string,
  target: { w: number; h: number },
): Promise<RgbaImage> {
  const blob = new Blob([bytes], { type: mime || "image/png" });
  const src = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(target.w, target.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    src.close();
    throw new Error("logo scaling failed: OffscreenCanvas 2D context unavailable");
  }
  ctx.fillStyle = "rgb(127,127,127)";
  ctx.fillRect(0, 0, target.w, target.h);
  // Aspect-fit (contain) — preserves the whole source image with chroma-gray
  // letterbox bars. Cover-fit would crop details; fit feels safer for logos.
  const srcAR = src.width / src.height;
  const tgtAR = target.w / target.h;
  let dw: number;
  let dh: number;
  let dx: number;
  let dy: number;
  if (srcAR > tgtAR) {
    dw = target.w;
    dh = target.w / srcAR;
    dx = 0;
    dy = (target.h - dh) / 2;
  } else {
    dh = target.h;
    dw = target.h * srcAR;
    dx = (target.w - dw) / 2;
    dy = 0;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, dx, dy, dw, dh);
  src.close();
  const img = ctx.getImageData(0, 0, target.w, target.h);
  return {
    width: target.w,
    height: target.h,
    data: new Uint8ClampedArray(img.data.buffer),
  };
}

async function rasterizeOneTtfLayer(
  layer: TtfLayer,
  bytes: ArrayBuffer,
  docSeed: number | null,
  targetSize: { w: number; h: number },
): Promise<TileMap> {
  const codes = GLYPH_SUBSETS[layer.subset];
  // Prefer the layer's own paletteSeed when present. This keeps palette picks
  // stable per-layer and lets the reroll button refresh just one layer without
  // dragging the rest of the project along. Falls back to the doc-level
  // rngSeed (null = Math.random) for older projects that haven't had the
  // migration run yet — in practice every persisted layer picks up a seed on
  // load (see projectFromJson).
  const seed = layer.paletteSeed ?? docSeed;
  return rasterizeTtfSubset(bytes, {
    codes,
    size: layer.size,
    outlineThickness: layer.outlineThickness,
    vStretch: layer.vStretch,
    glyphOffset: layer.glyphOffset,
    outlineOffset: layer.outlineOffset,
    glyphColor: layer.glyphColor,
    outlineColor: layer.outlineColor,
    superSampling: layer.superSampling,
    rng: createRng(seed),
    targetSize,
  });
}

/**
 * An override's decode can fail (unsupported format, corrupt bytes, external
 * SVG references that taint the canvas). Errors used to propagate up and
 * short-circuit the whole resolver, so a single bad override blanked all
 * override tiles. Per-override try/catch + `override:<code>` keys in the
 * shared errs map localize failures; the LayersPanel renders them inline
 * under each row.
 */
async function loadOverrideTiles(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  const targetSize = doc.meta.mode === "analog" ? ANALOG_GLYPH_SIZE : GLYPH_SIZE;
  for (const [codeStr, override] of Object.entries(doc.font.overrides)) {
    if (override.source.kind !== "user") continue;
    const errKey = `override:${codeStr}`;
    const rec = await getAsset(override.source.hash);
    if (!rec) {
      errs[errKey] = "asset not found in browser storage";
      continue;
    }
    try {
      const rgba = await decodeImageToRgba(rec.bytes, rec.mime, override.source.name);
      if (!rgba) {
        errs[errKey] = "image decoder returned no data";
        continue;
      }
      const opts: { targetSize: { w: number; h: number }; tintColor?: string } = {
        targetSize,
      };
      if (override.tintColor) opts.tintColor = override.tintColor;
      const tile = imageRgbaToTile(rgba, opts);
      out.overrides.set(Number(codeStr), tile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Most common failures at this point: tainted-canvas SecurityError for
      // SVGs that reference external resources, or an SVG with malformed
      // XML that Image.decode rejected.
      errs[errKey] = `decode failed: ${msg}`;
      console.error(`Override tile #${codeStr} failed to decode:`, err);
    }
  }
}

/**
 * True when the asset looks like SVG. Checks MIME first, then falls back to
 * the filename extension — some browsers don't set the MIME type when the
 * user drops an `.svg` file, so relying on MIME alone would silently skip
 * legit SVGs.
 */
export function isSvgSource(mime: string, name: string): boolean {
  if (mime === "image/svg+xml") return true;
  return /\.svg$/i.test(name);
}

async function decodeImageToRgba(
  bytes: ArrayBuffer,
  mime: string,
  name: string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray } | null> {
  if (mime === "image/bmp") {
    const rgb = decodeBmp(bytes);
    // Convert RGB to RGBA (alpha=255 everywhere). imageRgbaToTile then centers it.
    const rgba = new Uint8ClampedArray(rgb.width * rgb.height * 4);
    for (let i = 0, j = 0; i < rgb.data.length; i += 3, j += 4) {
      rgba[j] = rgb.data[i]!;
      rgba[j + 1] = rgb.data[i + 1]!;
      rgba[j + 2] = rgb.data[i + 2]!;
      rgba[j + 3] = 255;
    }
    return { width: rgb.width, height: rgb.height, data: rgba };
  }
  // SVG: createImageBitmap(blob) doesn't reliably rasterize SVGs across
  // Firefox/Safari (Chrome tolerates fixed-dimension SVGs, others often
  // reject or return a 0×0 bitmap). Route SVG through an HTMLImageElement
  // instead — it handles viewBox / width+height / dimensionless SVGs
  // consistently across browsers.
  if (isSvgSource(mime, name)) {
    return decodeSvgToRgba(bytes);
  }
  // PNG / JPG / others: decode via Canvas. The bitmap holds GPU memory —
  // close it in finally so exceptions mid-decode (tainted canvas, OOM,
  // etc.) don't leak.
  const blob = new Blob([bytes], { type: mime });
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return {
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(img.data.buffer),
    };
  } finally {
    bmp.close();
  }
}

/**
 * Rasterize an SVG asset to RGBA. Renders at a capped supersample (256px on
 * the longest edge, preserving the SVG's natural aspect) so the downstream
 * nearest-neighbor scaler in imageRgbaToTile has enough detail to produce a
 * crisp 24×36 / 12×18 tile without rasterizing directly at target res
 * (which, at 24×36, turns any detail into mush).
 *
 * Uses an object URL + HTMLImageElement because cross-browser SVG decode via
 * createImageBitmap is unreliable. `<img>` tag rendering does NOT execute
 * scripts inside the SVG — safer than `<object>` / `<iframe>` embedding.
 */
async function decodeSvgToRgba(
  bytes: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const blob = new Blob([bytes], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    // `await img.decode()` resolves once the SVG has been parsed and is
    // ready to draw. If the SVG is malformed it rejects with an error that
    // bubbles up to the caller's per-override try/catch.
    await img.decode();
    // Dimensionless SVGs (no width/height/viewBox) fall back to the browser
    // default, usually 300×150 — use that to preserve the "what you saw in
    // the browser" aspect ratio. Guard against 0 just in case.
    const naturalW = img.naturalWidth || 300;
    const naturalH = img.naturalHeight || 150;
    const aspect = naturalW / naturalH;
    const maxEdge = 256;
    let w: number;
    let h: number;
    if (aspect >= 1) {
      w = maxEdge;
      h = Math.max(1, Math.round(maxEdge / aspect));
    } else {
      h = maxEdge;
      w = Math.max(1, Math.round(maxEdge * aspect));
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("SVG decode: 2D context unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: new Uint8ClampedArray(data.data.buffer) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
