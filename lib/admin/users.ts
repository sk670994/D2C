/**
 * Founder dashboard: per-user activity, activation funnel, demand signals.
 * Pure helpers (unit-tested in users.test.ts); data is loaded in users-server.ts.
 */
import type { BillingRow, UserRow } from "./stats";

const DAY = 86_400_000;
const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
export const TRIAL_SEARCHES = 3;

export type LookupRow = { user_id: string; query: string; last_requested_at: string };
export type CounterRow = { key: string; hits: number };

export type UserActivity = {
  lookups: Array<{ query: string; at: string }>; // newest first
  trialSearches: number; // 0..3, from the trial counter
  aiToday: number;
};

/** Group look-ups and counters by user id. Keys: adspy-live:<uid>:trial, ai-day:<uid>:<day>. */
export function activityByUser(lookups: LookupRow[], trial: CounterRow[], ai: CounterRow[]): Map<string, UserActivity> {
  const out = new Map<string, UserActivity>();
  const get = (id: string) => {
    let a = out.get(id);
    if (!a) out.set(id, (a = { lookups: [], trialSearches: 0, aiToday: 0 }));
    return a;
  };
  for (const l of lookups) {
    const q = String(l.query ?? "").trim();
    if (l.user_id && q) get(l.user_id).lookups.push({ query: q, at: l.last_requested_at });
  }
  for (const a of out.values()) a.lookups.sort((x, y) => y.at.localeCompare(x.at));
  for (const r of trial) {
    const id = /^adspy-live:([^:]+):trial$/.exec(r.key)?.[1];
    if (id) get(id).trialSearches = Math.min(TRIAL_SEARCHES, Math.max(0, Number(r.hits) || 0));
  }
  // Backstop: counters pruned before 18 Oct undercount; a trial user has used
  // at least as many searches as distinct brands looked up.
  for (const a of out.values()) a.trialSearches = Math.min(TRIAL_SEARCHES, Math.max(a.trialSearches, a.lookups.length));
  for (const r of ai) {
    const id = /^ai-day:([^:]+):/.exec(r.key)?.[1];
    if (id) get(id).aiToday += Math.max(0, Number(r.hits) || 0);
  }
  return out;
}

export type NextStep = { label: string; tone?: "good" | "warn" };

/**
 * What the founder should do about this user now. Ordered by value:
 * paying > hit the trial limit (strongest buying signal) > trial ending >
 * never searched > engaged.
 */
export function nextStep(input: {
  user: UserRow;
  billing: BillingRow | undefined;
  activity: UserActivity | undefined;
  rivals: number;
  now: number;
}): NextStep {
  const { user, billing, activity, rivals, now } = input;
  const searched = (activity?.lookups.length ?? 0) > 0 || (activity?.trialSearches ?? 0) > 0;
  const ageDays = (now - Date.parse(user.created_at)) / DAY;
  if (billing?.status === "active") return { label: "Customer: ask for feedback", tone: "good" };
  if (billing?.status === "past_due") return { label: "Payment failed: contact", tone: "warn" };
  const trialing = billing?.status === "trialing";
  const trialLeft = trialing && billing?.trial_ends_at ? Math.ceil((Date.parse(billing.trial_ends_at) - now) / DAY) : null;
  if (trialing && (activity?.trialSearches ?? 0) >= TRIAL_SEARCHES) return { label: "Used all 3 searches: offer a demo", tone: "good" };
  if (trialLeft != null && trialLeft <= 0) return { label: "Trial ended: ask why", tone: "warn" };
  if (trialLeft != null && trialLeft <= 2) return { label: `Trial ends in ${trialLeft}d: follow up`, tone: "warn" };
  if (!searched) return ageDays <= 3 ? { label: "No search yet: send a tip" } : { label: "Never searched: gone cold", tone: "warn" };
  if (rivals > 0) return { label: "Tracking rivals: engaged", tone: "good" };
  return { label: "Searched: suggest adding rivals" };
}

export function trialDaysLeft(billing: BillingRow | undefined, now: number): number | null {
  if (billing?.status !== "trialing" || !billing.trial_ends_at) return null;
  return Math.ceil((Date.parse(billing.trial_ends_at) - now) / DAY);
}

/** Activation funnel over customers (founders already excluded by the caller). */
export function funnel(input: {
  users: UserRow[];
  activity: Map<string, UserActivity>;
  rivals: Map<string, number>;
  billing: Map<string, BillingRow>;
  now: number;
}) {
  const { users, activity, rivals, billing, now } = input;
  let searched = 0;
  let tracked = 0;
  let returned = 0;
  let paid = 0;
  for (const u of users) {
    const a = activity.get(u.id);
    if ((a?.lookups.length ?? 0) > 0 || (a?.trialSearches ?? 0) > 0) searched += 1;
    if ((rivals.get(u.id) ?? 0) > 0) tracked += 1;
    const signIn = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
    // "Signed in again": last sign-in on a later IST day than signup, within 7 days.
    if (signIn && now - signIn <= 7 * DAY && istDay(signIn) !== istDay(Date.parse(u.created_at))) returned += 1;
    if (billing.get(u.id)?.status === "active") paid += 1;
  }
  const steps = [
    { label: "Signed up", count: users.length },
    { label: "Searched a brand", count: searched },
    { label: "Tracked a rival", count: tracked },
    { label: "Signed in again (7 days)", count: returned },
    { label: "Paying", count: paid },
  ];
  return steps.map((s) => ({ ...s, pct: users.length ? Math.round((100 * s.count) / users.length) : 0 }));
}

/** Brands customers looked up recently, by number of distinct users. */
export function topBrands(lookups: LookupRow[], exclude: Set<string>, now: number, days = 7, limit = 10) {
  const byBrand = new Map<string, { name: string; users: Set<string> }>();
  for (const l of lookups) {
    if (exclude.has(l.user_id) || now - Date.parse(l.last_requested_at) > days * DAY) continue;
    const name = String(l.query ?? "").trim();
    const key = name.toLowerCase();
    if (!key) continue;
    const e = byBrand.get(key) ?? { name, users: new Set<string>() };
    e.users.add(l.user_id);
    byBrand.set(key, e);
  }
  return [...byBrand.values()]
    .map((e) => ({ name: e.name, users: e.users.size }))
    .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name))
    .slice(0, limit);
}
