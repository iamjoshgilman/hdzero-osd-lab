// IndexedDB-backed persistence for the current ProjectDoc. Keeps user work
// (layers, OSD layout, custom text, tints, logos) across page reloads. The
// doc serializes via the existing projectToJson/projectFromJson helpers;
// binary assets live in their own IndexedDB store (see assets.ts) and are
// still referenced by hash, so this store only needs to hold the JSON text.
//
// Separate DB name from the assets store so a schema bump on one doesn't
// force a migration on the other, and so either can be wiped independently
// during recovery.

import type { ProjectDoc } from "./project";
import { projectToJson, projectFromJson } from "./persistence";

const DB_NAME = "hdzero-osd-lab-project";
const DB_VERSION = 1;
const STORE_NAME = "project";
const PROJECT_KEY = "current";

interface StoredProject {
  key: string;
  json: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("project DB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

/** Write the current project as JSON under the fixed "current" key. */
export async function savePersistedProject(doc: ProjectDoc): Promise<void> {
  const json = projectToJson(doc);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({
        key: PROJECT_KEY,
        json,
        savedAt: new Date().toISOString(),
      } satisfies StoredProject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Read the last-saved project back. Returns null if the store is empty or
 * the JSON is unparseable (we prefer falling back to bootstrap over crashing
 * the app on startup for a single corrupt record).
 */
export async function loadPersistedProject(): Promise<ProjectDoc | null> {
  const db = await openDb();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    const record = raw as StoredProject;
    try {
      return projectFromJson(record.json);
    } catch (err) {
      console.warn("persisted project failed to parse, discarding:", err);
      return null;
    }
  } finally {
    db.close();
  }
}

/** Remove the persisted project. Used by the "New project" reset flow. */
export async function clearPersistedProject(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PROJECT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
