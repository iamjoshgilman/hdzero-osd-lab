// React hook that walks the ProjectDoc, fetches every referenced asset from
// IndexedDB, runs the appropriate loader, and returns a ResolvedAssets bundle
// ready for compose(). For v0.1.0 only bitmap layers are supported in the UI;
// mcm/ttf/logo will land in v0.1.x as those editors come online.

import { useEffect } from "preact/hooks";
import { signal, type Signal } from "@preact/signals";
import { project } from "@/state/store";
import { getAsset } from "@/state/assets";
import { decodeBmp, normalizeHdOsdFont } from "@/loaders/bmp";
import { imageRgbaToTile } from "@/loaders/image-to-tile";
import { rasterizeTtfSubset } from "@/loaders/ttf";
import { createRng } from "@/compositor/palette";
import { GLYPH_SUBSETS, LOGO_SIZE } from "@/compositor/constants";
import {
  emptyResolvedAssets,
  type ResolvedAssets,
} from "@/compositor/compose";
import type { RgbaImage } from "@/compositor/types";
import type { LogoLayer, ProjectDoc, TtfLayer } from "@/state/project";

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
    let cancelled = false;

    const run = async (doc: ProjectDoc) => {
      state.loading.value = true;
      state.error.value = null;
      const errs: Record<string, string> = {};
      try {
        const next = emptyResolvedAssets();
        await loadBitmapLayers(doc, next, errs);
        await loadTtfLayers(doc, next, errs);
        await loadLogoLayers(doc, next, errs);
        await loadOverrideTiles(doc, next);
        if (!cancelled) {
          state.assets.value = next;
          state.layerErrors.value = errs;
        }
        await syncBgImage(doc, cancelled);
      } catch (err) {
        if (!cancelled) {
          state.error.value = err instanceof Error ? err.message : String(err);
        }
      } finally {
        if (!cancelled) state.loading.value = false;
      }
    };

    const syncBgImage = async (doc: ProjectDoc, wasCancelled: boolean) => {
      const ref = doc.osdLayout.background;
      if (!ref || ref.kind !== "user") {
        if (!wasCancelled) {
          state.bgImage.value?.close?.();
          state.bgImage.value = null;
        }
        return;
      }
      const rec = await getAsset(ref.hash);
      if (!rec || wasCancelled) return;
      const blob = new Blob([rec.bytes], { type: rec.mime });
      const bitmap = await createImageBitmap(blob);
      if (wasCancelled) {
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
      cancelled = true;
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
 * Rasterize every enabled TTF layer. Each layer produces its own TileMap
 * keyed by layer.id (not asset hash) since two layers can share a TTF but
 * render with different sizes / colors / subsets.
 */
async function loadTtfLayers(
  doc: ProjectDoc,
  out: ResolvedAssets,
  errs: Record<string, string>,
): Promise<void> {
  for (const layer of doc.font.layers) {
    if (layer.kind !== "ttf") continue;
    if (!layer.enabled) continue;
    if (layer.source.kind !== "user") continue;
    const rec = await getAsset(layer.source.hash);
    if (!rec) {
      errs[layer.id] = "asset not found in IndexedDB";
      continue;
    }
    try {
      const tiles = await rasterizeOneTtfLayer(layer, rec.bytes);
      out.ttf.set(layer.id, tiles);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errs[layer.id] = msg;
      console.error(`TTF layer "${layer.id}" failed to rasterize:`, err);
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
      const sized = await scaleImageToLogoSlot(rec.bytes, rec.mime, layer.slot);
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
  slot: LogoLayer["slot"],
): Promise<RgbaImage> {
  const target = LOGO_SIZE[slot];
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
): Promise<import("@/compositor/types").TileMap> {
  const codes = GLYPH_SUBSETS[layer.subset];
  const seed = project.value.meta.rngSeed;
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
  });
}

async function loadOverrideTiles(doc: ProjectDoc, out: ResolvedAssets): Promise<void> {
  for (const [codeStr, override] of Object.entries(doc.font.overrides)) {
    if (override.source.kind !== "user") continue;
    const rec = await getAsset(override.source.hash);
    if (!rec) continue;
    const rgba = await decodeImageToRgba(rec.bytes, rec.mime);
    if (!rgba) continue;
    const tile = imageRgbaToTile(rgba, override.tintColor ? { tintColor: override.tintColor } : {});
    out.overrides.set(Number(codeStr), tile);
  }
}

async function decodeImageToRgba(
  bytes: ArrayBuffer,
  mime: string,
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
  // PNG / JPG / others: decode via Canvas.
  const blob = new Blob([bytes], { type: mime });
  const bmp = await createImageBitmap(blob);
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
}
