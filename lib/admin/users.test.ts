import { describe, expect, it } from "vitest";

import { activityByUser, funnel, nextStep, topBrands, trialDaysLeft } from "./users";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const user = (id: string, joinedDaysAgo: number, seenDaysAgo: number | null = null) => ({
  id,
  email: `${id}@x.com`,
  created_at: iso(joinedDaysAgo * DAY),
  last_sign_in_at: seenDaysAgo == null ? null : iso(seenDaysAgo * DAY),
});

describe("founder users", () => {
  const activity = activityByUser(
    [
      { user_id: "a", query: "Mamaearth", last_requested_at: iso(2 * DAY) },
      { user_id: "a", query: "Foxtale", last_requested_at: iso(1 * DAY) },
      { user_id: "b", query: "mamaearth", last_requested_at: iso(1 * DAY) },
      { user_id: "z", query: "Old", last_requested_at: iso(20 * DAY) },
    ],
    [{ key: "adspy-live:a:trial", hits: 5 }, { key: "adspy-live:c:trial", hits: 1 }, { key: "junk", hits: 9 }],
    [{ key: "ai-day:a:2026-10-18", hits: 4 }],
  );

  it("groups activity per user, newest look-up first, trial capped at 3", () => {
    expect(activity.get("a")?.lookups.map((l) => l.query)).toEqual(["Foxtale", "Mamaearth"]);
    expect(activity.get("a")?.trialSearches).toBe(3);
    expect(activity.get("a")?.aiToday).toBe(4);
    expect(activity.get("c")?.trialSearches).toBe(1);
  });

  it("picks the next step", () => {
    const trial = (days: number) => ({ user_id: "x", plan: "trial", status: "trialing", trial_ends_at: new Date(NOW + days * DAY).toISOString() });
    expect(nextStep({ user: user("a", 5), billing: trial(5), activity: activity.get("a"), rivals: 0, now: NOW }).label).toMatch(/all 3 searches/);
    expect(nextStep({ user: user("c", 5), billing: trial(1), activity: activity.get("c"), rivals: 0, now: NOW }).label).toMatch(/ends in 1d/);
    expect(nextStep({ user: user("n", 1), billing: trial(7), activity: undefined, rivals: 0, now: NOW }).label).toMatch(/No search yet/);
    expect(nextStep({ user: user("n", 9), billing: trial(-1), activity: undefined, rivals: 0, now: NOW }).label).toMatch(/Trial ended/);
    expect(nextStep({ user: user("p", 9), billing: { user_id: "p", plan: "starter", status: "active", trial_ends_at: null }, activity: undefined, rivals: 0, now: NOW }).tone).toBe("good");
    expect(trialDaysLeft(trial(3), NOW)).toBe(3);
  });

  it("builds the funnel", () => {
    const users = [user("a", 10, 1), user("b", 2, 2), user("c", 1, 1), user("d", 3)];
    const f = funnel({
      users,
      activity,
      rivals: new Map([["a", 2]]),
      billing: new Map([["a", { user_id: "a", plan: "starter", status: "active", trial_ends_at: null }]]),
      now: NOW,
    });
    expect(f.map((s) => s.count)).toEqual([4, 3, 1, 1, 1]);
    expect(f[1].pct).toBe(75);
  });

  it("ranks brands by distinct users in the window, skipping founders", () => {
    const rows = [
      { user_id: "a", query: "Mamaearth", last_requested_at: iso(1 * DAY) },
      { user_id: "b", query: "mamaearth", last_requested_at: iso(1 * DAY) },
      { user_id: "f", query: "Foxtale", last_requested_at: iso(1 * DAY) },
      { user_id: "a", query: "Old", last_requested_at: iso(20 * DAY) },
    ];
    expect(topBrands(rows, new Set(["f"]), NOW)).toEqual([{ name: "Mamaearth", users: 2 }]);
  });
});
