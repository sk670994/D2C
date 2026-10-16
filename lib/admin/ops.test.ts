import { describe, expect, it } from "vitest";

import { dbHealth, summarizeCounters, summarizeCoverage, summarizeRuns } from "./ops";

describe("founder ops", () => {
  it("summarizes runs", () => {
    const r = summarizeRuns([
      { status: "exhausted", persisted_ads: 596, created_at: "2026-10-16T19:30:00Z", started_at: "2026-10-16T19:31:00Z", completed_at: "2026-10-16T19:37:00Z", error_message: null },
      { status: "failed", persisted_ads: 25, created_at: "2026-10-16T19:40:00Z", started_at: null, completed_at: null, error_message: "Failed to update collection job: TimeoutError" },
      { status: "failed", persisted_ads: null, created_at: "2026-10-16T19:50:00Z", started_at: null, completed_at: null, error_message: "Failed to update collection job: other" },
      { status: "running", persisted_ads: 10, created_at: "2026-10-16T20:00:00Z", started_at: "2026-10-16T20:00:00Z", completed_at: null, error_message: null },
    ]);
    expect(r).toMatchObject({ total: 4, done: 1, failed: 2, running: 1, ads: 631, firstStart: "2026-10-16T19:31:00Z", lastEnd: "2026-10-16T19:37:00Z" });
    expect(r.topError).toEqual({ message: "Failed to update collection job", count: 2 });
  });

  it("summarizes coverage, worst first", () => {
    const c = summarizeCoverage(
      [
        { scope_key: "1", meta_total: 596, collected_ads: 596, observed_at: "" },
        { scope_key: "2", meta_total: 1000, collected_ads: 400, observed_at: "" },
        { scope_key: "3", meta_total: 100, collected_ads: 90, observed_at: "" },
      ],
      new Map([["2", "The Derma Co"]]),
    );
    expect(c.pages).toBe(3);
    expect(c.complete).toBe(1);
    expect(c.incomplete.map((i) => i.name)).toEqual(["The Derma Co", "3"]);
  });

  it("counts calls with a cap", () => {
    expect(summarizeCounters([{ key: "a", hits: 5 }, { key: "b", hits: 1 }], 3)).toEqual({ users: 2, calls: 4, atCap: 1 });
  });

  it("db health uses the post-fix baseline", () => {
    expect(dbHealth({ db_bytes: 335 * 1024 * 1024, creatives_upd: 97_657 + 765, creatives_hot: 774 + 365 })).toEqual({ mb: 335, pctOfLimit: 67, hotPct: 47.7 });
    expect(dbHealth(null)).toBeNull();
  });
});
