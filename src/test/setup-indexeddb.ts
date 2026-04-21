// Vitest setup that polyfills IndexedDB for jsdom using fake-indexeddb.
// Imported on demand by tests that touch the asset cache.
import "fake-indexeddb/auto";
