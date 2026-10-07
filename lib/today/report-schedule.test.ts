import { describe, expect, it } from "vitest";

import { DEFAULT_REPORT_PREFS, describePrefs, dueReportKey, istParts, normalizePrefs } from "./report-schedule";

// 2026-10-05 is a Monday. 03:30 UTC = 09:00 IST.
const mondayIst = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 5, h, m) - 330 * 60_000);

describe("istParts", () => {
  it("converts to India time", () => {
    const { date, weekday, hour } = istParts(mondayIst(9));
    expect({ date, weekday, hour }).toEqual({ date: "2026-10-05", weekday: 1, hour: 9 });
  });
  it("handles the UTC/IST date boundary", () => {
    const { date, weekday, hour } = istParts(new Date("2026-10-04T20:00:00Z"));
    expect({ date, weekday, hour }).toEqual({ date: "2026-10-05", weekday: 1, hour: 1 });
  });
});

describe("dueReportKey", () => {
  const weekly = { ...DEFAULT_REPORT_PREFS }; // Monday 9 AM
  it("weekly: not before the chosen hour, due from then until the week ends", () => {
    expect(dueReportKey(weekly, mondayIst(8, 59))).toBe(null);
    expect(dueReportKey(weekly, mondayIst(9))).toBe("report:w:2026-W41");
    // Late cron on Wednesday still catches up, same key, so it is sent once.
    expect(dueReportKey(weekly, new Date(mondayIst(9).getTime() + 2 * 86_400_000))).toBe("report:w:2026-W41");
  });
  it("weekly on Friday is not due on Monday", () => {
    expect(dueReportKey({ ...weekly, weekday: 5 }, mondayIst(12))).toBe(null);
  });
  it("daily: one key per IST day after the chosen hour", () => {
    const daily = { ...weekly, frequency: "daily" as const, hour: 7 };
    expect(dueReportKey(daily, mondayIst(6))).toBe(null);
    expect(dueReportKey(daily, mondayIst(7))).toBe("report:d:2026-10-05");
    expect(dueReportKey(daily, mondayIst(23))).toBe("report:d:2026-10-05");
  });
  it("respects minutes: 7:30 is not due at 7:29, due at 7:30", () => {
    const daily = { ...weekly, frequency: "daily" as const, hour: 7, minute: 30 };
    expect(dueReportKey(daily, mondayIst(7, 29))).toBe(null);
    expect(dueReportKey(daily, mondayIst(7, 30))).toBe("report:d:2026-10-05");
  });
  it("off never sends", () => {
    expect(dueReportKey({ ...weekly, frequency: "off" }, mondayIst(12))).toBe(null);
  });
});

describe("normalizePrefs", () => {
  it("defaults bad input", () => {
    expect(normalizePrefs({ frequency: "hourly", weekday: 9, hour: 25, alerts: "yes" })).toEqual(DEFAULT_REPORT_PREFS);
    expect(normalizePrefs(null)).toEqual(DEFAULT_REPORT_PREFS);
  });
  it("keeps valid input", () => {
    expect(normalizePrefs({ frequency: "daily", weekday: 3, hour: 0, minute: 45, alerts: false })).toEqual({ frequency: "daily", weekday: 3, hour: 0, minute: 45, alerts: false });
  });
  it("describes", () => {
    expect(describePrefs(DEFAULT_REPORT_PREFS)).toBe("Every Monday, 9:00 AM IST");
    expect(describePrefs({ ...DEFAULT_REPORT_PREFS, frequency: "daily", hour: 18 })).toBe("Every day, 6:00 PM IST");
    expect(describePrefs({ ...DEFAULT_REPORT_PREFS, frequency: "daily", hour: 7, minute: 45 })).toBe("Every day, 7:45 AM IST");
  });
});
