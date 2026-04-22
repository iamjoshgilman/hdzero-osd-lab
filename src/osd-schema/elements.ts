// Betaflight OSD element table. Each entry models one on-screen widget a
// pilot can position via Configurator. Data reimplemented from Betaflight's
// publicly documented `osd_items_e` enum (src/main/osd/osd.h) and the
// rendering functions in src/main/osd/osd_elements.c (GPL-3.0). This is a
// data table of integer constants and string labels — no code is copied.
//
// Scope: the ~30 elements Betaflight pilots enable most often. Expansion to
// the full enum (100+ entries including waypoints, goggle-side stats, and
// stick overlays) is straightforward but deferred.
//
// Each element carries a `sample` — a fixed glyph-code sequence a preview
// renderer blits at the element's position. For variable-value elements
// (battery voltage, flight time) the sample is a plausible flying-value
// so the OSD preview shows what the pilot will see in flight, not just an
// icon.

export type OsdElementCategory =
  | "power"
  | "rc"
  | "nav"
  | "flight"
  | "status"
  | "timer"
  | "decorative";

export interface OsdElement {
  /** Lowercase form of the BF `OSD_*` enum name. */
  id: string;
  /** Human-readable label shown in the element library UI. */
  label: string;
  category: OsdElementCategory;
  /** Default grid position (col 0..52, row 0..19). */
  defaultPos: { x: number; y: number };
  defaultEnabled: boolean;
  /** Sample glyph sequence blitted at render time. Each entry is a 0..255 code. */
  sample: readonly number[];
  /** Optional extra note surfaced by the inspector. */
  note?: string;
}

/** Char helper — spelled out for readability of multi-char samples. */
const ch = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

// Common SYM_ codes inlined here so the sample arrays stay readable without
// an external import at every call site. Must match src/osd-schema/symbols.ts.
const SYM_RSSI = 0x01;
const SYM_THR = 0x04;
const SYM_VOLT = 0x06;
const SYM_MAH = 0x07;
const SYM_BBLOG = 0x10;
const SYM_HOMEFLAG = 0x11;
const SYM_ROLL = 0x14;
const SYM_PITCH = 0x15;
const SYM_HEADING_N = 0x18;
const SYM_HEADING_S = 0x19;
const SYM_HEADING_E = 0x1a;
const SYM_HEADING_W = 0x1b;
const SYM_HEADING_DIVIDED_LINE = 0x1c;
const SYM_HEADING_LINE = 0x1d;
const SYM_SAT_L = 0x1e;
const SYM_SAT_R = 0x1f;
const SYM_ARROW_NORTH = 0x68;
const SYM_SPEED = 0x70;
const SYM_TEMPERATURE = 0x7a;
const SYM_LINK_QUALITY = 0x7b;
const SYM_KM = 0x7d;
const SYM_ALTITUDE = 0x7f;
const SYM_LAT = 0x89;
const SYM_LON = 0x98;
const SYM_AMP = 0x9a;
const SYM_ON_M = 0x9b;
const SYM_FLY_M = 0x9c;
const SYM_KPH = 0x9e;
const SYM_BATT_FULL = 0x90;
const SYM_BATT_EMPTY = 0x96;
const SYM_MAIN_BATT = 0x97;
const SYM_AH_LEFT = 0x03;
const SYM_AH_RIGHT = 0x02;
const SYM_AH_CENTER = 0x73;
const SYM_M = 0x0c;
const SYM_C = 0x0e;

export const OSD_ELEMENTS: readonly OsdElement[] = [
  // ---- Pilot info / text ----
  {
    id: "craft_name",
    label: "Craft Name",
    category: "status",
    defaultPos: { x: 20, y: 11 },
    defaultEnabled: true,
    sample: ch("WHITERQBBIT"),
    note: "Freeform 15-char text field. See the Decoration Generator (v0.3) for inline-glyph tricks.",
  },
  {
    id: "pilot_name",
    label: "Pilot Name",
    category: "status",
    defaultPos: { x: 20, y: 12 },
    defaultEnabled: false,
    sample: ch("ONDRAS"),
  },
  {
    id: "rtc_datetime",
    label: "RTC Date / Time",
    category: "timer",
    defaultPos: { x: 18, y: 1 },
    defaultEnabled: false,
    sample: ch("2026-04-22 12:00"),
  },

  // ---- RC link ----
  {
    id: "rssi_value",
    label: "RSSI",
    category: "rc",
    defaultPos: { x: 23, y: 12 },
    defaultEnabled: true,
    sample: [SYM_RSSI, ...ch("99")],
  },
  {
    id: "link_quality",
    label: "Link Quality (LQ)",
    category: "rc",
    defaultPos: { x: 23, y: 11 },
    defaultEnabled: true,
    sample: [SYM_LINK_QUALITY, ...ch("2:100")],
  },
  {
    id: "rssi_dbm_value",
    label: "RSSI dBm",
    category: "rc",
    defaultPos: { x: 2, y: 12 },
    defaultEnabled: false,
    sample: ch("-85"),
  },

  // ---- Power ----
  {
    id: "main_batt_voltage",
    label: "Battery Voltage",
    category: "power",
    defaultPos: { x: 14, y: 11 },
    defaultEnabled: true,
    sample: [SYM_MAIN_BATT, ...ch("16.4"), SYM_VOLT],
  },
  {
    id: "avg_cell_voltage",
    label: "Avg Cell Voltage",
    category: "power",
    defaultPos: { x: 14, y: 12 },
    defaultEnabled: true,
    sample: [SYM_BATT_FULL, ...ch("4.10"), SYM_VOLT],
  },
  {
    id: "current_draw",
    label: "Current Draw",
    category: "power",
    defaultPos: { x: 22, y: 13 },
    defaultEnabled: true,
    sample: [...ch("12.4"), SYM_AMP],
  },
  {
    id: "mah_drawn",
    label: "mAh Consumed",
    category: "power",
    defaultPos: { x: 22, y: 14 },
    defaultEnabled: true,
    sample: [...ch("0852"), SYM_MAH],
  },
  {
    id: "main_batt_usage",
    label: "Battery Usage Bar",
    category: "power",
    defaultPos: { x: 8, y: 13 },
    defaultEnabled: false,
    sample: [SYM_BATT_FULL, SYM_BATT_FULL, SYM_BATT_FULL, SYM_BATT_EMPTY],
  },

  // ---- Navigation ----
  {
    id: "altitude",
    label: "Altitude",
    category: "nav",
    defaultPos: { x: 2, y: 10 },
    defaultEnabled: true,
    sample: [SYM_ALTITUDE, ...ch("  5.3"), SYM_M],
  },
  {
    id: "home_dist",
    label: "Home Distance",
    category: "nav",
    defaultPos: { x: 2, y: 11 },
    defaultEnabled: false,
    sample: [SYM_HOMEFLAG, ...ch("  23"), SYM_M],
  },
  {
    id: "home_dir",
    label: "Home Direction Arrow",
    category: "nav",
    defaultPos: { x: 14, y: 9 },
    defaultEnabled: false,
    sample: [SYM_ARROW_NORTH],
  },
  {
    id: "gps_sats",
    label: "GPS Sats",
    category: "nav",
    defaultPos: { x: 2, y: 2 },
    defaultEnabled: false,
    sample: [SYM_SAT_L, SYM_SAT_R, ...ch("12")],
  },
  {
    id: "gps_speed",
    label: "GPS Speed",
    category: "nav",
    defaultPos: { x: 40, y: 11 },
    defaultEnabled: false,
    sample: [SYM_SPEED, ...ch(" 45"), SYM_KPH],
  },
  {
    id: "gps_lat",
    label: "GPS Latitude",
    category: "nav",
    defaultPos: { x: 32, y: 13 },
    defaultEnabled: false,
    sample: [SYM_LAT, ...ch(" 52.1234567")],
  },
  {
    id: "gps_lon",
    label: "GPS Longitude",
    category: "nav",
    defaultPos: { x: 32, y: 14 },
    defaultEnabled: false,
    sample: [SYM_LON, ...ch("012.3456789")],
  },
  {
    id: "numerical_heading",
    label: "Numerical Heading",
    category: "nav",
    defaultPos: { x: 25, y: 8 },
    defaultEnabled: false,
    sample: ch("123"),
  },
  {
    id: "compass_bar",
    label: "Compass Bar",
    category: "nav",
    defaultPos: { x: 13, y: 8 },
    defaultEnabled: false,
    sample: [
      SYM_HEADING_LINE,
      SYM_HEADING_DIVIDED_LINE,
      SYM_HEADING_N,
      SYM_HEADING_DIVIDED_LINE,
      SYM_HEADING_LINE,
      SYM_HEADING_DIVIDED_LINE,
      SYM_HEADING_E,
      SYM_HEADING_DIVIDED_LINE,
      SYM_HEADING_LINE,
    ],
  },

  // ---- Flight info ----
  {
    id: "throttle_pos",
    label: "Throttle Position",
    category: "flight",
    defaultPos: { x: 22, y: 15 },
    defaultEnabled: false,
    sample: [SYM_THR, ...ch(" 50")],
  },
  {
    id: "flymode",
    label: "Flight Mode",
    category: "flight",
    defaultPos: { x: 14, y: 15 },
    defaultEnabled: true,
    sample: ch("ANGL"),
    note: "Other values: ACRO, HOR, FAIL, RESC, !FS!",
  },
  {
    id: "disarmed",
    label: "Disarmed Banner",
    category: "status",
    defaultPos: { x: 22, y: 9 },
    defaultEnabled: true,
    sample: ch("DISARMED"),
  },
  {
    id: "warnings",
    label: "Warnings",
    category: "status",
    defaultPos: { x: 9, y: 10 },
    defaultEnabled: true,
    sample: ch("LOW VOLTAGE"),
  },
  {
    id: "crosshairs",
    label: "Crosshairs",
    category: "flight",
    defaultPos: { x: 24, y: 10 },
    defaultEnabled: true,
    sample: [SYM_AH_LEFT, SYM_AH_CENTER, SYM_AH_RIGHT],
    note: "Three-tile AHI center marker; firmware aligns it with the artificial horizon.",
  },
  {
    id: "flip_arrow",
    label: "Flip Arrow (crash recovery)",
    category: "flight",
    defaultPos: { x: 26, y: 10 },
    defaultEnabled: false,
    sample: [SYM_ARROW_NORTH],
  },

  // ---- Timers ----
  {
    id: "flight_time",
    label: "Flight Time",
    category: "timer",
    defaultPos: { x: 38, y: 13 },
    defaultEnabled: true,
    sample: [SYM_FLY_M, ...ch("01:23")],
  },
  {
    id: "on_time",
    label: "On Time",
    category: "timer",
    defaultPos: { x: 38, y: 14 },
    defaultEnabled: false,
    sample: [SYM_ON_M, ...ch("02:01")],
  },

  // ---- Rotation / PIDs (usually tuning-only) ----
  {
    id: "roll_pids",
    label: "Roll PIDs",
    category: "status",
    defaultPos: { x: 7, y: 14 },
    defaultEnabled: false,
    sample: [SYM_ROLL, ...ch("45 50 30")],
  },
  {
    id: "pitch_pids",
    label: "Pitch PIDs",
    category: "status",
    defaultPos: { x: 7, y: 15 },
    defaultEnabled: false,
    sample: [SYM_PITCH, ...ch("45 50 30")],
  },

  // ---- Temperature ----
  {
    id: "core_temperature",
    label: "Core Temperature",
    category: "status",
    defaultPos: { x: 2, y: 14 },
    defaultEnabled: false,
    sample: [SYM_TEMPERATURE, ...ch("45"), SYM_C],
  },

  // ---- Logging / blackbox ----
  {
    id: "log_status",
    label: "Blackbox Log Status",
    category: "status",
    defaultPos: { x: 2, y: 15 },
    defaultEnabled: false,
    sample: [SYM_BBLOG, ...ch(" 512M")],
  },
];

// Fast lookup by id.
const MAP = new Map<string, OsdElement>(OSD_ELEMENTS.map((e) => [e.id, e] as const));

/** Look up an OSD element by id. */
export function lookupElement(id: string): OsdElement | null {
  return MAP.get(id) ?? null;
}

/** Count of elements in the table (for tests / stats). */
export function elementCount(): number {
  return OSD_ELEMENTS.length;
}

/** Grid dimensions the schema targets. Matches HD OSD resolution. */
export const OSD_GRID = { cols: 53, rows: 20 } as const;
