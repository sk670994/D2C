import { describe, expect, it } from "vitest";
import { readyEnough } from "./ready";

describe("ready email threshold", () => {
  it("needs a known Meta total and 90% coverage", () => {
    expect(readyEnough(140, 144)).toBe(true);
    expect(readyEnough(40, 144)).toBe(false);
    expect(readyEnough(10, null)).toBe(false);
    expect(readyEnough(0, 0)).toBe(false);
  });
});
