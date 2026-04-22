// Ephemeral UI state — not part of the saved project document.
// Lives in Preact signals so any component can subscribe.

import { signal } from "@preact/signals";

/** Currently-selected glyph code (0..511), or null if nothing's selected. */
export const selectedGlyph = signal<number | null>(null);
