import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { istDayKey } from "@/lib/ad-intelligence/credit-guard";
import type { CounterRow, LookupRow } from "./users";

const DAY = 86_400_000;

/**
 * Per-user activity for the founder dashboard: brand look-ups (30 days),
 * trial search counters and today's AI calls. Read-only, small queries;
 * any part that fails comes back empty so the page still renders.
 */
export async function loadUserActivity(now: number): Promise<{ lookups: LookupRow[]; trial: CounterRow[]; ai: CounterRow[]; ok: boolean }> {
  const db = createGlobalServiceClient();
  const system = (process.env.ADSPY_SYSTEM_USER_ID ?? "").trim();
  const [lookups, trial, ai] = await Promise.all([
    (() => {
      let q = db
        .from("ad_intelligence_collection_jobs")
        .select("user_id,query,last_requested_at")
        .eq("platform", "meta")
        .eq("mode", "advertiser")
        .gte("last_requested_at", new Date(now - 30 * DAY).toISOString())
        .order("last_requested_at", { ascending: false })
        .limit(5000);
      if (system) q = q.neq("user_id", system); // the nightly collector, not a person
      return q.then((r) => (r.error ? null : ((r.data ?? []) as LookupRow[])), () => null);
    })(),
    db
      .from("rate_limits")
      .select("key,hits")
      .like("key", "adspy-live:%:trial")
      .limit(5000)
      .then((r) => (r.error ? null : ((r.data ?? []) as CounterRow[])), () => null),
    db
      .from("rate_limits")
      .select("key,hits")
      .like("key", `ai-day:%:${istDayKey(now)}`)
      .limit(5000)
      .then((r) => (r.error ? null : ((r.data ?? []) as CounterRow[])), () => null),
  ]);
  return { lookups: lookups ?? [], trial: trial ?? [], ai: ai ?? [], ok: lookups !== null && trial !== null && ai !== null };
}
