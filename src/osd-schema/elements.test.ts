import { describe, it, expect } from "vitest";
import {
  OSD_ELEMENTS,
  OSD_GRID,
  lookupElement,
  elementCount,
  type OsdElementCategory,
} from "./elements";

describe("OSD element schema", () => {
  it("has a stable element count (catches accidental deletions)", () => {
    expect(elementCount()).toBeGreaterThanOrEqual(60);
  });

  it("every editable-text element has a maxTextLen", () => {
    for (const e of OSD_ELEMENTS) {
      if (e.editableText) {
        expect(e.maxTextLen).toBeGreaterThan(0);
      }
    }
  });

  it("grid is 53×20", () => {
    expect(OSD_GRID.cols).toBe(53);
    expect(OSD_GRID.rows).toBe(20);
  });

  it("every element has a unique id", () => {
    const ids = OSD_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every default position fits within the 53×20 grid", () => {
    for (const e of OSD_ELEMENTS) {
      expect(e.defaultPos.x).toBeGreaterThanOrEqual(0);
      expect(e.defaultPos.x).toBeLessThan(OSD_GRID.cols);
      expect(e.defaultPos.y).toBeGreaterThanOrEqual(0);
      expect(e.defaultPos.y).toBeLessThan(OSD_GRID.rows);
    }
  });

  it("every sample glyph code is 0..255", () => {
    for (const e of OSD_ELEMENTS) {
      for (const code of e.sample) {
        expect(code).toBeGreaterThanOrEqual(0);
        expect(code).toBeLessThanOrEqual(255);
      }
    }
  });

  it("every sample fits horizontally when placed at its default position", () => {
    for (const e of OSD_ELEMENTS) {
      const endCol = e.defaultPos.x + e.sample.length;
      expect(endCol).toBeLessThanOrEqual(OSD_GRID.cols);
    }
  });

  it("lookupElement finds well-known entries", () => {
    expect(lookupElement("craft_name")?.label).toBe("Craft Name");
    expect(lookupElement("rssi_value")?.label).toBe("RSSI");
    expect(lookupElement("main_batt_voltage")?.category).toBe("power");
    expect(lookupElement("nonexistent")).toBeNull();
  });

  it("every category appears at least once", () => {
    const seen = new Set(OSD_ELEMENTS.map((e) => e.category));
    const expected: OsdElementCategory[] = ["power", "rc", "nav", "flight", "status", "timer"];
    for (const cat of expected) {
      expect(seen.has(cat)).toBe(true);
    }
  });
});
