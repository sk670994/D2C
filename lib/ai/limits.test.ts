import { describe, expect, it } from "vitest";
import { AI_CALLS_INACTIVE, aiDailyLimit } from "./limits";

describe("AI daily limit", () => {
  it("follows the plan", () => {
    expect(aiDailyLimit({ plan: "trial", admin: false, active: true })).toBe(30);
    expect(aiDailyLimit({ plan: "growth", admin: false, active: true })).toBe(300);
    expect(aiDailyLimit({ plan: "trial", admin: false, active: false })).toBe(AI_CALLS_INACTIVE);
    expect(aiDailyLimit({ plan: "starter", admin: true, active: false })).toBe(Number.POSITIVE_INFINITY);
    expect(aiDailyLimit(null)).toBe(AI_CALLS_INACTIVE);
  });
});
