import { isoWeek } from "./alerts";

/**
 * When each user gets their rival report. Every user picks it themselves:
 * daily or weekly (which day), at what hour (IST), or off; rival alerts on/off.
 * Pure functions: the cron asks "is this user's report due now?" and records
 * the returned key so a period is never sent twice, however often it runs.
 */

export type ReportFrequency = "daily" | "weekly" | "off";

export type ReportPrefs = {
  frequency: ReportFrequency;
  /** 1 = Monday … 7 = Sunday (weekly only). */
  weekday: number;
  /** Hour of day in IST, 0–23. */
  hour: number;
  /** Instant email when a rival makes a big move or changes an offer/price. */
  alerts: boolean;
};

export const DEFAULT_REPORT_PREFS: ReportPrefs = { frequency: "weekly", weekday: 1, hour: 9, alerts: true };

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Clean any input (DB row, request body) into valid prefs; unknown fields fall back to defaults. */
export function normalizePrefs(input: unknown): ReportPrefs {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const frequency = raw.frequency === "daily" || raw.frequency === "weekly" || raw.frequency === "off" ? raw.frequency : DEFAULT_REPORT_PREFS.frequency;
  const weekday = Number(raw.weekday);
  const hour = Number(raw.hour);
  return {
    frequency,
    weekday: Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday : DEFAULT_REPORT_PREFS.weekday,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_REPORT_PREFS.hour,
    alerts: typeof raw.alerts === "boolean" ? raw.alerts : DEFAULT_REPORT_PREFS.alerts,
  };
}

const IST_OFFSET_MS = 330 * 60_000;

/** Wall-clock parts in India (no DST, so a fixed offset is exact). */
export function istParts(now: Date): { date: string; weekday: number; hour: number; istDate: Date } {
  const istDate = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    date: istDate.toISOString().slice(0, 10),
    weekday: istDate.getUTCDay() || 7,
    hour: istDate.getUTCHours(),
    istDate,
  };
}

/**
 * The delivery key for the period that is due now, or null if nothing is due.
 * Late runs catch up: a weekly report set for Monday 9 AM still goes out on
 * Monday 3 PM or Tuesday if the cron was down, but only once per week.
 */
export function dueReportKey(prefs: ReportPrefs, now: Date): string | null {
  if (prefs.frequency === "off") return null;
  const ist = istParts(now);
  if (prefs.frequency === "daily") {
    return ist.hour >= prefs.hour ? `report:d:${ist.date}` : null;
  }
  const reached = ist.weekday > prefs.weekday || (ist.weekday === prefs.weekday && ist.hour >= prefs.hour);
  return reached ? `report:w:${isoWeek(ist.istDate)}` : null;
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

/** "Every Monday, 9:00 AM IST" / "Every day, 8:00 AM IST" / "Off". */
export function describePrefs(prefs: ReportPrefs): string {
  if (prefs.frequency === "off") return "Off";
  const when = prefs.frequency === "daily" ? "Every day" : `Every ${WEEKDAYS[prefs.weekday - 1]}`;
  return `${when}, ${hourLabel(prefs.hour)} IST`;
}
