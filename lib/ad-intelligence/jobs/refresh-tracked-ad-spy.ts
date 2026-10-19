import "server-only";

import { listTrackedBrands } from "@/lib/ad-intelligence/global/store";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { reapExpiredAdSpyRequests } from "@/lib/ad-intelligence/durable-run";
import { buildAdvertiserCollectionKey } from "@/lib/ad-intelligence/global/page-aware-store";
import { sortOldestFirst } from "@/lib/ad-intelligence/global/scan-rules";
import { recoverStaleRuns, startAdSpyCollection } from "./start-collection";

/**
 * Scheduled re-observation.
 *
 * Timelines, momentum and change detection only work if the same advertiser
 * is observed repeatedly. This job:
 *   1. recovers collections whose worker died (stale runs / expired leases),
 *   2. re-collects every watched advertiser (exact Page ID), every Brand
 *      Vault competitor, and every
 *      tracked brand that is due, through the single dispatch path.
 */

/** Keep each cron invocation small; the queue does the heavy lifting. */
const MAX_DISPATCH_PER_RUN = 40;

export type TrackedTarget = {
  userId: string;
  query: string;
  country: string;
  pageId: string | null;
  refreshHours: number;
  source: "watchlist" | "tracked" | "brand_vault";
  /** Last finished full read (null = never, or the last one was partial). */
  lastCompletedAt?: string | null;
};
type Target = TrackedTarget;

async function listWatchlistTargets(): Promise<Target[]> {
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_advertiser_watchlists")
    .select("user_id,platform,advertiser_id,advertiser_name,country,updated_at")
    .eq("platform", "meta")
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(`Failed to list AdSpy watchlists: ${error.message}`);

  return (data ?? [])
    .filter((row: any) => /^\d+$/.test(String(row.advertiser_id ?? "")))
    .map((row: any) => ({
      userId: String(row.user_id),
      query: String(row.advertiser_name || row.advertiser_id).trim(),
      country: String(row.country || "IN").toUpperCase(),
      pageId: String(row.advertiser_id),
      refreshHours: 24,
      source: "watchlist" as const,
    }));
}

/**
 * Brand Vault competitors are re-observed nightly too, so the vault's
 * "changes this week" have data. Best effort: the table may not exist yet.
 */
async function listBrandVaultTargets(): Promise<Target[]> {
  const { data, error } = await createGlobalServiceClient()
    .from("brand_vault_competitors")
    .select("user_id,name,advertiser_page_id,country,platform")
    .eq("platform", "meta")
    .limit(1000);

  if (error) {
    console.warn("[AdSpy scheduled] brand vault competitors skipped", error.message);
    return [];
  }

  // The user's own page too, so "Vs you" stays current. Missing column = skip.
  const own = await createGlobalServiceClient().from("brand_vaults").select("user_id,brand_name,own_page_id").not("own_page_id", "is", null).limit(1000);
  const ownRows = own.error ? [] : (own.data ?? []).map((row: any) => ({ user_id: row.user_id, name: row.brand_name, advertiser_page_id: row.own_page_id, country: "IN" }));

  return [...(data ?? []), ...ownRows]
    .filter((row: any) => String(row.name ?? "").trim().length >= 2 || /^\d+$/.test(String(row.advertiser_page_id ?? "")))
    .map((row: any) => {
      const pageId = String(row.advertiser_page_id ?? "").trim();
      return {
        userId: String(row.user_id),
        query: String(row.name || pageId).trim(),
        country: String(row.country || "IN").toUpperCase(),
        pageId: /^\d+$/.test(pageId) ? pageId : null,
        refreshHours: 24,
        source: "brand_vault" as const,
      };
    });
}

/** Expire dead leases and clear runs whose worker died. Never throws. */
export async function recoverAdSpyQueue(): Promise<{ reapedRequests: number; recoveredRuns: number }> {
  const reapedRequests = await reapExpiredAdSpyRequests().catch((error) => {
    console.error("[AdSpy scheduled] reap failed", error);
    return 0;
  });
  const recoveredRuns = await recoverStaleRuns().catch((error) => {
    console.error("[AdSpy scheduled] stale recovery failed", error);
    return 0;
  });
  return { reapedRequests, recoveredRuns };
}

/**
 * Last finished full read per target, from the collection jobs the targets
 * themselves start (same collection key). One small read per 100 targets;
 * a failure only loses the ordering, never the targets.
 */
async function lastCompletedByKey(targets: Target[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const keys = Array.from(new Set(targets.map(targetKey)));
  const client = createGlobalServiceClient();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await client
      .from("ad_intelligence_collection_jobs")
      .select("collection_key,completed_at")
      .in("collection_key", keys.slice(i, i + 100))
      .not("completed_at", "is", null)
      .limit(1000);
    if (error) {
      console.warn("[AdSpy scheduled] last completion times unavailable", error.message);
      return out;
    }
    for (const row of (data ?? []) as Array<{ collection_key: string; completed_at: string | null }>) {
      if (!row.completed_at) continue;
      const prev = out.get(row.collection_key);
      if (!prev || row.completed_at > prev) out.set(row.collection_key, row.completed_at);
    }
  }
  return out;
}

function targetKey(target: Target): string {
  return buildAdvertiserCollectionKey({
    query: target.query.replace(/\s+/g, " ").trim(),
    country: target.country,
    platform: "meta",
    mode: "advertiser",
    pageId: target.pageId,
  });
}

/**
 * Every brand to re-read, one entry per advertiser identity (watchlists with
 * an exact Page ID first), sorted by last finished read, oldest (or never)
 * first. No cap: the PC collector takes them one at a time until its night
 * budget runs out; the Vercel cron caps itself.
 */
export async function listTrackedAdSpyTargets(): Promise<TrackedTarget[]> {
  const trackedRows = (await listTrackedBrands()).filter((brand) => brand.platform === "meta" && brand.query.length >= 2);
  const tracked = trackedRows.map<Target>((brand) => ({
    userId: brand.userId,
    query: brand.query,
    country: brand.country,
    pageId: null,
    refreshHours: brand.refreshHours,
    source: "tracked",
    lastCompletedAt: brand.lastCollectedAt ?? null,
  }));

  const watched = await listWatchlistTargets();
  const vault = await listBrandVaultTargets();

  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const target of [...watched, ...vault, ...tracked]) {
    const key = `${target.country}|${target.pageId ?? target.query.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }

  const completed = await lastCompletedByKey(targets);
  for (const target of targets) {
    const fromJob = completed.get(targetKey(target)) ?? null;
    // The job's completed_at is null after a partial scan; tracked brands
    // also skip last_collected_at then. Take the later known time.
    const known = [fromJob, target.lastCompletedAt ?? null].filter((v): v is string => Boolean(v)).sort();
    target.lastCompletedAt = known.length ? known[known.length - 1] : null;
  }
  return sortOldestFirst(targets, (t) => t.lastCompletedAt ?? null);
}

export async function refreshTrackedAdSpy(options: {
  /** "deep" = full history; only for the long-running nightly job, not the 60s Vercel cron. */
  depth?: "quick" | "deep";
  /** Override the per-brand minimum gap (nightly job: 12 h, so cron drift never skips a night). */
  minIntervalMs?: number;
  /** Nightly run happens on the PC: return at once, without any DB reads. */
  skipDispatch?: boolean;
} = {}): Promise<{
  reapedRequests: number;
  recoveredRuns: number;
  targets: number;
  dispatched: number;
  skipped: Record<string, number>;
  errors: number;
}> {
  // The PC collector reads every tracked brand in full each night (free) and
  // reaps stuck runs itself; the Vercel cron then has nothing to do.
  if (options.skipDispatch) {
    return { reapedRequests: 0, recoveredRuns: 0, targets: 0, dispatched: 0, skipped: { nightly_on_pc: 1 }, errors: 0 };
  }

  const { reapedRequests, recoveredRuns } = await recoverAdSpyQueue();
  const targets = await listTrackedAdSpyTargets();

  let dispatched = 0;
  let errors = 0;
  const skipped: Record<string, number> = {};

  for (const target of targets) {
    if (dispatched >= MAX_DISPATCH_PER_RUN) {
      skipped.capacity = (skipped.capacity ?? 0) + 1;
      continue;
    }

    try {
      const result = await startAdSpyCollection({
        userId: target.userId,
        query: target.query,
        country: target.country,
        platform: "meta",
        mode: "advertiser",
        pageId: target.pageId,
        // A little under the refresh period so a daily cron always qualifies.
        minIntervalMs: options.minIntervalMs ?? Math.max(1, target.refreshHours - 2) * 60 * 60 * 1000,
        reason: "scheduled",
        // API mode pays per call: nightly = new/live ads only, full read on Sundays.
        depth: options.depth ?? (process.env.ADSPY_COLLECTOR === "searchapi" ? (new Date().getUTCDay() === 0 ? "deep" : "quick") : undefined),
      });

      if (result.dispatched) dispatched += 1;
      else skipped[result.outcome] = (skipped[result.outcome] ?? 0) + 1;
    } catch (error) {
      errors += 1;
      console.error("[AdSpy scheduled] dispatch failed", {
        source: target.source,
        query: target.query,
        pageId: target.pageId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return {
    reapedRequests,
    recoveredRuns,
    targets: targets.length,
    dispatched,
    skipped,
    errors,
  };
}
