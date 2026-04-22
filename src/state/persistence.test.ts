import { describe, it, expect } from "vitest";
import { projectToJson, projectFromJson } from "./persistence";
import { createDefaultProject } from "./project";

describe("projectToJson / projectFromJson", () => {
  it("round-trips a default project", () => {
    const p = createDefaultProject();
    const json = projectToJson(p);
    const back = projectFromJson(json);
    expect(back).toEqual(p);
  });

  it("round-trips a project with layers and overrides", () => {
    const p = createDefaultProject();
    p.meta.name = "WhiteRqbbit build";
    p.font.layers.push({
      id: "base",
      kind: "bitmap",
      source: { kind: "user", hash: "abcdef".repeat(10).slice(0, 64), name: "b.bmp", mime: "image/bmp" },
      subset: "ALL",
      enabled: true,
    });
    p.font.overrides[123] = {
      source: { kind: "user", hash: "112233".repeat(10).slice(0, 64), name: "s.png", mime: "image/png" },
    };
    const back = projectFromJson(projectToJson(p));
    expect(back).toEqual(p);
  });

  it("rejects non-object JSON", () => {
    expect(() => projectFromJson("42")).toThrow(/not an object/);
    expect(() => projectFromJson("null")).toThrow(/not an object/);
    expect(() => projectFromJson(`"a string"`)).toThrow(/not an object/);
  });

  it("rejects unknown schema versions", () => {
    const bad = JSON.stringify({ schemaVersion: 99, meta: {}, font: {}, osdLayout: {}, decorations: {} });
    expect(() => projectFromJson(bad)).toThrow(/schemaVersion/);
  });

  it("rejects docs missing required top-level fields", () => {
    const bad = JSON.stringify({ schemaVersion: 1, meta: {} });
    expect(() => projectFromJson(bad)).toThrow(/missing/);
  });

  it("round-trips the mode field", () => {
    const p = createDefaultProject();
    p.meta.mode = "analog";
    const back = projectFromJson(projectToJson(p));
    expect(back.meta.mode).toBe("analog");
  });

  it("auto-migrates pre-v0.3.0 projects (no mode field) to hd", () => {
    // Simulate an old saved project written before the mode field existed.
    // Hand-build the JSON to avoid the TS type requiring mode.
    const p = createDefaultProject();
    const json = projectToJson(p);
    const parsed = JSON.parse(json) as { meta: Record<string, unknown> };
    delete parsed.meta.mode;
    const legacyJson = JSON.stringify(parsed);
    const back = projectFromJson(legacyJson);
    expect(back.meta.mode).toBe("hd");
  });
});
