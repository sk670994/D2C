import { describe, expect, it } from "vitest";

import { canWatchMore, entitlementFor, isAdminEmail, isPaidPlan, statusFromRazorpay } from "./plans";

const now = Date.parse("2026-10-01T00:00:00Z");
const days = (n: number) => new Date(now + n * 86_400_000).toISOString();

describe("entitlementFor", () => {
  it("gives a new user a running trial", () => {
    const e = entitlementFor(null, now);
    expect(e.status).toBe("trialing");
    expect(e.active).toBe(true);
    expect(e.rivalsLimit).toBe(5);
  });

  it("counts trial days and expires the trial", () => {
    expect(entitlementFor({ plan: "trial", status: "trialing", trial_ends_at: days(3), current_period_end: null }, now).trialDaysLeft).toBe(3);
    const ended = entitlementFor({ plan: "trial", status: "trialing", trial_ends_at: days(-1), current_period_end: null }, now);
    expect(ended.status).toBe("expired");
    expect(ended.active).toBe(false);
  });

  it("applies paid plan limits", () => {
    const e = entitlementFor({ plan: "growth", status: "active", trial_ends_at: null, current_period_end: days(20) }, now);
    expect(e.active).toBe(true);
    expect(e.rivalsLimit).toBe(15);
    expect(e.alerts).toBe(true);
    expect(entitlementFor({ plan: "starter", status: "active", trial_ends_at: null, current_period_end: days(20) }, now).alerts).toBe(false);
  });

  it("keeps a grace period after a failed payment, then stops", () => {
    expect(entitlementFor({ plan: "growth", status: "past_due", trial_ends_at: null, current_period_end: days(-2) }, now).active).toBe(true);
    expect(entitlementFor({ plan: "growth", status: "past_due", trial_ends_at: null, current_period_end: days(-9) }, now).active).toBe(false);
  });

  it("honours paid time after a cancel", () => {
    expect(entitlementFor({ plan: "agency", status: "cancelled", trial_ends_at: null, current_period_end: days(4) }, now).active).toBe(true);
    const over = entitlementFor({ plan: "agency", status: "cancelled", trial_ends_at: null, current_period_end: days(-1) }, now);
    expect(over.active).toBe(false);
    expect(over.status).toBe("expired");
  });

  it("lets the founder through", () => {
    expect(entitlementFor(null, now, { admin: true }).rivalsLimit).toBe(500);
    expect(isAdminEmail("Hello@Zooptrack.co.in ", "hello@zooptrack.co.in, x@y.z")).toBe(true);
    expect(isAdminEmail("a@b.c", "")).toBe(false);
  });
});

describe("canWatchMore", () => {
  const trial = entitlementFor(null, now);
  it("allows re-watching and blocks over the limit", () => {
    expect(canWatchMore(trial, 5, true).ok).toBe(true);
    expect(canWatchMore(trial, 4, false).ok).toBe(true);
    const blocked = canWatchMore(trial, 5, false);
    expect(blocked.ok).toBe(false);
  });
  it("blocks new rivals when inactive", () => {
    const ended = entitlementFor({ plan: "trial", status: "trialing", trial_ends_at: days(-1), current_period_end: null }, now);
    const d = canWatchMore(ended, 0, false);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("inactive");
  });
});

describe("statusFromRazorpay", () => {
  it("maps subscription events", () => {
    expect(statusFromRazorpay("subscription.charged", { status: "active", current_end: 1790000000 })).toEqual({ status: "active", currentPeriodEnd: new Date(1790000000 * 1000).toISOString() });
    expect(statusFromRazorpay("subscription.halted", { status: "halted" })?.status).toBe("past_due");
    expect(statusFromRazorpay("subscription.cancelled", { status: "cancelled" })?.status).toBe("cancelled");
    expect(statusFromRazorpay("payment.captured", {})).toBeNull();
    expect(isPaidPlan("growth")).toBe(true);
    expect(isPaidPlan("trial")).toBe(false);
  });
});
