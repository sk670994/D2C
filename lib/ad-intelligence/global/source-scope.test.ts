import { describe, expect, it } from "vitest";

import { coveragePercent, normalizeKeywordScope, sourceScopeFor, statusScopeForDepth } from "./source-scope";

describe("sourceScopeFor", () => {
  it("uses the Page ID for an exact advertiser", () => {
    expect(sourceScopeFor({ mode: "advertiser", query: "MARS", pageId: "123456" })).toEqual({ scopeType: "page", scopeKey: "123456" });
  });

  it("never compares a brand NAME search with Meta's keyword count", () => {
    expect(sourceScopeFor({ mode: "advertiser", query: "MARS", pageId: null })).toBeNull();
    expect(sourceScopeFor({ mode: "advertiser", query: "MARS", pageId: "abc" })).toBeNull();
  });

  it("uses the normalized keyword for keyword searches", () => {
    expect(sourceScopeFor({ mode: "keyword", query: "  Buy 1   Get 1 " })).toEqual({ scopeType: "keyword", scopeKey: "buy 1 get 1" });
    expect(sourceScopeFor({ mode: "keyword", query: "a" })).toBeNull();
  });

  it("ignores the Page ID in keyword mode", () => {
    expect(sourceScopeFor({ mode: "keyword", query: "sunscreen", pageId: "123" })?.scopeType).toBe("keyword");
  });
});

describe("helpers", () => {
  it("maps depth to Meta's active_status", () => {
    expect(statusScopeForDepth("quick")).toBe("active");
    expect(statusScopeForDepth("deep")).toBe("all");
  });

  it("normalizes keywords", () => {
    expect(normalizeKeywordScope("SunScreen\tSPF 50")).toBe("sunscreen spf 50");
  });

  it("computes coverage only when comparable", () => {
    expect(coveragePercent(398, 412)).toBe(97);
    expect(coveragePercent(500, 412)).toBe(100);
    expect(coveragePercent(10, 0)).toBeNull();
    expect(coveragePercent(10, null)).toBeNull();
  });
});
