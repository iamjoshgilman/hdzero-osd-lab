import { describe, it, expect, beforeEach } from "vitest";
import "../test/setup-indexeddb";
import {
  hydrateFromPersistence,
  installAutoSave,
  resetProjectAndPersistence,
  __resetAutoSaveForTests,
} from "./autosave";
import {
  savePersistedProject,
  loadPersistedProject,
  clearPersistedProject,
} from "./project-persist";
import { project, resetStore, mutate } from "./store";
import { createDefaultProject } from "./project";

function waitMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("autosave wiring", () => {
  beforeEach(async () => {
    await clearPersistedProject();
    resetStore();
    __resetAutoSaveForTests();
  });

  it("hydrateFromPersistence returns false and leaves the default doc when the store is empty", async () => {
    const before = project.value;
    const restored = await hydrateFromPersistence();
    expect(restored).toBe(false);
    expect(project.value).toEqual(before);
  });

  it("hydrateFromPersistence loads a saved project back into the signal", async () => {
    const saved = createDefaultProject();
    saved.meta.name = "Saved WhiteRqbbit";
    await savePersistedProject(saved);

    const restored = await hydrateFromPersistence();
    expect(restored).toBe(true);
    expect(project.value.meta.name).toBe("Saved WhiteRqbbit");
  });

  it("installAutoSave writes to IndexedDB on mutate after hydration", async () => {
    installAutoSave(10); // small debounce for tests
    await hydrateFromPersistence(); // flips `hydrated` so saves become live

    mutate((doc) => {
      doc.meta.name = "After mutation";
    });
    await waitMs(50);
    const back = await loadPersistedProject();
    expect(back?.meta.name).toBe("After mutation");
  });

  it("installAutoSave does NOT write before hydration completes", async () => {
    // No hydrate call here — saves must stay dormant so they can't race the
    // pending load and clobber good saved state with the in-memory default.
    installAutoSave(10);
    mutate((doc) => {
      doc.meta.name = "should not land";
    });
    await waitMs(50);
    expect(await loadPersistedProject()).toBeNull();
  });

  it("debounces rapid mutations into one write", async () => {
    installAutoSave(30);
    await hydrateFromPersistence();

    for (let i = 0; i < 5; i++) {
      mutate((doc) => {
        doc.meta.name = `step-${i}`;
      });
    }
    await waitMs(10);
    // Mid-debounce: still nothing saved because the timer keeps resetting.
    expect(await loadPersistedProject()).toBeNull();
    await waitMs(60);
    const back = await loadPersistedProject();
    expect(back?.meta.name).toBe("step-4");
  });

  it("resetProjectAndPersistence clears both IDB and the in-memory store", async () => {
    const p = createDefaultProject();
    p.meta.name = "Will be nuked";
    await savePersistedProject(p);
    mutate((doc) => {
      doc.meta.name = "Also gone";
    });

    await resetProjectAndPersistence();

    expect(await loadPersistedProject()).toBeNull();
    expect(project.value.meta.name).toBe("Untitled");
    expect(project.value.font.layers.length).toBe(0);
  });
});
