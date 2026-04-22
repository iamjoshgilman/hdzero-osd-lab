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
  /**
   * If true, the user can override the `sample` with their own text via an
   * input field in the UI. Good for craft name, pilot name, custom messages —
   * places where Betaflight treats the element contents as freeform text.
   */
  editableText?: boolean;
  /** Max characters accepted when editableText is true. Matches BF field limits. */
  maxTextLen?: number;
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
const SYM_ARROW_SMALL_UP = 0x75;
const SYM_ARROW_SMALL_DOWN = 0x76;
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
const SYM_MPS = 0x9f;
const SYM_BATT_FULL = 0x90;
const SYM_BATT_EMPTY = 0x96;
const SYM_MAIN_BATT = 0x97;
const SYM_PB_START = 0x8a;
const SYM_PB_FULL = 0x8b;
const SYM_PB_HALF = 0x8c;
const SYM_PB_EMPTY = 0x8d;
const SYM_PB_END = 0x8e;
const SYM_AH_LEFT = 0x03;
const SYM_AH_RIGHT = 0x02;
const SYM_AH_CENTER = 0x73;
const SYM_AH_BAR9_4 = 0x84;
const SYM_AH_DECORATION = 0x13;
const SYM_M = 0x0c;
const SYM_C = 0x0e;
const SYM_WATT = 0x57;
const SYM_AH_CENTER_LINE = 0x72;
const SYM_AH_CENTER_LINE_RIGHT = 0x74;
const SYM_STICK_OVERLAY_CENTER = 0x0b;
const SYM_STICK_OVERLAY_HORIZONTAL = 0x17;
const SYM_STICK_OVERLAY_VERTICAL = 0x16;

export const OSD_ELEMENTS: readonly OsdElement[] = [
  // ---- Pilot info / text ----
  {
    id: "craft_name",
    label: "Craft Name",
    category: "status",
    defaultPos: { x: 21, y: 1 },
    defaultEnabled: true,
    sample: ch("WHITERQBBIT"),
    editableText: true,
    maxTextLen: 15,
    note: "Freeform 15-char text field. See the Decoration Generator (v0.3) for inline-glyph tricks.",
  },
  {
    id: "pilot_name",
    label: "Pilot Name",
    category: "status",
    defaultPos: { x: 20, y: 12 },
    defaultEnabled: false,
    sample: ch("ONDRAS"),
    editableText: true,
    maxTextLen: 15,
  },
  {
    id: "rtc_datetime",
    label: "RTC Date / Time",
    category: "timer",
    defaultPos: { x: 18, y: 1 },
    defaultEnabled: false,
    sample: ch("2026-04-22 12:00"),
  },
  {
    id: "ready_mode",
    label: "Ready Mode",
    category: "status",
    defaultPos: { x: 22, y: 10 },
    defaultEnabled: false,
    sample: ch("READY"),
  },
  {
    id: "total_flights",
    label: "Total Flights",
    category: "status",
    defaultPos: { x: 2, y: 4 },
    defaultEnabled: false,
    sample: ch("#1234"),
  },

  // ---- RC link ----
  {
    id: "rssi_value",
    label: "RSSI",
    category: "rc",
    defaultPos: { x: 1, y: 1 },
    defaultEnabled: true,
    sample: [SYM_RSSI, ...ch("99")],
  },
  {
    id: "link_quality",
    label: "Link Quality (LQ)",
    category: "rc",
    defaultPos: { x: 1, y: 2 },
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
    defaultPos: { x: 1, y: 15 },
    defaultEnabled: true,
    sample: [SYM_MAIN_BATT, ...ch("16.4"), SYM_VOLT],
  },
  {
    id: "avg_cell_voltage",
    label: "Avg Cell Voltage",
    category: "power",
    defaultPos: { x: 1, y: 16 },
    defaultEnabled: true,
    sample: [SYM_BATT_FULL, ...ch("4.10"), SYM_VOLT],
  },
  {
    id: "current_draw",
    label: "Current Draw",
    category: "power",
    defaultPos: { x: 22, y: 13 },
    defaultEnabled: false,
    sample: [...ch("12.4"), SYM_AMP],
  },
  {
    id: "mah_drawn",
    label: "mAh Consumed",
    category: "power",
    defaultPos: { x: 22, y: 14 },
    defaultEnabled: false,
    sample: [...ch("0852"), SYM_MAH],
  },
  {
    id: "main_batt_usage",
    label: "Battery Usage (Graphical)",
    category: "power",
    defaultPos: { x: 1, y: 17 },
    defaultEnabled: true,
    // BF's "Graphical remaining" battery bar: START cap, fill tiles,
    // transition half-tile, empty tiles, END cap. ~60% remaining looks
    // right for a preview sample.
    sample: [
      SYM_PB_START,
      SYM_PB_FULL,
      SYM_PB_FULL,
      SYM_PB_FULL,
      SYM_PB_FULL,
      SYM_PB_FULL,
      SYM_PB_FULL,
      SYM_PB_HALF,
      SYM_PB_EMPTY,
      SYM_PB_EMPTY,
      SYM_PB_EMPTY,
      SYM_PB_END,
    ],
    note: "BF can also render this as numeric % or consumed mAh — this preview shows the default graphical bar.",
  },

  // ---- Navigation ----
  {
    id: "altitude",
    label: "Altitude",
    category: "nav",
    defaultPos: { x: 45, y: 15 },
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
    defaultPos: { x: 24, y: 18 },
    defaultEnabled: true,
    sample: ch("ANGL"),
    note: "Other values: ACRO, HOR, FAIL, RESC, !FS!",
  },
  {
    id: "disarmed",
    label: "Disarmed Banner",
    category: "status",
    defaultPos: { x: 22, y: 9 },
    defaultEnabled: false,
    sample: ch("DISARMED"),
  },
  {
    id: "warnings",
    label: "Warnings",
    category: "status",
    defaultPos: { x: 9, y: 10 },
    defaultEnabled: false,
    sample: ch("LOW VOLTAGE"),
  },
  {
    id: "crosshairs",
    label: "Crosshairs",
    category: "flight",
    defaultPos: { x: 25, y: 9 },
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
  // Betaflight exposes two generic timer slots; users choose what each shows
  // (flight time / on time / lap / etc.). We render plausible samples.
  {
    id: "item_timer_1",
    label: "Timer 1 (flight time)",
    category: "timer",
    defaultPos: { x: 46, y: 16 },
    defaultEnabled: true,
    sample: [SYM_FLY_M, ...ch("01:23")],
  },
  {
    id: "item_timer_2",
    label: "Timer 2 (on time)",
    category: "timer",
    defaultPos: { x: 38, y: 14 },
    defaultEnabled: false,
    sample: [SYM_ON_M, ...ch("02:01")],
  },
  {
    id: "remaining_time_estimate",
    label: "Remaining Flight Time",
    category: "timer",
    defaultPos: { x: 38, y: 15 },
    defaultEnabled: false,
    sample: ch("03:45"),
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

  // ---- AHI (artificial horizon) ----
  {
    id: "artificial_horizon",
    label: "Artificial Horizon",
    category: "flight",
    defaultPos: { x: 22, y: 7 },
    defaultEnabled: false,
    // 9-tile center row at neutral pitch/roll; firmware animates this.
    sample: [
      SYM_AH_BAR9_4,
      SYM_AH_BAR9_4,
      SYM_AH_BAR9_4,
      SYM_AH_BAR9_4,
      SYM_AH_CENTER_LINE,
      SYM_AH_BAR9_4,
      SYM_AH_BAR9_4,
      SYM_AH_BAR9_4,
      SYM_AH_CENTER_LINE_RIGHT,
    ],
  },
  {
    id: "horizon_sidebars",
    label: "Horizon Sidebars",
    category: "flight",
    defaultPos: { x: 17, y: 7 },
    defaultEnabled: false,
    sample: [SYM_AH_DECORATION, SYM_AH_DECORATION, SYM_AH_DECORATION],
  },

  // ---- Angles ----
  {
    id: "pitch_angle",
    label: "Pitch Angle",
    category: "flight",
    defaultPos: { x: 2, y: 7 },
    defaultEnabled: false,
    sample: [SYM_PITCH, ...ch(" 0.5")],
  },
  {
    id: "roll_angle",
    label: "Roll Angle",
    category: "flight",
    defaultPos: { x: 2, y: 8 },
    defaultEnabled: false,
    sample: [SYM_ROLL, ...ch(" 1.2")],
  },
  {
    id: "numerical_vario",
    label: "Vertical Speed",
    category: "flight",
    defaultPos: { x: 2, y: 9 },
    defaultEnabled: false,
    sample: [SYM_ARROW_SMALL_UP, ...ch("1.2"), SYM_MPS],
  },
  {
    id: "g_force",
    label: "G-Force",
    category: "flight",
    defaultPos: { x: 2, y: 6 },
    defaultEnabled: false,
    sample: ch("0.8G"),
  },

  // ---- ESC telemetry ----
  {
    id: "esc_tmp",
    label: "ESC Temperature",
    category: "power",
    defaultPos: { x: 2, y: 13 },
    defaultEnabled: false,
    sample: [SYM_TEMPERATURE, ...ch("45"), SYM_C],
  },
  {
    id: "esc_rpm",
    label: "ESC RPM",
    category: "power",
    defaultPos: { x: 40, y: 12 },
    defaultEnabled: false,
    sample: ch("8450"),
  },
  {
    id: "esc_rpm_freq",
    label: "ESC RPM (Hz)",
    category: "power",
    defaultPos: { x: 40, y: 11 },
    defaultEnabled: false,
    sample: ch("141Hz"),
  },
  {
    id: "motor_diag",
    label: "Motor Diagnostics",
    category: "power",
    defaultPos: { x: 40, y: 15 },
    defaultEnabled: false,
    sample: ch("M1-4"),
  },

  // ---- Power metrics ----
  {
    id: "power",
    label: "Power (W)",
    category: "power",
    defaultPos: { x: 22, y: 16 },
    defaultEnabled: false,
    sample: [...ch("125"), SYM_WATT],
  },
  {
    id: "watt_hours_drawn",
    label: "Watt-Hours Drawn",
    category: "power",
    defaultPos: { x: 22, y: 17 },
    defaultEnabled: false,
    sample: ch("1.2Wh"),
  },
  {
    id: "efficiency",
    label: "Efficiency (mAh/km)",
    category: "power",
    defaultPos: { x: 30, y: 17 },
    defaultEnabled: false,
    sample: ch("85mAh"),
  },
  {
    id: "flight_dist",
    label: "Flight Distance",
    category: "nav",
    defaultPos: { x: 40, y: 10 },
    defaultEnabled: false,
    sample: [...ch("1234"), SYM_M],
  },

  // ---- Tuning ----
  {
    id: "yaw_pids",
    label: "Yaw PIDs",
    category: "status",
    defaultPos: { x: 7, y: 16 },
    defaultEnabled: false,
    sample: ch("Y 45 50 30"),
  },
  {
    id: "pid_profile_name",
    label: "PID Profile Name",
    category: "status",
    defaultPos: { x: 10, y: 3 },
    defaultEnabled: false,
    sample: ch("ACRO"),
  },
  {
    id: "rate_profile_name",
    label: "Rate Profile Name",
    category: "status",
    defaultPos: { x: 20, y: 3 },
    defaultEnabled: false,
    sample: ch("RACE"),
  },
  {
    id: "profile_name",
    label: "Profile Name",
    category: "status",
    defaultPos: { x: 30, y: 3 },
    defaultEnabled: false,
    sample: ch("BUILD A"),
  },
  {
    id: "battery_profile_name",
    label: "Battery Profile",
    category: "power",
    defaultPos: { x: 40, y: 3 },
    defaultEnabled: false,
    sample: ch("6S1500"),
  },

  // ---- VTX / RX telemetry ----
  {
    id: "vtx_channel",
    label: "VTX Channel",
    category: "rc",
    defaultPos: { x: 48, y: 1 },
    defaultEnabled: false,
    sample: ch("R:1"),
  },
  {
    id: "rsnr_value",
    label: "RSNR (signal-to-noise)",
    category: "rc",
    defaultPos: { x: 2, y: 13 },
    defaultEnabled: false,
    sample: ch("45dB"),
  },
  {
    id: "tx_uplink_power",
    label: "TX Uplink Power",
    category: "rc",
    defaultPos: { x: 2, y: 16 },
    defaultEnabled: false,
    sample: ch("100mW"),
  },
  {
    id: "aux_value",
    label: "Aux Channel Value",
    category: "rc",
    defaultPos: { x: 30, y: 16 },
    defaultEnabled: false,
    sample: ch("AUX1:H"),
  },
  {
    id: "rc_channels",
    label: "RC Channels",
    category: "rc",
    defaultPos: { x: 36, y: 11 },
    defaultEnabled: false,
    sample: ch("AETR1500"),
  },

  // ---- Stick overlays ----
  {
    id: "stick_overlay_left",
    label: "Stick Overlay (L)",
    category: "flight",
    defaultPos: { x: 8, y: 14 },
    defaultEnabled: false,
    sample: [
      SYM_STICK_OVERLAY_VERTICAL,
      SYM_STICK_OVERLAY_CENTER,
      SYM_STICK_OVERLAY_HORIZONTAL,
    ],
  },
  {
    id: "stick_overlay_right",
    label: "Stick Overlay (R)",
    category: "flight",
    defaultPos: { x: 40, y: 14 },
    defaultEnabled: false,
    sample: [
      SYM_STICK_OVERLAY_VERTICAL,
      SYM_STICK_OVERLAY_CENTER,
      SYM_STICK_OVERLAY_HORIZONTAL,
    ],
  },

  // ---- Navigation extras ----
  {
    id: "up_down_reference",
    label: "Up/Down Reference",
    category: "nav",
    defaultPos: { x: 2, y: 5 },
    defaultEnabled: false,
    sample: [SYM_ARROW_SMALL_UP, SYM_ARROW_SMALL_DOWN],
  },

  // ---- Custom messages (text editable) ----
  {
    id: "custom_msg0",
    label: "Custom Message 1",
    category: "status",
    defaultPos: { x: 1, y: 18 },
    defaultEnabled: false,
    sample: ch("CUSTOM MSG 1"),
    editableText: true,
    maxTextLen: 20,
  },
  {
    id: "custom_msg1",
    label: "Custom Message 2",
    category: "status",
    defaultPos: { x: 1, y: 19 },
    defaultEnabled: false,
    sample: ch("CUSTOM MSG 2"),
    editableText: true,
    maxTextLen: 20,
  },
  {
    id: "custom_msg2",
    label: "Custom Message 3",
    category: "status",
    defaultPos: { x: 30, y: 18 },
    defaultEnabled: false,
    sample: ch("CUSTOM MSG 3"),
    editableText: true,
    maxTextLen: 20,
  },
  {
    id: "custom_msg3",
    label: "Custom Message 4",
    category: "status",
    defaultPos: { x: 30, y: 19 },
    defaultEnabled: false,
    sample: ch("CUSTOM MSG 4"),
    editableText: true,
    maxTextLen: 20,
  },
  {
    id: "custom_serial_text",
    label: "Serial-Driven Text",
    category: "status",
    defaultPos: { x: 1, y: 17 },
    defaultEnabled: false,
    sample: ch("SERIAL TEXT"),
    editableText: true,
    maxTextLen: 30,
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
