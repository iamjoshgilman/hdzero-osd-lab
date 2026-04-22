// Betaflight glyph-code symbol table. Each entry names the code, gives a
// human label, and categorises it by firmware role. Data reimplemented from
// Betaflight `src/main/drivers/osd_symbols.h` (GPL-3.0) — this is a data
// table of integer constants, not a code copy. Code-level GPL material is
// not incorporated into this MIT repo.
//
// Source of truth at time of import:
//   https://github.com/betaflight/betaflight/blob/master/src/main/drivers/osd_symbols.h
//
// Coverage: all 101 named SYM_* constants in the upstream header plus a few
// ASCII printables Betaflight emits explicitly (GPS minute/second quotes,
// hyphen, space). Codes not in this table are either plain ASCII (letters,
// digits, punctuation emitted as-is), BTFL logo tiles 160..255, or unused.

export type SymbolCategory =
  | "misc"
  | "rssi"
  | "throttle"
  | "unit"
  | "heading"
  | "ahi"
  | "sats"
  | "arrow"
  | "battery"
  | "power"
  | "time"
  | "speed"
  | "stick"
  | "progress"
  | "lap"
  | "gps"
  | "warning";

export interface SymbolDef {
  /** Numeric glyph code 0..255. */
  code: number;
  /** Constant name from the BF header (without SYM_ prefix). */
  name: string;
  /** Human-friendly label for UI display. */
  label: string;
  /** Role grouping for coloring / filtering. */
  category: SymbolCategory;
  /** Optional notes — aliases, commented-out-but-reserved, etc. */
  note?: string;
}

/**
 * Raw symbol defs. Keep alphabetical-ish / grouped by category for human scan.
 * Hex values match the BF header 1:1; add `(code)` in comments where the
 * decimal value is load-bearing for a reader.
 */
const DEFS: readonly SymbolDef[] = [
  // Misc
  { code: 0x00, name: "NONE", label: "Empty slot", category: "misc" },
  { code: 0xff, name: "END_OF_FONT", label: "End-of-font marker", category: "misc" },
  { code: 0x20, name: "BLANK", label: "Space (' ')", category: "misc" },
  { code: 0x2d, name: "HYPHEN", label: "Hyphen ('-')", category: "misc" },
  { code: 0x10, name: "BBLOG", label: "Blackbox logging icon", category: "misc" },
  { code: 0x11, name: "HOMEFLAG", label: "Home flag icon", category: "misc" },
  { code: 0x14, name: "ROLL", label: "Roll axis icon", category: "misc" },
  { code: 0x15, name: "PITCH", label: "Pitch axis icon", category: "misc" },
  { code: 0x7a, name: "TEMPERATURE", label: "Temperature icon", category: "misc" },

  // GPS / navigation
  { code: 0x89, name: "LAT", label: "Latitude icon", category: "gps" },
  { code: 0x98, name: "LON", label: "Longitude icon", category: "gps" },
  { code: 0x7f, name: "ALTITUDE", label: "Altitude icon", category: "misc" },
  { code: 0x71, name: "TOTAL_DISTANCE", label: "Total distance icon", category: "misc" },
  { code: 0x05, name: "OVER_HOME", label: "Over home marker", category: "misc" },
  { code: 0x27, name: "GPS_MINUTE", label: "GPS minute (')", category: "gps", note: "ASCII apostrophe" },
  { code: 0x22, name: "GPS_SECOND", label: 'GPS second (")', category: "gps", note: "ASCII quote" },
  // SYM_GPS_DEGREE aliases SYM_STICK_OVERLAY_SPRITE_HIGH (both 0x08) — the stick
  // entry below carries the alias note so lookups stay unambiguous per-code.

  // RSSI / link
  { code: 0x01, name: "RSSI", label: "RSSI icon", category: "rssi" },
  { code: 0x7b, name: "LINK_QUALITY", label: "Link Quality (LQ)", category: "rssi" },

  // Throttle
  { code: 0x04, name: "THR", label: "Throttle %", category: "throttle" },

  // Units — metric
  { code: 0x0c, name: "M", label: "Meters (m)", category: "unit" },
  { code: 0x7d, name: "KM", label: "Kilometers (km)", category: "unit" },
  { code: 0x0e, name: "C", label: "Celsius (°C)", category: "unit" },

  // Units — imperial
  { code: 0x0f, name: "FT", label: "Feet (ft)", category: "unit" },
  { code: 0x7e, name: "MILES", label: "Miles (mi)", category: "unit" },
  { code: 0x0d, name: "F", label: "Fahrenheit (°F)", category: "unit" },

  // Compass / heading
  { code: 0x18, name: "HEADING_N", label: "Heading N", category: "heading" },
  { code: 0x19, name: "HEADING_S", label: "Heading S", category: "heading" },
  { code: 0x1a, name: "HEADING_E", label: "Heading E", category: "heading" },
  { code: 0x1b, name: "HEADING_W", label: "Heading W", category: "heading" },
  { code: 0x1c, name: "HEADING_DIVIDED_LINE", label: "Compass divider", category: "heading" },
  { code: 0x1d, name: "HEADING_LINE", label: "Compass line", category: "heading" },

  // Artificial horizon center
  { code: 0x72, name: "AH_CENTER_LINE", label: "AHI center line (L)", category: "ahi" },
  { code: 0x73, name: "AH_CENTER", label: "AHI center", category: "ahi" },
  { code: 0x74, name: "AH_CENTER_LINE_RIGHT", label: "AHI center line (R)", category: "ahi" },
  { code: 0x02, name: "AH_RIGHT", label: "AHI right arrow", category: "ahi" },
  { code: 0x03, name: "AH_LEFT", label: "AHI left arrow / menu cursor", category: "ahi" },
  { code: 0x13, name: "AH_DECORATION", label: "AHI decoration", category: "ahi" },

  // AHI bars
  { code: 0x80, name: "AH_BAR9_0", label: "AHI bar 0", category: "ahi" },
  { code: 0x81, name: "AH_BAR9_1", label: "AHI bar 1", category: "ahi" },
  { code: 0x82, name: "AH_BAR9_2", label: "AHI bar 2", category: "ahi" },
  { code: 0x83, name: "AH_BAR9_3", label: "AHI bar 3", category: "ahi" },
  { code: 0x84, name: "AH_BAR9_4", label: "AHI bar 4", category: "ahi" },
  { code: 0x85, name: "AH_BAR9_5", label: "AHI bar 5", category: "ahi" },
  { code: 0x86, name: "AH_BAR9_6", label: "AHI bar 6", category: "ahi" },
  { code: 0x87, name: "AH_BAR9_7", label: "AHI bar 7", category: "ahi" },
  { code: 0x88, name: "AH_BAR9_8", label: "AHI bar 8", category: "ahi" },

  // Satellites
  { code: 0x1e, name: "SAT_L", label: "GPS satellites (L)", category: "sats" },
  { code: 0x1f, name: "SAT_R", label: "GPS satellites (R)", category: "sats" },

  // Direction arrows (16-point compass home arrow)
  { code: 0x60, name: "ARROW_SOUTH", label: "Arrow S", category: "arrow" },
  { code: 0x61, name: "ARROW_2", label: "Arrow SSW", category: "arrow" },
  { code: 0x62, name: "ARROW_3", label: "Arrow SW", category: "arrow" },
  { code: 0x63, name: "ARROW_4", label: "Arrow WSW", category: "arrow" },
  { code: 0x64, name: "ARROW_EAST", label: "Arrow W", category: "arrow" },
  { code: 0x65, name: "ARROW_6", label: "Arrow WNW", category: "arrow" },
  { code: 0x66, name: "ARROW_7", label: "Arrow NW", category: "arrow" },
  { code: 0x67, name: "ARROW_8", label: "Arrow NNW", category: "arrow" },
  { code: 0x68, name: "ARROW_NORTH", label: "Arrow N", category: "arrow" },
  { code: 0x69, name: "ARROW_10", label: "Arrow NNE", category: "arrow" },
  { code: 0x6a, name: "ARROW_11", label: "Arrow NE", category: "arrow" },
  { code: 0x6b, name: "ARROW_12", label: "Arrow ENE", category: "arrow" },
  { code: 0x6c, name: "ARROW_WEST", label: "Arrow E", category: "arrow" },
  { code: 0x6d, name: "ARROW_14", label: "Arrow ESE", category: "arrow" },
  { code: 0x6e, name: "ARROW_15", label: "Arrow SE", category: "arrow" },
  { code: 0x6f, name: "ARROW_16", label: "Arrow SSE", category: "arrow" },
  { code: 0x75, name: "ARROW_SMALL_UP", label: "Small up arrow", category: "arrow" },
  { code: 0x76, name: "ARROW_SMALL_DOWN", label: "Small down arrow", category: "arrow" },

  // Battery
  { code: 0x90, name: "BATT_FULL", label: "Battery full", category: "battery" },
  { code: 0x91, name: "BATT_5", label: "Battery 5/6", category: "battery" },
  { code: 0x92, name: "BATT_4", label: "Battery 4/6", category: "battery" },
  { code: 0x93, name: "BATT_3", label: "Battery 3/6", category: "battery" },
  { code: 0x94, name: "BATT_2", label: "Battery 2/6", category: "battery" },
  { code: 0x95, name: "BATT_1", label: "Battery 1/6", category: "battery" },
  { code: 0x96, name: "BATT_EMPTY", label: "Battery empty", category: "battery" },
  { code: 0x97, name: "MAIN_BATT", label: "Main battery icon", category: "battery" },

  // Power
  { code: 0x06, name: "VOLT", label: "Voltage (V)", category: "power" },
  { code: 0x9a, name: "AMP", label: "Amperes (A)", category: "power" },
  { code: 0x07, name: "MAH", label: "Milliamp-hours (mAh)", category: "power" },
  { code: 0x57, name: "WATT", label: "Watts (W)", category: "power", note: "aliased to ASCII 'W'" },

  // Time / flight modes
  { code: 0x9b, name: "ON_M", label: "On-time icon", category: "time" },
  { code: 0x9c, name: "FLY_M", label: "Flight-time icon", category: "time" },

  // Lap timer
  { code: 0x24, name: "CHECKERED_FLAG", label: "Checkered flag", category: "lap" },
  { code: 0x79, name: "PREV_LAP_TIME", label: "Previous lap time", category: "lap" },

  // Speed
  { code: 0x70, name: "SPEED", label: "Speed icon", category: "speed" },
  { code: 0x9e, name: "KPH", label: "km/h", category: "speed" },
  { code: 0x9d, name: "MPH", label: "mph", category: "speed" },
  { code: 0x9f, name: "MPS", label: "m/s", category: "speed" },
  { code: 0x99, name: "FTPS", label: "ft/s", category: "speed" },

  // Progress bar
  { code: 0x8a, name: "PB_START", label: "Progress bar start", category: "progress" },
  { code: 0x8b, name: "PB_FULL", label: "Progress bar full", category: "progress" },
  { code: 0x8c, name: "PB_HALF", label: "Progress bar half", category: "progress" },
  { code: 0x8d, name: "PB_EMPTY", label: "Progress bar empty", category: "progress" },
  { code: 0x8e, name: "PB_END", label: "Progress bar end", category: "progress" },
  { code: 0x8f, name: "PB_CLOSE", label: "Progress bar close", category: "progress" },

  // Stick overlays
  {
    code: 0x08,
    name: "STICK_OVERLAY_SPRITE_HIGH",
    label: "Stick overlay high",
    category: "stick",
    note: "also aliased as SYM_GPS_DEGREE",
  },
  { code: 0x09, name: "STICK_OVERLAY_SPRITE_MID", label: "Stick overlay mid", category: "stick" },
  { code: 0x0a, name: "STICK_OVERLAY_SPRITE_LOW", label: "Stick overlay low", category: "stick" },
  { code: 0x0b, name: "STICK_OVERLAY_CENTER", label: "Stick overlay center", category: "stick" },
  { code: 0x16, name: "STICK_OVERLAY_VERTICAL", label: "Stick overlay vertical", category: "stick" },
  { code: 0x17, name: "STICK_OVERLAY_HORIZONTAL", label: "Stick overlay horizontal", category: "stick" },
];

// Build a fast lookup map. Exported only via lookupSymbol so readers can't
// accidentally mutate.
const MAP = new Map<number, SymbolDef>(DEFS.map((d) => [d.code, d] as const));

/**
 * Look up the Betaflight semantic for a glyph code, or null if it's not in
 * the symbol table (which typically means: plain ASCII, logo tile, or unused).
 */
export function lookupSymbol(code: number): SymbolDef | null {
  return MAP.get(code) ?? null;
}

/** All defined symbols, in the order declared above. */
export function allSymbols(): readonly SymbolDef[] {
  return DEFS;
}

/** Count of defined symbols (for tests / stats). */
export function symbolCount(): number {
  return DEFS.length;
}
