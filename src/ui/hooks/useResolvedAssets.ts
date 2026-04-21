// React hook that walks the ProjectDoc, fetches every referenced asset from
// IndexedDB, runs the appropriate loader, and returns a ResolvedAssets bundle
// ready for compose(). For v0.1.0 only bitmap layers are supported in the UI;
// mcm/ttf/logo will land in v0.1.x as those editors come online.

import { useEffect } from "preact/hooks";
import { signal, type Signal } from "@preact/signals";
import { project } from "@/state/store";
import { getAsset } from "@/state/assets";
import { decodeBmp } from "@/loaders/bmp";
import { imageRgbaToTile } from "@/loaders/image-to-tile";
import {
  emptyResolvedAssets,
  type ResolvedAssets,
} from "@/compositor/compose";
import type { ProjectDoc } from "@/state/project";

export interface ResolvedAssetsState {
  assets: Signal<ResolvedAssets>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
}

const state: ResolvedAssetsState = {
  assets: signal<ResolvedAssets>(emptyResolvedAssets()),
  loading: signal<boolean>(false),
  error: signal<string | null>(null),
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
      try {
        const next = emptyResolvedAssets();
        await loadBitmapLayers(doc, next);
        await loadOverrideTiles(doc, next);
        if (!cancelled) {
          state.assets.value = next;
        }
      } catch (err) {
        if (!cancelled) {
          state.error.value = err instanceof Error ? err.message : String(err);
        }
      } finally {
        if (!cancelled) state.loading.value = false;
      }
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

async function loadBitmapLayers(doc: ProjectDoc, out: ResolvedAssets): Promise<void> {
  const hashes = new Set<string>();
  for (const layer of doc.font.layers) {
    if (layer.kind === "bitmap" && layer.source.kind === "user") {
      hashes.add(layer.source.hash);
    }
  }
  for (const hash of hashes) {
    const rec = await getAsset(hash);
    if (!rec) continue;
    const rgb = decodeBmp(rec.bytes);
    out.bitmap.set(hash, rgb);
  }
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
