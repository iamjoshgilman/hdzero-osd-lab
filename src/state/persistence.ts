// Project JSON serialization. The full bundled-with-assets .zip format lands
// in v1.0; for now we persist the document alone. Assets live in IndexedDB and
// are referenced by hash, so a bare JSON export round-trips cleanly as long as
// the destination system also has those hashes available (or can re-upload).

import type { ProjectDoc } from "./project";
import { CURRENT_SCHEMA_VERSION } from "./project";

/** Pretty-printed JSON suitable for a file download. */
export function projectToJson(doc: ProjectDoc): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse a JSON string back into a ProjectDoc. Validates `schemaVersion`;
 * future schema bumps will dispatch to a migration here.
 */
export function projectFromJson(json: string): ProjectDoc {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("projectFromJson: parsed value is not an object");
  }
  const doc = parsed as Partial<ProjectDoc>;
  if (doc.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `projectFromJson: unsupported schemaVersion ${String(doc.schemaVersion)} ` +
        `(current is ${CURRENT_SCHEMA_VERSION})`,
    );
  }
  if (!doc.meta || !doc.font || !doc.osdLayout || !doc.decorations) {
    throw new Error("projectFromJson: missing required top-level fields");
  }
  return doc as ProjectDoc;
}
