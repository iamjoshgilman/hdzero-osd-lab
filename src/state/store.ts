// Reactive project store. The single source of truth for every UI component.
// Every mutation goes through `mutate()` so updatedAt and the undo stack stay
// in sync. Readers use `useSignal` / `useComputed` from @preact/signals to
// subscribe to relevant slices.

import { signal } from "@preact/signals";
import type { ProjectDoc } from "./project";
import { createDefaultProject } from "./project";
import { UndoStack } from "./undo";

export const project = signal<ProjectDoc>(createDefaultProject());

const history = new UndoStack<ProjectDoc>();

/**
 * Apply a mutation to the current project document. The `fn` receives a
 * deep-cloned draft and mutates it in place. The previous doc is pushed onto
 * the undo stack; `updatedAt` is refreshed.
 *
 * Keeps semantics simple: every `mutate` call is one undo step. If a UI flow
 * wants to group several operations into a single step (e.g. drag-move), it
 * should apply them within one `mutate()` call.
 */
export function mutate(fn: (draft: ProjectDoc) => void): void {
  history.push(project.value);
  const next = structuredClone(project.value);
  fn(next);
  next.meta.updatedAt = new Date().toISOString();
  project.value = next;
}

/**
 * Apply a mutation WITHOUT pushing to the undo stack. For live-edit sessions
 * where each keystroke / slider tick updates the doc — pushing every
 * intermediate state onto undo would make a single edit session take 50
 * undos to rewind. Callers should pair this with beginEditSession +
 * commitEditSession so the session collapses to a single undo entry.
 *
 * Safe to use outside a session, but only when the mutation is semantically
 * trivial (e.g. an in-flight drag). Anything durable should go through
 * `mutate()` instead.
 */
export function mutateLive(fn: (draft: ProjectDoc) => void): void {
  const next = structuredClone(project.value);
  fn(next);
  next.meta.updatedAt = new Date().toISOString();
  project.value = next;
}

/**
 * Capture a snapshot to anchor a live-edit session. Call on editor open, then
 * run all in-session edits through `mutateLive`. End the session with either
 * `commitEditSession(snapshot)` (Save — one undo entry) or
 * `rollbackEditSession(snapshot)` (Cancel — restore, no undo entry).
 */
export function beginEditSession(): ProjectDoc {
  return structuredClone(project.value);
}

/** Push the pre-session snapshot onto the undo stack. One undo undoes the session. */
export function commitEditSession(snapshot: ProjectDoc): void {
  history.push(snapshot);
}

/** Restore the pre-session snapshot without touching the undo stack. */
export function rollbackEditSession(snapshot: ProjectDoc): void {
  project.value = snapshot;
}

/** Replace the whole document (e.g. on file import). Pushes onto undo stack. */
export function replaceProject(doc: ProjectDoc): void {
  history.push(project.value);
  project.value = doc;
}

/** Swap one step back in history. Returns true if something was undone. */
export function undo(): boolean {
  const prev = history.undo(project.value);
  if (!prev) return false;
  project.value = prev;
  return true;
}

/** Swap one step forward in history. Returns true if something was redone. */
export function redo(): boolean {
  const next = history.redo(project.value);
  if (!next) return false;
  project.value = next;
  return true;
}

export function canUndo(): boolean {
  return history.canUndo();
}

export function canRedo(): boolean {
  return history.canRedo();
}

/** Reset state — primarily for tests and "new project" workflow. */
export function resetStore(doc: ProjectDoc = createDefaultProject()): void {
  history.clear();
  project.value = doc;
}
