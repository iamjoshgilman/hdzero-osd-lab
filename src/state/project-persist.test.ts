import { describe, it, expect, beforeEach } from "vitest";
import "../test/setup-indexeddb";
import {
  savePersistedProject,
  loadPersistedProject,
  clearPersistedProject,
} from "./project-persist";
import { createDefaultProject } from "./project";

async function wipe(): Promise<void> {
  await clearPersistedProject();
}

describe("project-persist (IndexedDB)", () => {
  beforeEach(async () => {
    await wipe();
  });

  it("returns null when the store is empty", async () => {
    expect(await loadPersistedProject()).toBeNull();
  });

  it("save + load round-trips a default project", async () => {
    const p = createDefaultProject();
    p.meta.name = "Persistence smoke test";
    await savePersistedProject(p);
    const back = await loadPersistedProject();
    expect(back).toEqual(p);
  });

  it("save + load round-trips a project with layers, tints, and custom text", async () => {
    const p = createDefaultProject();
    p.font.layers.push({
      id: "base-1",
      kind: "bitmap",
      source: {
        kind: "user",
        hash: "a".repeat(64),
        name: "base.bmp",
        mime: "image/bmp",
      },
      subset: "ALL",
      enabled: true,
    });
    p.font.tints = { 65: "#00ffaa", 66: "#ff00ff" };
    p.osdLayout.elements["craft_name"] = {
      x: 10,
      y: 2,
      enabled: true,
      customText: "WHITERQBBIT",
    };

    await savePersistedProject(p);
    const back = await loadPersistedProject();
    expect(back).toEqual(p);
    expect(back?.font.tints).toEqual({ 65: "#00ffaa", 66: "#ff00ff" });
    expect(back?.osdLayout.elements["craft_name"]?.customText).toBe("WHITERQBBIT");
  });

  it("overwrites the previous save instead of accumulating", async () => {
    const a = createDefaultProject();
    a.meta.name = "first";
    await savePersistedProject(a);

    const b = createDefaultProject();
    b.meta.name = "second";
    await savePersistedProject(b);

    const back = await loadPersistedProject();
    expect(back?.meta.name).toBe("second");
  });

  it("clearPersistedProject empties the store", async () => {
    await savePersistedProject(createDefaultProject());
    expect(await loadPersistedProject()).not.toBeNull();
    await clearPersistedProject();
    expect(await loadPersistedProject()).toBeNull();
  });

  it("returns null on corrupted stored JSON instead of throwing", async () => {
    // Go around the save helper so we can inject garbage.
    const req = indexedDB.open("hdzero-osd-lab-project", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("project")) {
          d.createObjectStore("project", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("project", "readwrite");
      tx.objectStore("project").put({
        key: "current",
        json: "{not valid json",
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    expect(await loadPersistedProject()).toBeNull();
  });
});
