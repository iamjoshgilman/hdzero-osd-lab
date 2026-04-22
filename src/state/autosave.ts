// Auto-save wiring: subscribes to the project signal and writes the current
// doc to IndexedDB after every mutation (debounced so a drag-move doesn't
// trigger hundreds of serializations). Also exposes the boot-time hydration
// entry point. Kept in its own module so the pure signal store stays free of
// IDB imports (cleaner for tests that don't care about persistence).

import { effect } from "@preact/signals";
import { project, replaceProject, resetStore } from "./store";
import {
  savePersistedProject,
  loadPersistedProject,
  clearPersistedProject,
} from "./project-persist";

let hydrated = false;
let installed = false;
let disposer: (() => void) | null = null;
let pendingTimer: number | null = null;

/**
 * Try to restore the last-saved project from IndexedDB. Call once on app
 * boot before installing the auto-save effect. Returns true if a saved
 * project was found and loaded, false if the store was empty / unreadable /
 * the saved JSON failed validation.
 */
export async function hydrateFromPersistence(): Promise<boolean> {
  try {
    const doc = await loadPersistedProject();
    if (!doc) return false;
    // replaceProject pushes onto the undo stack; since the stack starts empty
    // on boot, the user ends up with one "pre-hydration" default state they
    // could undo back to. Acceptable — better than silently losing a step.
    replaceProject(doc);
    return true;
  } catch (err) {
    console.error("hydrateFromPersistence failed:", err);
    return false;
  } finally {
    hydrated = true;
  }
}

/**
 * Install the signals effect that persists the project on every mutation.
 * Idempotent — safe to call from multiple mount points. Saves are debounced
 * by `debounceMs` (default 300) so a drag-move collapses into a single write.
 *
 * The effect skips saving until `hydrated` is true, so we never race the
 * boot-time load and clobber a good saved state with the in-memory default.
 */
export function installAutoSave(debounceMs = 300): void {
  if (installed) return;
  installed = true;
  disposer = effect(() => {
    const doc = project.value;
    if (!hydrated) return;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      savePersistedProject(doc).catch((err) =>
        console.error("auto-save failed:", err),
      );
      pendingTimer = null;
    }, debounceMs);
  });
}

/**
 * "New project" reset. Wipes the persisted doc AND the in-memory store so
 * the next render falls back to the auto-bootstrap path (sample font). Undo
 * stack is cleared too — post-reset there's nothing meaningful to go back
 * to. Does not touch the asset cache; uploaded fonts/logos stay available to
 * reuse.
 */
export async function resetProjectAndPersistence(): Promise<void> {
  await clearPersistedProject();
  resetStore();
}

// ---- Test hooks ------------------------------------------------------------
// Not exported from index; used only by autosave.test.ts to reset state
// between runs so installAutoSave can be asserted more than once.

/** @internal */
export function __resetAutoSaveForTests(): void {
  if (disposer) {
    disposer();
    disposer = null;
  }
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  hydrated = false;
  installed = false;
}
