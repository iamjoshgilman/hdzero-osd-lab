// Authoritative ProjectDoc type — the single JSON source of truth for the app.
// Every UI action is a pure transformation on this document; compose() is a
// pure function of it. See PLAN.md §5 for the narrative.

import type { SubsetName } from "@/compositor/constants";

export type HexColor = `#${string}`;
export type ElementId = string;

/** Monotonically bumped when a breaking schema change ships. Loaders migrate. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Target OSD platform this project builds for. Changes file format on
 * export (BMP for HD, MCM for analog), atlas dimensions, on-goggle grid
 * size, and which file types the base-font drop accepts. Pre-v0.3.0
 * projects predate this field and get auto-migrated to "hd" on load.
 */
export type OsdMode = "hd" | "analog";

export interface ProjectDoc {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  meta: {
    name: string;
    /** ISO 8601. */
    createdAt: string;
    /** ISO 8601. */
    updatedAt: string;
    /**
     * Null = unseeded (each compose() shuffles palettes fresh). Number =
     * deterministic.
     *
     * Intentionally **shared across modes**, not archived — rngSeed only
     * affects HD TTF palette layers (analog TTFs render monochrome without
     * palette randomness). Per-mode archival would add state for zero
     * user-visible benefit.
     */
    rngSeed: number | null;
    /** Target OSD platform. See OsdMode. */
    mode: OsdMode;
  };
  font: {
    /** Ordered compositor layers. Later layers overwrite earlier tiles at the same codes. */
    layers: Layer[];
    /** Per-tile image override. Always wins after the layer stack resolves. Key = 0..511. */
    overrides: Record<number, OverrideSource>;
    /**
     * Per-tile color tint applied as a final post-composite pass. Each non-
     * chroma-gray pixel of the tile is multiplied by the target color, so
     * outlines stay dark and fills take the hue. Key = 0..511 glyph code.
     * Optional so projects created before v0.2.5 round-trip cleanly.
     */
    tints?: Record<number, HexColor>;
  };
  /**
   * Archive of the OTHER mode's font composition so pilots can work on an
   * HDZero and an analog build side-by-side without mixing layers. When
   * ModeToggle flips the active mode, it tucks the current `font` into
   * `fontArchive[previousMode]` and swaps in `fontArchive[nextMode]` (or a
   * blank font if that slot's empty). So `doc.font` always represents the
   * currently-active mode's composition — no downstream consumer branching.
   */
  fontArchive?: {
    hd?: FontSlice;
    analog?: FontSlice;
  };
  osdLayout: {
    /** Betaflight OSD element layout — user's in-flight positions, not the font. */
    elements: Record<
      ElementId,
      {
        x: number;
        y: number;
        enabled: boolean;
        /** User-typed text override (craft name, pilot name, custom messages). */
        customText?: string;
      }
    >;
    /**
     * Separate layout map for analog mode. HD (53×20) and analog (30×16)
     * have very different spatial budgets, so pilots get different positions
     * per mode — switching modes doesn't mangle the other mode's layout.
     * Absent means "not yet customized for analog"; OsdCanvas falls back to
     * clamping the HD default positions into the analog grid.
     */
    elementsAnalog?: Record<
      ElementId,
      {
        x: number;
        y: number;
        enabled: boolean;
        customText?: string;
      }
    >;
    /** Optional FPV still-frame rendered behind the OSD preview. */
    background?: AssetRef;
  };
  /**
   * Legacy decoration payloads (the original Phase 3 "Decoration Generator"
   * concept that got deferred in favor of the v0.3.0 analog mode pivot).
   * Currently unused by any UI but kept in the schema for forward-compat.
   * Intentionally **shared across modes** — decorations are freeform
   * Craft Name / warning-string payloads that the goggle renders with
   * whatever font is active, so there's no per-mode state to preserve.
   */
  decorations: {
    craftName: CraftNameDecoration;
    stats: StatsDecoration[];
  };
}

/**
 * Shape of the `font` slice. Extracted so the fontArchive slots can reference
 * the same type without pulling in the rest of ProjectDoc.
 */
export interface FontSlice {
  layers: Layer[];
  overrides: Record<number, OverrideSource>;
  tints?: Record<number, HexColor>;
}

/** An empty font slice. Used by the mode-toggle's "load archive or blank" path. */
export function emptyFontSlice(): FontSlice {
  return { layers: [], overrides: {}, tints: {} };
}

/**
 * Mutate a project doc in place to switch target OSD modes. Archives the
 * current font under the old mode's key and swaps in the new mode's font
 * (from archive, or a blank slice if this is the first visit to that mode).
 * So `doc.font` always represents the currently-active mode's composition
 * — consumers never need to branch. Idempotent when called with the same
 * mode as the current one.
 */
export function switchMode(doc: ProjectDoc, next: OsdMode): void {
  if (doc.meta.mode === next) return;
  if (!doc.fontArchive) doc.fontArchive = {};
  doc.fontArchive[doc.meta.mode] = doc.font;
  doc.font = doc.fontArchive[next] ?? emptyFontSlice();
  doc.meta.mode = next;
}

/** Discriminated union; each layer kind knows how to contribute tiles. */
export type Layer = BitmapLayer | McmLayer | TtfLayer | LogoLayer;

export interface BitmapLayer {
  id: string;
  kind: "bitmap";
  source: AssetRef;
  /** Which glyph subset of the source to blit into the target atlas. */
  subset: SubsetName;
  enabled: boolean;
}

export interface McmLayer {
  id: string;
  kind: "mcm";
  source: AssetRef;
  subset: SubsetName;
  glyphColor: HexColor;
  outlineColor: HexColor;
  enabled: boolean;
}

export interface TtfLayer {
  id: string;
  kind: "ttf";
  source: AssetRef;
  subset: SubsetName;
  /** Base font pixel size. Matches fontbuilder.py default=15. */
  size: number;
  /** Outline thickness in px, float allowed. fontbuilder.py default=1.5. */
  outlineThickness: number;
  /** Vertical stretch multiplier. 1=original, 2=double height. fontbuilder.py default=1.5. */
  vStretch: number;
  glyphOffset: { x: number; y: number };
  outlineOffset: { x: number; y: number };
  /** Single hex or palette (length ≥ 2). Palette mode picks per-glyph via random.choice. */
  glyphColor: HexColor | HexColor[];
  outlineColor: HexColor | HexColor[];
  /** Supersampling factor passed to the rasterizer. fontbuilder.py default=8. */
  superSampling: number;
  /**
   * Per-layer seed driving palette picks. Stable so tiles don't re-shuffle
   * on every tab switch / unrelated doc mutation. Reroll button regenerates
   * this; older projects get one assigned on load.
   */
  paletteSeed?: number;
  enabled: boolean;
}

/** Generate a fresh 32-bit palette seed. */
export function newPaletteSeed(): number {
  return (Math.random() * 0x1_0000_0000) | 0;
}

export interface LogoLayer {
  id: string;
  kind: "logo";
  source: AssetRef;
  /** btfl = 576×144 big banner, inav = 240×144, mini = 120×36 callsign logo. */
  slot: "btfl" | "inav" | "mini";
  enabled: boolean;
}

export interface OverrideSource {
  source: AssetRef;
  /** Optional tint. Non-transparent pixels are multiplied by this color. */
  tintColor?: HexColor;
  /**
   * Optional multiplier on the default aspect-fit scale used by
   * imageRgbaToTile. `1.0` (or missing) = fit the tile with chroma-gray
   * letterboxing — the original behavior. `> 1` scales up past the fit
   * (content may clip at tile edges); `< 1` leaves more padding. Useful for
   * icons whose own viewBox includes a chunk of internal padding that makes
   * them read small inside the 24×36 / 12×18 tile.
   */
  scale?: number;
}

/** A binary blob referenced by the document. Concrete bytes live in the AssetStore. */
export type AssetRef =
  | { kind: "builtin"; id: string }
  | { kind: "user"; hash: string; name: string; mime: string };

/** Craft Name = exactly 15 printable-ASCII slots. Each slot is a typed char or a glyph code. */
export interface CraftNameDecoration {
  slots: CraftNameSlot[];
  /** Derived payload; resolver keeps this in sync. Copy-to-clipboard uses it. */
  resolvedPayload: string;
}

export type CraftNameSlot = { kind: "char"; ch: string } | { kind: "glyph"; code: number };

export interface StatsDecoration {
  id: string;
  label: string;
  content: CraftNameSlot[];
}

// ----------------------------------------------------------------------------
// Factories
// ----------------------------------------------------------------------------

/** Build an empty, valid project. Used on app start and on "new project". */
export function createDefaultProject(): ProjectDoc {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name: "Untitled",
      createdAt: now,
      updatedAt: now,
      rngSeed: null,
      mode: "hd",
    },
    font: {
      layers: [],
      overrides: {},
      tints: {},
    },
    osdLayout: {
      elements: {},
    },
    decorations: {
      craftName: { slots: [], resolvedPayload: "" },
      stats: [],
    },
  };
}
