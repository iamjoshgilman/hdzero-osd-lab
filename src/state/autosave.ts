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
import { persistenceError } from "./ui-state";

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
    if (!doc) {
      hydrated = true;
      return false;
    }
    // Flip `hydrated` BEFORE `replaceProject()` so the autosave effect sees
    // the correct value on the very first invocation. Previously the flag
    // lived in a finally block that ran after replaceProject triggered the
    // effect, producing a brief window where the first-run saw hydrated=false,
    // bailed, then the next re-run saw true and saved — a redundant write
    // and confusing trace. Setting it first removes the race.
    hydrated = true;
    replaceProject(doc);
    return true;
  } catch (err) {
    // IndexedDB is likely unavailable (private browsing, storage blocked).
    // Flag a persistent banner so the user knows their work won't survive a
    // reload. App keeps working in-memory-only.
    console.error("hydrateFromPersistence failed:", err);
    persistenceError.value =
      "Can't access browser storage — your work will not persist across page reloads. " +
      "Private browsing mode or blocked site data is the usual cause.";
    hydrated = true;
    return false;
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
      savePersistedProject(doc)
        .then(() => {
          // Clear any prior persistence error on successful save — a
          // transient hiccup shouldn't leave the banner showing forever.
          if (persistenceError.value) persistenceError.value = null;
        })
        .catch((err) => {
          console.error("auto-save failed:", err);
          // Quota exceeded shows up here as a DOMException with name
          // "QuotaExceededError"; surface a specific message so the user
          // knows what to clean up.
          const msg =
            err instanceof DOMException && err.name === "QuotaExceededError"
              ? "Browser storage is full — your changes aren't being saved. Clear unused assets or your browser's site data."
              : "Auto-save failed — your changes may not survive a page reload. " +
                (err instanceof Error ? err.message : String(err));
          persistenceError.value = msg;
        });
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
