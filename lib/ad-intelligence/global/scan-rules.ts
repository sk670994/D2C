/**
 * Pure rules for the nightly collector (unit tested in scan-rules.test.ts).
 *
 * Kapiva, 19 Oct: Meta showed ~1,300 live ads, the scan read 1,178 and called
 * itself "complete" (a non-paging GraphQL response said has_next_page=false),
 * so 583 live ads were marked stopped in one go. These rules make a stop
 * decision need (1) a scan that really reached Meta's own total, (2) the ad
 * missing from two such scans in a row, and (3) a sane share of the page.
 */

export type ScanStop = "done" | "deadline" | "rate_limited";

/** A scan counts as complete only when it holds at least this share of Meta's total. */
export const COMPLETE_SHARE = 0.98;
/** More than this share of a page's live ads "missing" at once = a bad scan, stop nothing. */
export const STOP_CAP_SHARE = 0.15;
/** Small pages: up to this many missing ads are always allowed (1 of 4 is 25%, still normal). */
export const STOP_CAP_FLOOR = 5;
/** Missed in this many complete scans in a row = stopped. */
export const STRIKES_TO_STOP = 2;

/**
 * Complete = Meta's paging said "no more" AND we hold >= 98% of Meta's own
 * total. Meta's total unknown = not complete (nothing to compare with).
 */
export function isScanComplete(input: {
  stoppedBy: ScanStop;
  hasNextPage: boolean | null;
  metaTotal: number | null;
  collected: number;
}): boolean {
  if (input.stoppedBy !== "done") return false;
  if (input.hasNextPage !== false) return false;
  if (input.metaTotal == null || !Number.isFinite(input.metaTotal) || input.metaTotal < 0) return false;
  return input.collected >= COMPLETE_SHARE * input.metaTotal;
}

/**
 * A rate limit (Meta error 1675004) after the last new ad means the list may
 * have been cut short: the scan ended because Meta stopped answering, not
 * because it ran out. Exception: Meta's own paging said "no more" after the
 * rate limit had passed.
 */
export function finalStop(input: {
  stoppedBy: ScanStop;
  lastRateLimitAt: number;
  lastGrowthAt: number;
  hasNextPageFalseAt: number;
}): ScanStop {
  if (input.stoppedBy !== "done") return input.stoppedBy;
  if (input.lastRateLimitAt > 0 && input.lastRateLimitAt >= input.lastGrowthAt) {
    if (input.hasNextPageFalseAt > input.lastRateLimitAt) return "done";
    return "rate_limited";
  }
  return "done";
}

/** True when stopping `toStop` of `live` ads looks like a bad scan, not real churn. */
export function stopCapExceeded(
  toStop: number,
  live: number,
  share = STOP_CAP_SHARE,
  floor = STOP_CAP_FLOOR,
): boolean {
  if (toStop <= 0) return false;
  if (toStop <= floor) return false;
  return toStop > share * Math.max(0, live);
}

/** Two strikes: count this miss, stop only on the second miss in a row. */
export function strikeDecision(missedBefore: number, strikes = STRIKES_TO_STOP): { missedScans: number; stop: boolean } {
  const missedScans = Math.max(0, Math.floor(Number(missedBefore) || 0)) + 1;
  return { missedScans, stop: missedScans >= strikes };
}

/**
 * Oldest first by last completed time; never completed (null/0/invalid)
 * comes first. Stable: equal times keep their input order.
 */
export function sortOldestFirst<T>(items: readonly T[], lastAt: (item: T) => string | number | null | undefined): T[] {
  const key = (item: T): number => {
    const v = lastAt(item);
    if (v == null || v === "") return 0;
    const t = typeof v === "number" ? v : new Date(v).getTime();
    return Number.isFinite(t) && t > 0 ? t : 0;
  };
  return items
    .map((item, index) => ({ item, index, at: key(item) }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map((x) => x.item);
}
