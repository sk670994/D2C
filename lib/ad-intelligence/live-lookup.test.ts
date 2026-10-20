import { describe, expect, it } from "vitest";

import {
  atCreditFloor,
  creditsRemainingFrom,
  decideLookup,
  drainMayRun,
  lookupMaxPages,
  paidCreditFloor,
  paidCreditStart,
} from "./credit-guard";
import { parseScrapeCreatorsPage } from "./sources/scrapecreators-meta";

const NOW = Date.UTC(2026, 9, 22, 6, 0);
const HOUR = 60 * 60_000;
const base = {
  mode: "advertiser" as const,
  storedActive: 100,
  metaActiveTotal: 100,
  lastCompleteScanAt: NOW - 2 * HOUR,
  fullReadRecently: false,
  creditsUsedToday: 0,
  dailyCap: 400,
  maxPages: 60,
  quickPages: 2,
  now: NOW,
};

describe("live look-up decision", () => {
  it("reads a brand we hold nothing of in full", () => {
    expect(decideLookup({ ...base, storedActive: 0, metaActiveTotal: null, lastCompleteScanAt: null })).toEqual({ action: "full", pages: 60, reason: "new" });
  });

  it("reads in full when coverage is under 90% of Meta's live count", () => {
    expect(decideLookup({ ...base, storedActive: 89 })).toEqual({ action: "full", pages: 60, reason: "incomplete" });
    expect(decideLookup({ ...base, storedActive: 90 }).action).toBe("none");
  });

  it("reads in full when the last complete scan is older than 24 h (or never)", () => {
    expect(decideLookup({ ...base, lastCompleteScanAt: NOW - 25 * HOUR })).toMatchObject({ action: "full", reason: "stale" });
    expect(decideLookup({ ...base, lastCompleteScanAt: null })).toMatchObject({ action: "full", reason: "stale" });
  });

  it("spends nothing on a complete, fresh brand", () => {
    expect(decideLookup(base)).toEqual({ action: "none", reason: "fresh" });
  });

  it("does not buy a second full read of a page within the interval", () => {
    expect(decideLookup({ ...base, storedActive: 10, fullReadRecently: true })).toEqual({ action: "none", reason: "recent_full_read" });
  });

  it("caps pages by the daily budget and defers when it is used", () => {
    expect(decideLookup({ ...base, storedActive: 0, creditsUsedToday: 390 })).toMatchObject({ action: "full", pages: 10 });
    expect(decideLookup({ ...base, storedActive: 0, creditsUsedToday: 400 })).toEqual({ action: "deferred", reason: "daily_cap" });
  });

  it("keeps keyword searches quick", () => {
    expect(decideLookup({ ...base, mode: "keyword" })).toEqual({ action: "quick", pages: 2 });
    expect(decideLookup({ ...base, mode: "keyword", creditsUsedToday: 400 })).toEqual({ action: "deferred", reason: "daily_cap" });
  });

  it("stops at the credit floor and never reads past it", () => {
    const fresh = { ...base, storedActive: 0 };
    expect(decideLookup({ ...fresh, creditsRemaining: 1000, creditFloor: 1000 })).toEqual({ action: "deferred", reason: "credit_floor" });
    expect(decideLookup({ ...fresh, creditsRemaining: 900, creditFloor: 1000 })).toEqual({ action: "deferred", reason: "credit_floor" });
    expect(decideLookup({ ...fresh, creditsRemaining: 1020, creditFloor: 1000 })).toMatchObject({ action: "full", pages: 20 });
    expect(decideLookup({ ...fresh, creditsRemaining: null, creditFloor: 1000 })).toMatchObject({ action: "full", pages: 60 });
    expect(decideLookup({ ...base, mode: "keyword", creditsRemaining: 999, creditFloor: 1000 })).toEqual({ action: "deferred", reason: "credit_floor" });
  });
});

describe("credit floor", () => {
  it("reads settings with defaults", () => {
    expect(paidCreditFloor({})).toBe(1000);
    expect(paidCreditFloor({ ADSPY_PAID_CREDIT_FLOOR: "500" })).toBe(500);
    expect(lookupMaxPages({})).toBe(60);
    expect(lookupMaxPages({ ADSPY_LOOKUP_MAX_PAGES: "0" })).toBe(1);
    expect(paidCreditStart({})).toBeNull();
    expect(paidCreditStart({ ADSPY_PAID_CREDIT_START: "5705" })).toBeNull();
    expect(paidCreditStart({ ADSPY_PAID_CREDIT_START: "5705", ADSPY_PAID_CREDIT_START_AT: "2026-10-22" })).toEqual({
      start: 5705,
      at: "2026-10-22T00:00:00.000Z",
    });
  });

  it("prefers the balance the API reported, else the configured start minus spend", () => {
    expect(creditsRemainingFrom({ observed: 4200, spentSinceObserved: 30, start: 5705, spentSinceStart: 10 })).toEqual({ remaining: 4170, source: "api" });
    expect(creditsRemainingFrom({ observed: null, start: 5705, spentSinceStart: 705 })).toEqual({ remaining: 5000, source: "estimate" });
    expect(creditsRemainingFrom({ observed: null, start: null, spentSinceStart: 0 })).toBeNull();
  });

  it("is reached at or below the floor, never when unknown", () => {
    expect(atCreditFloor(1000, 1000)).toBe(true);
    expect(atCreditFloor(999, 1000)).toBe(true);
    expect(atCreditFloor(1001, 1000)).toBe(false);
    expect(atCreditFloor(null, 1000)).toBe(false);
  });

  it("parses the balance from ScrapeCreators responses", () => {
    expect(parseScrapeCreatorsPage({ results: [], credits_remaining: 4321 }, 5).creditsRemaining).toBe(4321);
    expect(parseScrapeCreatorsPage({ results: [] }, 5).creditsRemaining).toBeNull();
  });
});

describe("drain on Vercel", () => {
  it("spends paid credits only on people's look-ups when nights run on the PC", () => {
    expect(drainMayRun({ paidLookup: true }, { ADSPY_NIGHTLY_ON_PC: "1" })).toBe(true);
    expect(drainMayRun({}, { ADSPY_NIGHTLY_ON_PC: "1" })).toBe(false);
    expect(drainMayRun(null, { ADSPY_NIGHTLY_ON_PC: "1" })).toBe(false);
    expect(drainMayRun({}, {})).toBe(true);
  });
});
