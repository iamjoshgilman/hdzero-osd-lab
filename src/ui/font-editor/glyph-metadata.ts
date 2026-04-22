// Pure helper that maps a glyph code (0..511) to human-readable metadata:
// which GLYPH_SUBSETS entries contain it, a single "best-fit" category for
// coloring, and whether the firmware actually uses the slot (or if it's a
// decorative overlay area the user can repaint freely).
//
// No Preact, no DOM, no state: easy to unit test in isolation.

import { GLYPH_SUBSETS, type SubsetName } from "@/compositor/constants";

export type GlyphCategory =
  | "letter"
  | "number"
  | "special"
  | "icon"
  | "logo"
  | "unused";

export interface GlyphMetadata {
  code: number;
  /** Printable ASCII 32..126 mapped to its character, otherwise null. */
  asciiChar: string | null;
  /** Every GLYPH_SUBSETS entry whose code list contains this code. Excludes the "ALL" catch-all. */
  subsets: SubsetName[];
  /** Single best-fit category for coloring overlays. */
  category: GlyphCategory;
  /**
   * True if firmware uses this code to render an element (letters, digits,
   * specials, icons). False for decorative slots (logo banners, unused slots)
   * where overriding the tile only changes what the pilot sees when they
   * reference it via Craft Name / warning strings.
   */
  isUsable: boolean;
}

/**
 * Tailwind-friendly hex colors chosen to be readable over the chroma-gray
 * atlas and to survive the alpha-0.18 overlay used in FontPreview.
 */
export const CATEGORY_COLORS: Record<GlyphCategory, string> = {
  letter: "#9cdcfe",
  number: "#00ffaa",
  special: "#ffb000",
  icon: "#ff00ff",
  logo: "#ff6bcb",
  unused: "#3a4151",
};

/** Human-facing label for each category. */
export const CATEGORY_LABELS: Record<GlyphCategory, string> = {
  letter: "Letter",
  number: "Number",
  special: "Special",
  icon: "Icon",
  logo: "Logo",
  unused: "Unused",
};

/**
 * Subsets that resolve to each category. Ordered so the first-match wins; see
 * `categoryPriority` below for the priority actually applied to a glyph code.
 */
const SUBSETS_BY_CATEGORY: Record<Exclude<GlyphCategory, "unused">, SubsetName[]> = {
  logo: ["BTFL_LOGO", "BTFL_MINILOGO", "INAV_LOGO"],
  icon: [
    "BTFL_VALUES",
    "BTFL_UNITS",
    "BTFL_AHI",
    "BTFL_COMPASS",
    "BTFL_BATTERY",
    "BTFL_ARROW",
    "BTFL_FRAME",
    "BTFL_PROGRESS",
  ],
  special: ["BTFL_SPECIALS"],
  number: ["BTFL_NUMBERS"],
  letter: ["BTFL_LETTERS", "BTFL_LOWLETTERS"],
};

// Priority order when a code is in multiple subsets (e.g. 91 is both
// BTFL_MINILOGO and BTFL_SPECIALS → "logo" wins). Higher index = higher
// priority; the spec's priority reads logo > icon > special > number > letter.
const CATEGORY_PRIORITY: Array<Exclude<GlyphCategory, "unused">> = [
  "logo",
  "icon",
  "special",
  "number",
  "letter",
];

const USABLE_CATEGORIES: ReadonlySet<GlyphCategory> = new Set([
  "letter",
  "number",
  "special",
  "icon",
]);

// Precompute membership sets for O(1) lookup.
const SUBSET_MEMBERSHIP: Map<SubsetName, Set<number>> = new Map(
  (Object.entries(GLYPH_SUBSETS) as Array<[SubsetName, readonly number[]]>).map(
    ([name, codes]) => [name, new Set(codes)],
  ),
);

/**
 * Resolve every known subset that contains this code. The "ALL" alias is
 * excluded so the returned list is informative (ALL contains everything).
 */
function subsetsContaining(code: number): SubsetName[] {
  const out: SubsetName[] = [];
  for (const [name, members] of SUBSET_MEMBERSHIP) {
    if (name === "ALL") continue;
    if (members.has(code)) out.push(name);
  }
  return out;
}

function resolveCategory(subsets: SubsetName[]): GlyphCategory {
  if (subsets.length === 0) return "unused";
  const set = new Set(subsets);
  for (const cat of CATEGORY_PRIORITY) {
    const catSubsets = SUBSETS_BY_CATEGORY[cat];
    for (const s of catSubsets) {
      if (set.has(s)) return cat;
    }
  }
  return "unused";
}

function toAsciiChar(code: number): string | null {
  return code >= 32 && code <= 126 ? String.fromCharCode(code) : null;
}

/**
 * Resolve the metadata for a single glyph code (0..511 valid; out-of-range
 * codes are still described as "unused" with empty subsets).
 */
export function getGlyphMetadata(code: number): GlyphMetadata {
  const subsets = subsetsContaining(code);
  const category = resolveCategory(subsets);
  return {
    code,
    asciiChar: toAsciiChar(code),
    subsets,
    category,
    isUsable: USABLE_CATEGORIES.has(category),
  };
}
