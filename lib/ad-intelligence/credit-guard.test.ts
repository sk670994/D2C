import { describe, expect, it } from "vitest";

import {
  apiMinIntervalMs,
  dailyCreditCap,
  istDayKey,
  istDayStart,
  pagesAllowed,
  paidMetaSourceActive,
  quickPages,
  userBrandLimit,
} from "./credit-guard";

describe("credit guard", () => {
  it("reads caps from env with safe defaults", () => {
    expect(dailyCreditCap({})).toBe(150);
    expect(dailyCreditCap({ ADSPY_DAILY_CREDIT_CAP: "40" })).toBe(40);
    expect(dailyCreditCap({ ADSPY_DAILY_CREDIT_CAP: "abc" })).toBe(150);
    expect(quickPages({})).toBe(2);
    expect(quickPages({ META_API_QUICK_PAGES: "0" })).toBe(1);
    expect(apiMinIntervalMs({})).toBe(12 * 60 * 60_000);
  });

  it("limits live brands per user by plan", () => {
    expect(userBrandLimit({ plan: "trial", admin: false, active: true })).toBe(3);
    expect(userBrandLimit({ plan: "growth", admin: false, active: true })).toBe(15);
    expect(userBrandLimit({ plan: "trial", admin: false, active: false })).toBe(0);
    expect(userBrandLimit({ plan: "trial", admin: true, active: true })).toBe(Number.POSITIVE_INFINITY);
  });

  it("caps pages by phase, brand total and the day's budget", () => {
    const base = { perRunPages: 30, totalPagesLeft: 100, creditsUsedToday: 0, dailyCap: 150, quickPages: 2 };
    expect(pagesAllowed({ ...base, phase: "quick" })).toBe(2);
    expect(pagesAllowed({ ...base, phase: "deep" })).toBe(30);
    expect(pagesAllowed({ ...base, phase: "deep", creditsUsedToday: 140 })).toBe(10);
    expect(pagesAllowed({ ...base, phase: "quick", creditsUsedToday: 150 })).toBe(0);
    expect(pagesAllowed({ ...base, phase: "deep", totalPagesLeft: 3 })).toBe(3);
  });

  it("knows when credits are in play", () => {
    expect(paidMetaSourceActive({ ADSPY_META_SOURCE: "scrapecreators" })).toBe(true);
    expect(paidMetaSourceActive({ ADSPY_META_SOURCE: "playwright", ADSPY_COLLECTOR: "searchapi" })).toBe(false);
    expect(paidMetaSourceActive({ ADSPY_COLLECTOR: "searchapi" })).toBe(true);
    expect(paidMetaSourceActive({ ADSPY_COLLECTOR: "worker" })).toBe(false);
  });

  it("uses the IST day", () => {
    // 2026-10-13 20:00 UTC = 2026-10-14 01:30 IST
    const t = Date.UTC(2026, 9, 13, 20, 0);
    expect(istDayKey(t)).toBe("2026-10-14");
    expect(istDayStart(t).toISOString()).toBe("2026-10-13T18:30:00.000Z");
  });
});

describe("trial brand key", () => {
  it("treats spellings of one brand as one", async () => {
    const { trialBrandKey } = await import("./credit-guard");
    expect(trialBrandKey("P-TAL")).toBe("ptal");
    expect(trialBrandKey("ptal")).toBe("ptal");
    expect(trialBrandKey(" P TAL ")).toBe("ptal");
    expect(trialBrandKey("L'Oréal")).toBe("loreal");
    expect(trialBrandKey("145350652898615")).toBe("page-145350652898615");
  });
});
