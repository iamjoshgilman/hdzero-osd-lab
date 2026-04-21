import { describe, it, expect } from "vitest";
import { createDefaultProject, CURRENT_SCHEMA_VERSION } from "./project";

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
});
