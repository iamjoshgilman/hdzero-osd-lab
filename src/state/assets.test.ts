import { describe, it, expect, beforeEach } from "vitest";
import "../test/setup-indexeddb";
import {
  hashBytes,
  putAsset,
  getAsset,
  deleteAsset,
  listAssets,
  evictUnused,
} from "./assets";

async function wipeDb(): Promise<void> {
  // fake-indexeddb exposes a factory reset; reimporting is the simplest way.
  // We just clear entries via listAssets + delete since deleteDatabase race-
  // conditions with the cached DB handle.
  const all = await listAssets();
  for (const rec of all) await deleteAsset(rec.hash);
}

describe("assets (IndexedDB)", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  it("hashBytes produces a stable SHA-256 hex for the same input", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const a = await hashBytes(bytes);
    const b = await hashBytes(bytes);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different bytes hash differently", async () => {
    const a = await hashBytes(new Uint8Array([1, 2, 3]).buffer);
    const b = await hashBytes(new Uint8Array([1, 2, 4]).buffer);
    expect(a).not.toBe(b);
  });

  it("putAsset + getAsset round-trip", async () => {
    const bytes = new Uint8Array([10, 20, 30]).buffer;
    const hash = await putAsset(bytes, { name: "demo.bin", mime: "application/octet-stream" });
    const got = await getAsset(hash);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("demo.bin");
    expect(got!.mime).toBe("application/octet-stream");
    expect(new Uint8Array(got!.bytes)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it("putAsset returns the same hash for identical content", async () => {
    const bytes = new Uint8Array([0xab, 0xcd]).buffer;
    const h1 = await putAsset(bytes, { name: "a.bin", mime: "x" });
    const h2 = await putAsset(bytes.slice(0), { name: "b.bin", mime: "y" });
    expect(h1).toBe(h2);
  });

  it("getAsset returns null for unknown hashes", async () => {
    const missing = await getAsset("x".repeat(64));
    expect(missing).toBeNull();
  });

  it("listAssets returns metadata without bytes duplication", async () => {
    await putAsset(new Uint8Array([1]).buffer, { name: "a", mime: "m" });
    await putAsset(new Uint8Array([2]).buffer, { name: "b", mime: "m" });
    const all = await listAssets();
    expect(all).toHaveLength(2);
    expect(all[0]!.size).toBe(1);
  });

  it("deleteAsset removes the record", async () => {
    const hash = await putAsset(new Uint8Array([7]).buffer, { name: "x", mime: "m" });
    await deleteAsset(hash);
    expect(await getAsset(hash)).toBeNull();
  });

  it("evictUnused removes records not in the keep-set", async () => {
    const h1 = await putAsset(new Uint8Array([1]).buffer, { name: "keep", mime: "m" });
    const h2 = await putAsset(new Uint8Array([2]).buffer, { name: "gone", mime: "m" });
    const deleted = await evictUnused(new Set([h1]));
    expect(deleted).toBe(1);
    expect(await getAsset(h1)).not.toBeNull();
    expect(await getAsset(h2)).toBeNull();
  });
});
