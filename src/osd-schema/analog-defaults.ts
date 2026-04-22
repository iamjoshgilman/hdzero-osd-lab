// Analog-mode default layout. The HD schema has `defaultPos` + `defaultEnabled`
// per element tuned for a 53×20 grid; most of those positions fall outside
// the analog 30×16 grid (or clamp to the right edge and overlap). Rather
// than try to auto-clamp, we hand-pick a sensible starter set for analog
// and disable everything else by default — pilots opt in by toggling
// elements on and dragging them into their preferred analog layout.
//
// Starter set matches the common Betaflight analog OSD layout conventions:
// RSSI + LQ top-left, battery stack bottom-left, timer + altitude bottom-right,
// flight mode center-bottom, warnings center. 10 elements, mirrors the HD
// default count so the mode swap doesn't feel like stuff is missing.

export interface AnalogDefault {
  x: number;
  y: number;
}

export const ANALOG_DEFAULT_POSITIONS: Readonly<Record<string, AnalogDefault>> = {
  // RC link — top-left stack
  rssi_value: { x: 0, y: 0 },
  link_quality: { x: 0, y: 1 },

  // Power — bottom-left stack
  main_batt_voltage: { x: 0, y: 12 },
  avg_cell_voltage: { x: 0, y: 13 },
  main_batt_usage: { x: 0, y: 14 },

  // Flight info — bottom-right cluster
  altitude: { x: 23, y: 12 },
  item_timer_1: { x: 24, y: 14 },

  // Center overlays
  flymode: { x: 13, y: 14 },
  warnings: { x: 10, y: 10 },
  crosshairs: { x: 13, y: 7 },
};

/**
 * Look up the analog default position for an element. Returns null when the
 * element isn't part of the starter set — caller should treat that as
 * "disabled by default, user must enable + position."
 */
export function analogDefaultFor(elementId: string): AnalogDefault | null {
  return ANALOG_DEFAULT_POSITIONS[elementId] ?? null;
}
