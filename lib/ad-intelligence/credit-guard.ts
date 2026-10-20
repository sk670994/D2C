/**
 * Credit guard for paid Meta sources (ScrapeCreators / SearchApi).
 *
 * Pure rules (no I/O), unit-tested. The full library of every brand comes
 * from the free PC collector at night; paid credits buy an instant live
 * read when a person searches a brand we don't hold (or hold incompletely).
 * Limits:
 *   1. Site-wide daily credit ceiling (ADSPY_DAILY_CREDIT_CAP, default 400).
 *   2. New brands a user may fetch live per day, by plan.
 *   3. A brand page that is new, under 90% of Meta's live count, or not fully
 *      read in 24 h gets a FULL live read (ADSPY_LOOKUP_MAX_PAGES, default 60
 *      pages = ~1,800 ads). Keyword searches stay quick (META_API_QUICK_PAGES,
 *      default 2). A brand already complete and fresh costs nothing.
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
  return Math.floor(num(env.ADSPY_DAILY_CREDIT_CAP, 400));
}

/** Pages (= credits) a user-started live fetch may read. */
export function quickPages(env: Env = process.env): number {
  return Math.max(1, Math.floor(num(env.META_API_QUICK_PAGES, 2)));
}

/** Pages (= credits) a full live look-up of one brand page may read in total. */
export function lookupMaxPages(env: Env = process.env): number {
  return Math.max(1, Math.floor(num(env.ADSPY_LOOKUP_MAX_PAGES, 60)));
}

/**
 * Paid reads stop when the provider's remaining balance is at or below this
 * (ADSPY_PAID_CREDIT_FLOOR, default 1000). Look-ups then wait for tonight's
 * free PC run.
 */
export function paidCreditFloor(env: Env = process.env): number {
  return Math.floor(num(env.ADSPY_PAID_CREDIT_FLOOR, 1000));
}

/**
 * Remaining paid credits. Preferred: the balance ScrapeCreators reported on
 * its latest response (`credits_remaining`), minus calls billed after it.
 * Fallback: ADSPY_PAID_CREDIT_START minus our own spend since
 * ADSPY_PAID_CREDIT_START_AT. Null = unknown (no floor applied).
 */
export function creditsRemainingFrom(input: {
  observed: number | null;
  spentSinceObserved?: number;
  start: number | null;
  spentSinceStart: number | null;
}): { remaining: number; source: "api" | "estimate" } | null {
  if (input.observed != null && Number.isFinite(input.observed)) {
    return { remaining: Math.max(0, input.observed - Math.max(0, input.spentSinceObserved ?? 0)), source: "api" };
  }
  if (input.start != null && Number.isFinite(input.start) && input.spentSinceStart != null && Number.isFinite(input.spentSinceStart)) {
    return { remaining: Math.max(0, input.start - input.spentSinceStart), source: "estimate" };
  }
  return null;
}

/** True when paid reads must stop (balance known and at/below the floor). */
export function atCreditFloor(remaining: number | null | undefined, floor: number): boolean {
  return remaining != null && Number.isFinite(remaining) && remaining <= floor;
}

/** Fallback balance settings: start balance and the instant it was read. */
export function paidCreditStart(env: Env = process.env): { start: number; at: string } | null {
  const start = num(env.ADSPY_PAID_CREDIT_START, NaN);
  const at = env.ADSPY_PAID_CREDIT_START_AT?.trim();
  if (!Number.isFinite(start) || !at || !Number.isFinite(Date.parse(at))) return null;
  return { start, at: new Date(Date.parse(at)).toISOString() };
}

/**
 * ADSPY_NIGHTLY_ON_PC=1: paid credits are for people's look-ups only. Requests
 * the PC's nightly run queued (or left behind) are skipped by the Vercel
 * drain and stay for the PC's free browser collector.
 */
export function drainMayRun(payload: { paidLookup?: unknown } | null | undefined, env: Env = process.env): boolean {
  if (env.ADSPY_NIGHTLY_ON_PC !== "1") return true;
  return payload?.paidLookup === true;
}

/** A brand fetched live is not fetched live again within this window. */
export function apiMinIntervalMs(env: Env = process.env): number {
  return num(env.ADSPY_API_MIN_INTERVAL_HOURS, 12) * 60 * 60_000;
}

/** New brands one user may fetch live: per IST day on paid plans, in total for the whole free trial. */
export const NEW_BRANDS_PER_DAY: Record<PlanKey, number> = {
  trial: 3,
  starter: 5,
  growth: 15,
  agency: 40,
};

export function userBrandLimit(entitlement: { plan: PlanKey; admin: boolean; active: boolean }): number {
  if (entitlement.admin) return Number.POSITIVE_INFINITY;
  // Trial ended / unpaid: no live look-ups.
  if (!entitlement.active) return 0;
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

/** Stored data counts as complete at this share of Meta's live total. */
export const LOOKUP_COVERAGE_MIN = 0.9;
/** A complete scan older than this is refreshed on the next look-up. */
export const LOOKUP_FRESH_MS = 24 * 60 * 60_000;

export type LookupDecision =
  /** Read every page (up to `pages`) now, live. */
  | { action: "full"; pages: number; reason: "new" | "incomplete" | "stale" }
  /** Read Meta's first pages only (keyword searches). */
  | { action: "quick"; pages: number }
  /** Stored data is complete and fresh, or a full read ran recently: no paid call. */
  | { action: "none"; reason: "fresh" | "recent_full_read" }
  /** Daily budget used up, or the balance is at the floor: tonight's free PC run collects it. */
  | { action: "deferred"; reason: "daily_cap" | "credit_floor" };

/**
 * What a person's look-up of a brand should spend (pure, unit-tested).
 * `storedActive` = live ads we hold for the page; `metaActiveTotal` = Meta's
 * live count from the last scan; `lastCompleteScanAt` = when a scan last
 * reached Meta's end (null = never). `fullReadRecently` = a full live read of
 * this page was already started within the minimum interval (any user).
 */
export function decideLookup(input: {
  mode: "advertiser" | "keyword";
  storedActive: number;
  metaActiveTotal: number | null;
  lastCompleteScanAt: number | null;
  fullReadRecently: boolean;
  creditsUsedToday: number;
  dailyCap: number;
  maxPages: number;
  quickPages: number;
  /** Provider balance (null = unknown) and the floor paid reads stop at. */
  creditsRemaining?: number | null;
  creditFloor?: number;
  now?: number;
}): LookupDecision {
  const now = input.now ?? Date.now();
  // Never read past the floor: the free PC run is the fallback.
  const floorLeft =
    input.creditsRemaining != null && Number.isFinite(input.creditsRemaining)
      ? Math.max(0, Math.floor(input.creditsRemaining - (input.creditFloor ?? 0)))
      : Number.POSITIVE_INFINITY;
  const dailyLeft = Math.max(0, input.dailyCap - input.creditsUsedToday);
  const budgetLeft = Math.min(dailyLeft, floorLeft);
  const deferred = (): LookupDecision => ({ action: "deferred", reason: floorLeft <= 0 ? "credit_floor" : "daily_cap" });
  if (input.mode === "keyword") {
    return budgetLeft > 0 ? { action: "quick", pages: Math.min(input.quickPages, budgetLeft) } : deferred();
  }
  const stored = Math.max(0, Number(input.storedActive) || 0);
  const total = input.metaActiveTotal != null && Number.isFinite(input.metaActiveTotal) && input.metaActiveTotal > 0 ? input.metaActiveTotal : null;
  let reason: "new" | "incomplete" | "stale" | null = null;
  if (stored === 0) reason = "new";
  else if (total != null && stored < total * LOOKUP_COVERAGE_MIN) reason = "incomplete";
  else if (input.lastCompleteScanAt == null || now - input.lastCompleteScanAt > LOOKUP_FRESH_MS) reason = "stale";
  if (!reason) return { action: "none", reason: "fresh" };
  // Someone already paid for a full read of this page lately; serve what it saved.
  if (input.fullReadRecently && reason !== "new") return { action: "none", reason: "recent_full_read" };
  if (budgetLeft <= 0) return deferred();
  return { action: "full", pages: Math.max(1, Math.min(input.maxPages, budgetLeft)), reason };
}

export const DEFERRED_MESSAGE =
  "Queued for tonight's full collection. Every ad of this brand will be here by tomorrow morning.";

export const TRIAL_LIMIT_MESSAGE =
  "Your free trial includes 3 brand look-ups, and you've used them. Choose a plan to look up more brands.";

/**
 * One key per brand for the trial allowance: the Meta page ID when known,
 * else the name without accents, punctuation or spaces ("P-TAL" = "ptal").
 */
export function trialBrandKey(brand: string): string {
  const v = String(brand ?? "").trim();
  if (/^\d+$/.test(v)) return `page-${v}`;
  return v.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 80);
}
