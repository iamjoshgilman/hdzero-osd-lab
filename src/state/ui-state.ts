// Ephemeral UI state — not part of the saved project document.
// Lives in Preact signals so any component can subscribe.

import { signal } from "@preact/signals";

/** Currently-selected glyph code (0..511), or null if nothing's selected. */
export const selectedGlyph = signal<number | null>(null);

/** Which major workspace tab is visible. */
export type ViewMode = "font" | "osd" | "decoration" | "howto" | "resources";
export const currentView = signal<ViewMode>("font");

/** Currently-selected OSD element id (in the OSD Preview tab), or null. */
export const selectedOsdElement = signal<string | null>(null);
