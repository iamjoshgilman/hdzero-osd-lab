import { describe, it, expect } from "vitest";
import {
  createDefaultProject,
  CURRENT_SCHEMA_VERSION,
  switchMode,
  emptyFontSlice,
} from "./project";
import type { BitmapLayer, McmLayer } from "./project";

describe("createDefaultProject", () => {
  it("returns a valid empty project", () => {
    const p = createDefaultProject();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(p.meta.name).toBe("Untitled");
    expect(p.meta.rngSeed).toBeNull();
    expect(p.font.layers).toEqual([]);
    expect(p.font.overrides).toEqual({});
    expect(p.osdLayout.elements).toEqual({});
    expect(p.decorations.craftName.slots).toEqual([]);
    expect(p.decorations.craftName.resolvedPayload).toBe("");
    expect(p.decorations.stats).toEqual([]);
  });

  it("meta timestamps are parseable ISO strings", () => {
    const p = createDefaultProject();
    expect(new Date(p.meta.createdAt).toISOString()).toBe(p.meta.createdAt);
    expect(new Date(p.meta.updatedAt).toISOString()).toBe(p.meta.updatedAt);
  });

  it("two invocations produce independent objects (no shared mutation)", () => {
    const a = createDefaultProject();
    const b = createDefaultProject();
    a.font.layers.push({
      id: "test",
      kind: "bitmap",
      source: { kind: "builtin", id: "x" },
      subset: "ALL",
      enabled: true,
    });
    expect(b.font.layers).toHaveLength(0);
  });

  it("defaults to hd mode", () => {
    // New projects start targeting HDZero — analog opt-in via the mode toggle.
    // Keeps first-visit experience unchanged for the dominant HDZero audience.
    const p = createDefaultProject();
    expect(p.meta.mode).toBe("hd");
  });
});

describe("switchMode", () => {
  // Small fixtures.
  const hdLayer: BitmapLayer = {
    id: "hd-base",
    kind: "bitmap",
    source: { kind: "user", hash: "h".repeat(64), name: "hd.bmp", mime: "image/bmp" },
    subset: "ALL",
    enabled: true,
  };
  const analogLayer: McmLayer = {
    id: "analog-base",
    kind: "mcm",
    source: { kind: "user", hash: "a".repeat(64), name: "a.mcm", mime: "text/plain" },
    subset: "ALL",
    glyphColor: "#ffffff",
    outlineColor: "#000000",
    enabled: true,
  };

  it("is a no-op when switching to the already-active mode", () => {
    const p = createDefaultProject();
    p.font.layers.push(hdLayer);
    const before = JSON.stringify(p);
    switchMode(p, "hd");
    expect(JSON.stringify(p)).toBe(before);
  });

  it("archives the current font and swaps in a blank slice on first switch", () => {
    const p = createDefaultProject();
    p.font.layers.push(hdLayer);

    switchMode(p, "analog");

    expect(p.meta.mode).toBe("analog");
    expect(p.font.layers).toEqual([]); // analog starts blank
    expect(p.fontArchive?.hd?.layers).toEqual([hdLayer]); // HD work tucked away
  });

  it("round-trips: HD → analog → HD restores the original HD layers", () => {
    const p = createDefaultProject();
    p.font.layers.push(hdLayer);

    switchMode(p, "analog");
    // simulate work in analog
    p.font.layers.push(analogLayer);
    switchMode(p, "hd");

    expect(p.meta.mode).toBe("hd");
    expect(p.font.layers).toEqual([hdLayer]);
    // Analog work still archived
    expect(p.fontArchive?.analog?.layers).toEqual([analogLayer]);
  });

  it("two-way isolation: HD mutations after a switch don't affect analog archive", () => {
    const p = createDefaultProject();
    p.font.layers.push(hdLayer);
    switchMode(p, "analog");
    p.font.layers.push(analogLayer);
    switchMode(p, "hd");

    // Mutate HD side — push another layer
    const hdExtra: BitmapLayer = { ...hdLayer, id: "hd-extra" };
    p.font.layers.push(hdExtra);

    // Analog archive must be untouched.
    expect(p.fontArchive?.analog?.layers).toEqual([analogLayer]);

    switchMode(p, "analog");
    expect(p.font.layers).toEqual([analogLayer]);
  });

  it("emptyFontSlice returns a fresh independent object each call", () => {
    const a = emptyFontSlice();
    const b = emptyFontSlice();
    a.layers.push(hdLayer);
    expect(b.layers).toEqual([]);
  });
});
