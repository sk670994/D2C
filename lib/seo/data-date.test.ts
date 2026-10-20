import { describe, expect, test } from "vitest";

import { dataStamp, formatDataDate, isRefreshPending, newestDate, oldestDate } from "./data-date";

const NOW = Date.parse("2026-10-20T06:00:00Z");

describe("data date label", () => {
  test("formats as d Mon yyyy in India time", () => {
    expect(formatDataDate("2026-10-19T10:00:00Z")).toBe("19 Oct 2026");
    // 20:00 UTC is 01:30 the next day in India.
    expect(formatDataDate("2026-10-19T20:00:00Z")).toBe("20 Oct 2026");
  });
  test("newest / oldest ignore nulls and junk", () => {
    expect(newestDate([null, "2026-10-01T00:00:00Z", "bad", "2026-10-03T00:00:00Z", undefined])).toBe("2026-10-03T00:00:00.000Z");
    expect(oldestDate(["2026-10-03T00:00:00Z", null, "2026-10-01T00:00:00Z"])).toBe("2026-10-01T00:00:00.000Z");
    expect(newestDate([null, undefined])).toBeNull();
  });
  test("refresh pending only past 36 hours", () => {
    expect(isRefreshPending(new Date(NOW - 35 * 3_600_000).toISOString(), NOW)).toBe(false);
    expect(isRefreshPending(new Date(NOW - 37 * 3_600_000).toISOString(), NOW)).toBe(true);
    expect(isRefreshPending(null, NOW)).toBe(false);
  });
  test("stamp uses the data date, falls back to the build date", () => {
    const s = dataStamp("2026-10-17T00:00:00Z", NOW);
    expect(s).toEqual({ text: "Data collected 17 Oct 2026", pending: true, iso: "2026-10-17T00:00:00.000Z", fromData: true });
    const f = dataStamp(null, NOW);
    expect(f.text).toBe("Updated 20 Oct 2026");
    expect(f.pending).toBe(false);
    expect(f.fromData).toBe(false);
  });
});
