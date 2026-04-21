// Smoke test proving the test harness works. Real tests land in v0.1 Track A.
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
