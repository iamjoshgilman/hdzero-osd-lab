// Shared helpers that seed the project with assets (sample fonts, etc.).
// Pulled out so both the LayersPanel "Load sample" button and the AppShell
// first-run auto-bootstrap hit the same code path.

import { mutate } from "./store";
import { putAsset } from "./assets";
import type { BitmapLayer } from "./project";

/**
 * Fetch a bundled sample BMP from `/sample-fonts/<filename>`, store its bytes
 * in IndexedDB, and push a new ALL-subset bitmap layer referencing it.
 * Throws if the file can't be fetched.
 */
export async function addSampleFontAsBaseLayer(
  filename: string,
  displayName: string,
): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}sample-fonts/${filename}`);
  if (!res.ok) {
    throw new Error(
      `Sample font "${filename}" not found (HTTP ${res.status}) at ${res.url}`,
    );
  }
  const buf = await res.arrayBuffer();
  const hash = await putAsset(buf, { name: displayName, mime: "image/bmp" });
  mutate((doc) => {
    const layer: BitmapLayer = {
      id: `base-${Date.now()}`,
      kind: "bitmap",
      source: { kind: "user", hash, name: displayName, mime: "image/bmp" },
      subset: "ALL",
      enabled: true,
    };
    doc.font.layers.push(layer);
  });
}
