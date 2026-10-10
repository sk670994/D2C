/** Pure helpers for the founder dashboard (no I/O, easy to test). */

export const PLAN_PRICE_INR: Record<string, number> = { starter: 999, growth: 2999, agency: 7999 };

export type BillingRow = {
  user_id: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end?: string | null;
};

export type UserRow = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null };

const DAY = 86_400_000;

export function billingSummary(rows: BillingRow[], now: number, exclude: Set<string> = new Set()) {
  let trialsLive = 0;
  let trialsEnded = 0;
  let pastDue = 0;
  let cancelled = 0;
  let mrr = 0;
  const paying: Record<string, number> = { starter: 0, growth: 0, agency: 0 };
  for (const r of rows) {
    if (exclude.has(r.user_id)) continue;
    if (r.status === "trialing") {
      if (r.trial_ends_at && Date.parse(r.trial_ends_at) > now) trialsLive += 1;
      else trialsEnded += 1;
    } else if (r.status === "active" && PLAN_PRICE_INR[r.plan]) {
      paying[r.plan] += 1;
      mrr += PLAN_PRICE_INR[r.plan];
    } else if (r.status === "past_due") pastDue += 1;
    else if (r.status === "cancelled" || r.status === "expired") cancelled += 1;
  }
  const payingTotal = paying.starter + paying.growth + paying.agency;
  return { trialsLive, trialsEnded, pastDue, cancelled, mrr, paying, payingTotal };
}

export function userSummary(users: UserRow[], now: number) {
  const within = (iso: string | null, days: number) => Boolean(iso && now - Date.parse(iso) <= days * DAY);
  return {
    total: users.length,
    new7: users.filter((u) => within(u.created_at, 7)).length,
    new30: users.filter((u) => within(u.created_at, 30)).length,
    active7: users.filter((u) => within(u.last_sign_in_at, 7)).length,
  };
}

/** Signups per week, oldest first, for the last `weeks` weeks ending now. */
export function weeklySignups(users: UserRow[], now: number, weeks = 8): Array<{ start: string; count: number }> {
  const out = Array.from({ length: weeks }, (_, i) => ({ start: new Date(now - (weeks - i) * 7 * DAY).toISOString().slice(0, 10), count: 0 }));
  for (const u of users) {
    const age = now - Date.parse(u.created_at);
    if (age < 0 || age >= weeks * 7 * DAY) continue;
    const idx = weeks - 1 - Math.floor(age / (7 * DAY));
    out[idx].count += 1;
  }
  return out;
}

export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
