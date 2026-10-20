import { describe, expect, it } from "vitest";

import { finalStop, isScanComplete, sortOldestFirst, stopCapExceeded, strikeDecision } from "./scan-rules";

describe("isScanComplete", () => {
  const base = { stoppedBy: "done" as const, hasNextPage: false, metaTotal: 1300, collected: 1300 };

  it("needs done + no next page + >= 98% of Meta's total", () => {
    expect(isScanComplete(base)).toBe(true);
    expect(isScanComplete({ ...base, collected: 1274 })).toBe(true); // 98%
    expect(isScanComplete({ ...base, collected: 1273 })).toBe(false);
  });

  it("Kapiva 19 Oct: 1,178 of ~1,300 is not complete", () => {
    expect(isScanComplete({ ...base, collected: 1178 })).toBe(false);
  });

  it("unknown Meta total, unknown paging, deadline or rate limit = not complete", () => {
    expect(isScanComplete({ ...base, metaTotal: null })).toBe(false);
    expect(isScanComplete({ ...base, hasNextPage: null })).toBe(false);
    expect(isScanComplete({ ...base, hasNextPage: true })).toBe(false);
    expect(isScanComplete({ ...base, stoppedBy: "deadline" })).toBe(false);
    expect(isScanComplete({ ...base, stoppedBy: "rate_limited" })).toBe(false);
  });

  it("empty page with Meta total 0 is complete", () => {
    expect(isScanComplete({ ...base, metaTotal: 0, collected: 0 })).toBe(true);
  });
});

describe("finalStop", () => {
  it("rate limit after the last growth = rate_limited", () => {
    expect(finalStop({ stoppedBy: "done", lastRateLimitAt: 200, lastGrowthAt: 100, hasNextPageFalseAt: 0 })).toBe("rate_limited");
  });
  it("growth after the rate limit = done", () => {
    expect(finalStop({ stoppedBy: "done", lastRateLimitAt: 100, lastGrowthAt: 200, hasNextPageFalseAt: 0 })).toBe("done");
  });
  it("Meta's paging said no more after the rate limit = done", () => {
    expect(finalStop({ stoppedBy: "done", lastRateLimitAt: 100, lastGrowthAt: 50, hasNextPageFalseAt: 300 })).toBe("done");
  });
  it("keeps deadline", () => {
    expect(finalStop({ stoppedBy: "deadline", lastRateLimitAt: 0, lastGrowthAt: 0, hasNextPageFalseAt: 0 })).toBe("deadline");
  });
});

describe("stopCapExceeded (15%)", () => {
  it("blocks a mass stop", () => {
    expect(stopCapExceeded(583, 1300)).toBe(true);
    expect(stopCapExceeded(196, 1300)).toBe(true);
  });
  it("allows normal churn", () => {
    expect(stopCapExceeded(195, 1300)).toBe(false);
    expect(stopCapExceeded(0, 1300)).toBe(false);
  });
  it("small pages: a few ads are always allowed", () => {
    expect(stopCapExceeded(3, 4)).toBe(false);
    expect(stopCapExceeded(6, 10)).toBe(true);
  });
});

describe("strikeDecision", () => {
  it("first miss counts, second miss stops", () => {
    expect(strikeDecision(0)).toEqual({ missedScans: 1, stop: false });
    expect(strikeDecision(1)).toEqual({ missedScans: 2, stop: true });
    expect(strikeDecision(5)).toEqual({ missedScans: 6, stop: true });
  });
});

describe("sortOldestFirst", () => {
  it("never completed first, then oldest, stable for ties", () => {
    const items = [
      { n: "a", at: "2026-10-18T00:00:00Z" },
      { n: "b", at: null },
      { n: "c", at: "2026-10-10T00:00:00Z" },
      { n: "d", at: "bad" },
      { n: "e", at: "2026-10-18T00:00:00Z" },
    ];
    expect(sortOldestFirst(items, (i) => i.at).map((i) => i.n)).toEqual(["b", "d", "c", "a", "e"]);
  });
});
