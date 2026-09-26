import "server-only";

import { listTrackedBrands } from "@/lib/ad-intelligence/global/store";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { reapExpiredAdSpyRequests } from "@/lib/ad-intelligence/durable-run";
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

type Target = {
  userId: string;
  query: string;
  country: string;
  pageId: string | null;
  refreshHours: number;
  source: "watchlist" | "tracked" | "brand_vault";
};

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

  return (data ?? [])
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

export async function refreshTrackedAdSpy(options: {
  /** "deep" = full history; only for the long-running nightly job, not the 60s Vercel cron. */
  depth?: "quick" | "deep";
} = {}): Promise<{
  reapedRequests: number;
  recoveredRuns: number;
  targets: number;
  dispatched: number;
  skipped: Record<string, number>;
  errors: number;
}> {
  const reapedRequests = await reapExpiredAdSpyRequests().catch((error) => {
    console.error("[AdSpy scheduled] reap failed", error);
    return 0;
  });
  const recoveredRuns = await recoverStaleRuns().catch((error) => {
    console.error("[AdSpy scheduled] stale recovery failed", error);
    return 0;
  });

  const tracked = (await listTrackedBrands())
    .filter((brand) => brand.platform === "meta" && brand.query.length >= 2)
    .map<Target>((brand) => ({
      userId: brand.userId,
      query: brand.query,
      country: brand.country,
      pageId: null,
      refreshHours: brand.refreshHours,
      source: "tracked",
    }));

  const watched = await listWatchlistTargets();
  const vault = await listBrandVaultTargets();

  // Watchlists (exact Page ID) first; one dispatch per advertiser identity.
  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const target of [...watched, ...vault, ...tracked]) {
    const key = `${target.country}|${target.pageId ?? target.query.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }

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
        minIntervalMs: Math.max(1, target.refreshHours - 2) * 60 * 60 * 1000,
        reason: "scheduled",
        depth: options.depth,
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
