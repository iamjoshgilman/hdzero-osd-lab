// Authoritative ProjectDoc type — the single JSON source of truth for the app.
// Every UI action is a pure transformation on this document; compose() is a
// pure function of it. See PLAN.md §5 for the narrative.

import type { SubsetName } from "@/compositor/constants";

export type HexColor = `#${string}`;
export type ElementId = string;

/** Monotonically bumped when a breaking schema change ships. Loaders migrate. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface ProjectDoc {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  meta: {
    name: string;
    /** ISO 8601. */
    createdAt: string;
    /** ISO 8601. */
    updatedAt: string;
    /** Null = unseeded (each compose() shuffles palettes fresh). Number = deterministic. */
    rngSeed: number | null;
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
    /** Optional FPV still-frame rendered behind the OSD preview. */
    background?: AssetRef;
  };
  decorations: {
    craftName: CraftNameDecoration;
    stats: StatsDecoration[];
  };
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
  enabled: boolean;
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
