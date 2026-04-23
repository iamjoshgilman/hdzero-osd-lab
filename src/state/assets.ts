// IndexedDB-backed asset blob cache. Binary inputs (user-uploaded BMPs, TTFs,
// PNGs, SVGs) are stored here keyed by their SHA-256 content hash so the
// project JSON stays small and human-readable. Project docs reference assets
// via AssetRef.hash; compose() never sees raw bytes.

const DB_NAME = "hdzero-osd-lab";
const DB_VERSION = 1;
const STORE_NAME = "assets";

interface StoredAsset {
  hash: string;
  name: string;
  mime: string;
  bytes: ArrayBuffer;
  addedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "hash" });
      }
    };
  });
}

/** Hex-encoded SHA-256 of a byte blob. */
export async function hashBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  // Copy into a fresh Uint8Array so we never pass a SharedArrayBuffer-backed
  // view to crypto.subtle.digest (which strict TS + strict Node WebCrypto
  // both reject). Pass the TypedArray itself, not `.buffer` — `.buffer`
  // hits a realm-crossing `instanceof ArrayBuffer` check under vitest/jsdom
  // on Node 22+ that returns false and throws TypeError from SubtleCrypto.
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Store a blob, returning its hash. Re-storing the same content is a no-op. */
export async function putAsset(
  bytes: ArrayBuffer,
  meta: { name: string; mime: string },
): Promise<string> {
  const hash = await hashBytes(bytes);
  const db = await openDb();
  try {
    await txPromise(db, "readwrite", (store) => {
      store.put({
        hash,
        name: meta.name,
        mime: meta.mime,
        bytes,
        addedAt: new Date().toISOString(),
      } satisfies StoredAsset);
    });
  } finally {
    db.close();
  }
  return hash;
}

/**
 * Shape guard for a StoredAsset record read back from IndexedDB. The
 * `bytes` check uses duck typing (byteLength is a number) rather than
 * `instanceof ArrayBuffer` because cross-realm IDB reads — especially
 * under fake-indexeddb in tests — can hand back ArrayBuffer-like values
 * whose constructor lives in a different realm and fails instanceof.
 */
function isStoredAsset(raw: unknown): raw is StoredAsset {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Partial<StoredAsset>;
  return (
    typeof r.hash === "string" &&
    typeof r.name === "string" &&
    typeof r.mime === "string" &&
    typeof r.addedAt === "string" &&
    r.bytes !== undefined &&
    r.bytes !== null &&
    typeof (r.bytes as ArrayBuffer).byteLength === "number"
  );
}

/** Read a blob by hash. Returns null if absent or malformed. */
export async function getAsset(
  hash: string,
): Promise<{ bytes: ArrayBuffer; name: string; mime: string } | null> {
  const db = await openDb();
  try {
    return await getPromise(db, (store) => store.get(hash)).then((raw) => {
      if (!raw) return null;
      if (!isStoredAsset(raw)) {
        console.warn("asset record has unexpected shape, skipping:", hash);
        return null;
      }
      return { bytes: raw.bytes, name: raw.name, mime: raw.mime };
    });
  } finally {
    db.close();
  }
}

/** Remove one asset by hash. Silent no-op if absent. */
export async function deleteAsset(hash: string): Promise<void> {
  const db = await openDb();
  try {
    await txPromise(db, "readwrite", (store) => {
      store.delete(hash);
    });
  } finally {
    db.close();
  }
}

/** List every stored asset's metadata (without loading bytes). Malformed records are skipped. */
export async function listAssets(): Promise<
  Array<{ hash: string; name: string; mime: string; addedAt: string; size: number }>
> {
  const db = await openDb();
  try {
    const out = await getPromise(db, (store) => store.getAll()).then((records) => {
      if (!Array.isArray(records)) return [];
      return records.filter(isStoredAsset).map((r) => ({
        hash: r.hash,
        name: r.name,
        mime: r.mime,
        addedAt: r.addedAt,
        size: r.bytes.byteLength,
      }));
    });
    return out;
  } finally {
    db.close();
  }
}

/** Remove every asset not in the keep-set. Used by "evict unused" maintenance. */
export async function evictUnused(keep: Set<string>): Promise<number> {
  const db = await openDb();
  let deleted = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        // Malformed records get deleted unconditionally — they're
        // unusable anyway and shouldn't keep cluttering the store.
        if (!isStoredAsset(cursor.value) || !keep.has(cursor.value.hash)) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return deleted;
}

// ----------------------------------------------------------------------------
// Promise wrappers around the IndexedDB callback API
// ----------------------------------------------------------------------------

function txPromise(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    work(store);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getPromise<T>(
  db: IDBDatabase,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = work(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
