// Project JSON serialization. The full bundled-with-assets .zip format lands
// in v1.0; for now we persist the document alone. Assets live in IndexedDB and
// are referenced by hash, so a bare JSON export round-trips cleanly as long as
// the destination system also has those hashes available (or can re-upload).

import type { ProjectDoc } from "./project";
import { CURRENT_SCHEMA_VERSION, newPaletteSeed } from "./project";

/** Pretty-printed JSON suitable for a file download. */
export function projectToJson(doc: ProjectDoc): string {
  return JSON.stringify(doc, null, 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse a JSON string back into a ProjectDoc. Validates shape at runtime
 * beyond TypeScript's compile-time contract — a stored project could be
 * corrupted (manual IDB edit, truncated write, stale schema) and we want
 * to fail loudly instead of casting garbage to ProjectDoc and crashing in
 * downstream code with harder-to-diagnose errors.
 *
 * Auto-migrates pre-v0.3.0 projects by filling `meta.mode = "hd"` if
 * absent. This is NOT a schemaVersion bump because the field defaults
 * cleanly — every old project was HD by definition since analog didn't
 * exist as a concept.
 */
export function projectFromJson(json: string): ProjectDoc {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) {
    throw new Error("projectFromJson: parsed value is not an object");
  }
  if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `projectFromJson: unsupported schemaVersion ${String(parsed.schemaVersion)} ` +
        `(current is ${CURRENT_SCHEMA_VERSION})`,
    );
  }
  if (
    !isRecord(parsed.meta) ||
    !isRecord(parsed.font) ||
    !isRecord(parsed.osdLayout) ||
    !isRecord(parsed.decorations)
  ) {
    throw new Error("projectFromJson: missing or malformed top-level fields");
  }
  // Shape-check the critical nested fields that downstream code relies on.
  if (typeof parsed.meta.name !== "string") {
    throw new Error("projectFromJson: meta.name is not a string");
  }
  if (!Array.isArray(parsed.font.layers)) {
    throw new Error("projectFromJson: font.layers is not an array");
  }
  if (!isRecord(parsed.font.overrides)) {
    throw new Error("projectFromJson: font.overrides is not an object");
  }
  if (!isRecord(parsed.osdLayout.elements)) {
    throw new Error("projectFromJson: osdLayout.elements is not an object");
  }
  // Auto-migrate: older saved projects predate the mode field. They were
  // all HD-targeted by definition since analog didn't exist yet.
  if (parsed.meta.mode === undefined) {
    parsed.meta.mode = "hd";
  } else if (parsed.meta.mode !== "hd" && parsed.meta.mode !== "analog") {
    throw new Error(
      `projectFromJson: meta.mode is "${String(parsed.meta.mode)}", expected "hd" or "analog"`,
    );
  }
  // Auto-migrate: TTF layers saved before per-layer paletteSeed existed.
  // Without a seed the rasterizer reshuffles palette picks every time the
  // resolver re-runs (tab switch, bg change, any doc mutation). Assigning a
  // seed now pins those picks.
  for (const layer of parsed.font.layers) {
    if (isRecord(layer) && layer.kind === "ttf" && layer.paletteSeed === undefined) {
      layer.paletteSeed = newPaletteSeed();
    }
  }
  if (isRecord(parsed.fontArchive)) {
    for (const slot of Object.values(parsed.fontArchive)) {
      if (!isRecord(slot) || !Array.isArray(slot.layers)) continue;
      for (const layer of slot.layers) {
        if (isRecord(layer) && layer.kind === "ttf" && layer.paletteSeed === undefined) {
          layer.paletteSeed = newPaletteSeed();
        }
      }
    }
  }
  return parsed as unknown as ProjectDoc;
}
