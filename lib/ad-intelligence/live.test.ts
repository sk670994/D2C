import { describe, expect, test } from "vitest";

import { isLiveAd, LIVE_WINDOW_HOURS } from "./live";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("isLiveAd", () => {
  test("active and seen recently is live", () => {
    expect(isLiveAd({ is_currently_active: true, last_seen_at: hoursAgo(2) }, NOW)).toBe(true);
    expect(isLiveAd({ is_currently_active: true, last_seen_at: hoursAgo(LIVE_WINDOW_HOURS) }, NOW)).toBe(true);
  });
  test("active but not seen within the window is not live", () => {
    expect(isLiveAd({ is_currently_active: true, last_seen_at: hoursAgo(LIVE_WINDOW_HOURS + 1) }, NOW)).toBe(false);
  });
  test("inactive, null or missing values are not live", () => {
    expect(isLiveAd({ is_currently_active: false, last_seen_at: hoursAgo(1) }, NOW)).toBe(false);
    expect(isLiveAd({ is_currently_active: null, last_seen_at: hoursAgo(1) }, NOW)).toBe(false);
    expect(isLiveAd({ is_currently_active: true, last_seen_at: null }, NOW)).toBe(false);
    expect(isLiveAd({ is_currently_active: true, last_seen_at: "not a date" }, NOW)).toBe(false);
    expect(isLiveAd(null, NOW)).toBe(false);
  });
});
