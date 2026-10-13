/**
 * Credit guard for paid Meta sources (ScrapeCreators / SearchApi).
 *
 * Pure rules (no I/O), unit-tested. The full library of every brand comes
 * from the free PC collector at night; paid credits only buy an instant
 * first look for brands we don't hold yet. Three limits:
 *   1. Site-wide daily credit ceiling (ADSPY_DAILY_CREDIT_CAP, default 150).
 *   2. New brands a user may fetch live per day, by plan.
 *   3. User searches read Meta's first pages only (META_API_QUICK_PAGES, default 2);
 *      the full library is queued for tonight's PC collection.
 */

import type { PlanKey } from "@/lib/billing/plans";

type Env = Record<string, string | undefined>;

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && value !== undefined && value.trim() !== "" ? n : fallback;
}

/** True when Meta ads come from a paid API (credits), not the free browser collector. */
export function paidMetaSourceActive(env: Env = process.env): boolean {
  const forced = env.ADSPY_META_SOURCE?.trim().toLowerCase();
  if (forced === "scrapecreators" || forced === "searchapi") return true;
  if (forced === "playwright") return false;
  return env.ADSPY_COLLECTOR === "searchapi";
}

/** Most credits all users together may spend in one IST day. */
export function dailyCreditCap(env: Env = process.env): number {
  return Math.floor(num(env.ADSPY_DAILY_CREDIT_CAP, 150));
}

/** Pages (= credits) a user-started live fetch may read. */
export function quickPages(env: Env = process.env): number {
  return Math.max(1, Math.floor(num(env.META_API_QUICK_PAGES, 2)));
}

/** A brand fetched live is not fetched live again within this window. */
export function apiMinIntervalMs(env: Env = process.env): number {
  return num(env.ADSPY_API_MIN_INTERVAL_HOURS, 12) * 60 * 60_000;
}

/** New brands one user may fetch live per IST day. */
export const NEW_BRANDS_PER_DAY: Record<PlanKey, number> = {
  trial: 3,
  starter: 5,
  growth: 15,
  agency: 40,
};

export function userBrandLimit(entitlement: { plan: PlanKey; admin: boolean; active: boolean }): number {
  if (entitlement.admin) return Number.POSITIVE_INFINITY;
  // Trial ended / unpaid: one live look a day, the rest waits for the night run.
  if (!entitlement.active) return 1;
  return NEW_BRANDS_PER_DAY[entitlement.plan] ?? NEW_BRANDS_PER_DAY.trial;
}

/** Start of the current IST day, as a Date (UTC instant). */
export function istDayStart(now: number = Date.now()): Date {
  const ist = now + IST_OFFSET_MS;
  return new Date(Math.floor(ist / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** "2026-10-13" in IST; used to key per-day counters. */
export function istDayKey(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * How many pages this API slice may read. 0 = skip the paid source entirely
 * (budget used up); the PC collects the brand tonight instead.
 */
export function pagesAllowed(input: {
  phase: "quick" | "deep";
  perRunPages: number;
  totalPagesLeft: number;
  creditsUsedToday: number;
  dailyCap: number;
  quickPages: number;
}): number {
  const budgetLeft = Math.max(0, input.dailyCap - input.creditsUsedToday);
  const phaseCap = input.phase === "quick" ? input.quickPages : input.perRunPages;
  return Math.max(0, Math.min(phaseCap, input.totalPagesLeft, budgetLeft));
}

export const DEFERRED_MESSAGE =
  "Queued for tonight's full collection. Every ad of this brand will be here by tomorrow morning.";
