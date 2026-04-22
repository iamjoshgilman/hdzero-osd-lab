// Smoke test proving the test harness is wired up. Substantive compositor
// tests live next to their modules (palette.test.ts, atlas.test.ts, etc).
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
