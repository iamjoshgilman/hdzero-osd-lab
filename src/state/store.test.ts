import { describe, it, expect, beforeEach } from "vitest";
import {
  project,
  mutate,
  undo,
  redo,
  canUndo,
  canRedo,
  replaceProject,
  resetStore,
} from "./store";
import { createDefaultProject } from "./project";

describe("store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts with a default project", () => {
    const p = project.value;
    expect(p.meta.name).toBe("Untitled");
    expect(p.font.layers).toHaveLength(0);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it("mutate produces a new value with updated timestamp", async () => {
    const original = project.value;
    const originalUpdatedAt = original.meta.updatedAt;
    // Wait a millisecond so the timestamp is guaranteed to advance.
    await new Promise((r) => setTimeout(r, 2));
    mutate((d) => {
      d.meta.name = "renamed";
    });
    const after = project.value;
    expect(after).not.toBe(original); // new reference
    expect(after.meta.name).toBe("renamed");
    expect(after.meta.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("mutate does not mutate the previous value in place", () => {
    const snapshot = project.value;
    mutate((d) => {
      d.meta.name = "after";
    });
    expect(snapshot.meta.name).toBe("Untitled"); // original unchanged
  });

  it("undo reverts, redo replays", () => {
    mutate((d) => {
      d.meta.name = "v1";
    });
    mutate((d) => {
      d.meta.name = "v2";
    });
    expect(project.value.meta.name).toBe("v2");
    expect(undo()).toBe(true);
    expect(project.value.meta.name).toBe("v1");
    expect(undo()).toBe(true);
    expect(project.value.meta.name).toBe("Untitled");
    expect(undo()).toBe(false);
    expect(redo()).toBe(true);
    expect(project.value.meta.name).toBe("v1");
  });

  it("mutating after undo clears the redo future", () => {
    mutate((d) => {
      d.meta.name = "v1";
    });
    undo();
    expect(canRedo()).toBe(true);
    mutate((d) => {
      d.meta.name = "v2";
    });
    expect(canRedo()).toBe(false);
  });

  it("replaceProject pushes onto undo stack", () => {
    const fresh = createDefaultProject();
    fresh.meta.name = "imported";
    replaceProject(fresh);
    expect(project.value.meta.name).toBe("imported");
    expect(canUndo()).toBe(true);
  });

  it("resetStore wipes history", () => {
    mutate((d) => {
      d.meta.name = "a";
    });
    expect(canUndo()).toBe(true);
    resetStore();
    expect(canUndo()).toBe(false);
    expect(project.value.meta.name).toBe("Untitled");
  });
});
