import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { apiCreditsUsedToday } from "@/lib/ad-intelligence/credit-guard-server";
import { dailyCreditCap, istDayKey } from "@/lib/ad-intelligence/credit-guard";
import { dbHealth, summarizeCounters, summarizeCoverage, summarizeRuns, type CounterRow, type CoverageRow, type RunRow } from "./ops";

const DAY = 86_400_000;

/**
 * Small read-only queries for the founder Operations panel. Each part fails
 * on its own (shown as "—"), so one slow table never blanks the dashboard.
 */
export async function loadOps(now: number) {
  const db = createGlobalServiceClient();
  const since = (ms: number) => new Date(now - ms).toISOString();
  const day = istDayKey(now);

  const [runs, coverage, credits, ai, trial, stats] = await Promise.all([
    db
      .from("adspy_runs")
      .select("status,persisted_ads,created_at,started_at,completed_at,error_message")
      .gte("created_at", since(DAY))
      .limit(2000)
      .then((r) => (r.error ? null : summarizeRuns((r.data ?? []) as RunRow[])), () => null),
    db
      .from("adspy_source_counts")
      .select("scope_key,meta_total,collected_ads,observed_at")
      .eq("platform", "meta")
      .eq("scope_type", "page")
      .eq("status_scope", "active")
      .gte("observed_at", since(2 * DAY))
      .limit(1000)
      .then(async (r) => {
        if (r.error) return null;
        const rows = (r.data ?? []) as CoverageRow[];
        const ids = rows.filter((x) => x.collected_ads < x.meta_total).map((x) => x.scope_key).slice(0, 50);
        const names = new Map<string, string>();
        if (ids.length) {
          const n = await db.from("ad_intelligence_creatives").select("advertiser_id,advertiser_name").eq("platform", "meta").in("advertiser_id", ids).limit(500);
          for (const row of (n.data ?? []) as Array<{ advertiser_id: string; advertiser_name: string | null }>) {
            if (row.advertiser_name && !names.has(row.advertiser_id)) names.set(row.advertiser_id, row.advertiser_name);
          }
        }
        return summarizeCoverage(rows, names);
      }, () => null),
    apiCreditsUsedToday().then((n) => (Number.isFinite(n) ? n : null), () => null),
    db
      .from("rate_limits")
      .select("key,hits")
      .like("key", `ai-day:%:${day}`)
      .limit(5000)
      .then((r) => (r.error ? null : summarizeCounters((r.data ?? []) as CounterRow[])), () => null),
    db
      .from("rate_limits")
      .select("key,hits")
      .like("key", "adspy-live:%:trial")
      .gte("window_start", since(9 * DAY))
      .limit(5000)
      .then((r) => (r.error ? null : summarizeCounters((r.data ?? []) as CounterRow[], 3)), () => null),
    db.rpc("founder_db_stats").then(
      (r) => (r.error ? null : dbHealth(r.data as { db_bytes: number; creatives_upd: number; creatives_hot: number } | null)),
      () => null,
    ),
  ]);

  return { runs, coverage, credits, creditCap: dailyCreditCap(), ai, trial, db: stats };
}
