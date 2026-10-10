import { expect, it } from "vitest";

import { billingSummary, userSummary, weeklySignups } from "./stats";

const now = Date.parse("2026-10-10T12:00:00Z");
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();

it("sums MRR from active paid plans and splits trials", () => {
  const s = billingSummary(
    [
      { user_id: "a", plan: "growth", status: "active", trial_ends_at: null },
      { user_id: "b", plan: "starter", status: "active", trial_ends_at: null },
      { user_id: "c", plan: "trial", status: "trialing", trial_ends_at: ago(-3) },
      { user_id: "d", plan: "trial", status: "trialing", trial_ends_at: ago(2) },
      { user_id: "e", plan: "agency", status: "past_due", trial_ends_at: null },
      { user_id: "me", plan: "agency", status: "active", trial_ends_at: null },
    ],
    now,
    new Set(["me"]),
  );
  expect(s.mrr).toBe(3998);
  expect(s.payingTotal).toBe(2);
  expect(s.trialsLive).toBe(1);
  expect(s.trialsEnded).toBe(1);
  expect(s.pastDue).toBe(1);
});

it("counts new and active users and buckets weeks", () => {
  const users = [
    { id: "1", email: null, created_at: ago(1), last_sign_in_at: ago(1) },
    { id: "2", email: null, created_at: ago(10), last_sign_in_at: ago(20) },
    { id: "3", email: null, created_at: ago(60), last_sign_in_at: null },
  ];
  expect(userSummary(users, now)).toEqual({ total: 3, new7: 1, new30: 2, active7: 1 });
  const w = weeklySignups(users, now, 8);
  expect(w).toHaveLength(8);
  expect(w.at(-1)?.count).toBe(1);
  expect(w.at(-2)?.count).toBe(1);
  expect(w.reduce((a, b) => a + b.count, 0)).toBe(2);
});
