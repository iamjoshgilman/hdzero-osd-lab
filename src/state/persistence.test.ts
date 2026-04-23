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

  it("assigns paletteSeed to TTF layers that predate the field", () => {
    // Pre-paletteSeed projects had no per-layer seed. The resolver used to
    // fall back to Math.random, reshuffling colors on every rerender. The
    // migration pins a seed on load so colors are stable from the first
    // paint.
    const p = createDefaultProject();
    p.font.layers.push({
      id: "ttf-old",
      kind: "ttf",
      source: { kind: "user", hash: "a".repeat(64), name: "f.ttf", mime: "font/ttf" },
      subset: "BTFL_LETTERS",
      size: 22,
      outlineThickness: 1,
      vStretch: 1,
      glyphOffset: { x: 0, y: 0 },
      outlineOffset: { x: 0, y: 0 },
      glyphColor: ["#ff0000", "#00ff00", "#0000ff"],
      outlineColor: "#000000",
      superSampling: 8,
      enabled: true,
    });
    const json = projectToJson(p);
    const parsed = JSON.parse(json) as { font: { layers: Array<Record<string, unknown>> } };
    delete parsed.font.layers[0]!.paletteSeed;
    const legacyJson = JSON.stringify(parsed);
    const back = projectFromJson(legacyJson);
    const migrated = back.font.layers[0]!;
    if (migrated.kind !== "ttf") throw new Error("expected ttf layer");
    expect(typeof migrated.paletteSeed).toBe("number");
    expect(Number.isFinite(migrated.paletteSeed)).toBe(true);
  });

  it("migrates TTF layers inside fontArchive slots too", () => {
    const p = createDefaultProject();
    p.fontArchive = {
      analog: {
        layers: [
          {
            id: "ttf-archived",
            kind: "ttf",
            source: { kind: "user", hash: "b".repeat(64), name: "g.ttf", mime: "font/ttf" },
            subset: "BTFL_LETTERS",
            size: 18,
            outlineThickness: 1,
            vStretch: 1,
            glyphOffset: { x: 0, y: 0 },
            outlineOffset: { x: 0, y: 0 },
            glyphColor: "#ffffff",
            outlineColor: "#000000",
            superSampling: 8,
            enabled: true,
          },
        ],
        overrides: {},
      },
    };
    const json = projectToJson(p);
    const parsed = JSON.parse(json) as {
      fontArchive: { analog: { layers: Array<Record<string, unknown>> } };
    };
    delete parsed.fontArchive.analog.layers[0]!.paletteSeed;
    const back = projectFromJson(JSON.stringify(parsed));
    const archived = back.fontArchive!.analog!.layers[0]!;
    if (archived.kind !== "ttf") throw new Error("expected ttf layer");
    expect(typeof archived.paletteSeed).toBe("number");
  });
});
