import { describe, expect, it } from "vitest";

import { isMissingFunctionError, isSlowDatabaseError } from "./slow-db";

describe("isSlowDatabaseError", () => {
  it("recognises timeouts, aborts and network failures", () => {
    expect(isSlowDatabaseError(new Error("AdSpy metrics failed: canceling statement due to statement timeout"))).toBe(true);
    expect(isSlowDatabaseError(new Error("AdSpy creative search failed: TimeoutError: The operation was aborted due to timeout"))).toBe(true);
    expect(isSlowDatabaseError(new Error("AdSpy metrics failed: TypeError: fetch failed"))).toBe(true);
    expect(isSlowDatabaseError(new Error("AdSpy metrics failed: 57014"))).toBe(true);
  });

  it("does not hide real bugs", () => {
    expect(isSlowDatabaseError(new Error("AdSpy metrics failed: column c.foo does not exist"))).toBe(false);
    expect(isSlowDatabaseError(null)).toBe(false);
  });
});

describe("isMissingFunctionError", () => {
  it("only matches a missing RPC", () => {
    expect(isMissingFunctionError({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingFunctionError({ message: "Could not find the function public.adspy_search_facets" })).toBe(true);
    expect(isMissingFunctionError({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
