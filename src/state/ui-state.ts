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

/**
 * Font preview zoom. Stored per-mode so switching between HD and analog
 * doesn't carry a 2× analog zoom over to the 384×1152 HD canvas (that made
 * HD appear oversized). Null in a slot = "auto-pick based on mode" (1× for
 * HD, 2× for analog since the native 192×288 atlas is tiny). Lives as a
 * signal so tab-switching doesn't remount the state away either.
 */
export const fontPreviewZoom = signal<{ hd: number | null; analog: number | null }>({
  hd: null,
  analog: null,
});

/**
 * Persistence / storage error surface. Non-null = the app has had trouble
 * writing to or reading from IndexedDB and the user should know their work
 * might not survive. AppShell renders a persistent banner when this is set;
 * the various error paths (autosave catch, putAsset quota failure, IDB
 * unavailable in private browsing) set the message from their perspective.
 * Cleared on the next successful persist so transient hiccups self-heal.
 */
export const persistenceError = signal<string | null>(null);
