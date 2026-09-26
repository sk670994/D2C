import "server-only";

import { createGlobalServiceClient } from "./supabase";
import type { SourceScope, SourceStatusScope } from "./source-scope";

export type SourceCount = {
  total: number;
  collectedAds: number;
  observedAt: string;
};

export type SourceCounts = {
  scopeType: SourceScope["scopeType"];
  /** Meta's count of currently active ads (from a quick run). */
  active: SourceCount | null;
  /** Meta's count of all ads, active + inactive (from a deep run). */
  all: SourceCount | null;
};

const MISSING_TABLE = /42P01|PGRST205|does not exist|could not find the table/i;

/** Best effort: a failed write never fails a collection. */
export async function recordSourceCount(input: {
  platform: string;
  country: string;
  scope: SourceScope;
  statusScope: SourceStatusScope;
  metaTotal: number;
  collectedAds: number;
}): Promise<void> {
  if (!Number.isFinite(input.metaTotal) || input.metaTotal < 0) return;
  try {
    const client = createGlobalServiceClient();
    const { error } = await client.from("adspy_source_counts").upsert(
      {
        platform: input.platform,
        country: input.country.trim().toUpperCase(),
        scope_type: input.scope.scopeType,
        scope_key: input.scope.scopeKey,
        status_scope: input.statusScope,
        meta_total: Math.round(input.metaTotal),
        collected_ads: Math.max(0, Math.round(input.collectedAds)),
        observed_at: new Date().toISOString(),
      },
      { onConflict: "platform,country,scope_type,scope_key,status_scope" },
    );
    if (error && !MISSING_TABLE.test(`${error.code ?? ""} ${error.message}`)) {
      console.warn("[AdSpy source count] write failed", error.message);
    }
  } catch (error) {
    console.warn("[AdSpy source count] write failed", error instanceof Error ? error.message : error);
  }
}

/** Latest Meta counts for a scope. Null when never observed (or table missing). */
export async function getSourceCounts(input: {
  platform: string;
  country: string;
  scope: SourceScope;
}): Promise<SourceCounts | null> {
  try {
    const client = createGlobalServiceClient();
    const { data, error } = await client
      .from("adspy_source_counts")
      .select("status_scope, meta_total, collected_ads, observed_at")
      .eq("platform", input.platform)
      .eq("country", input.country.trim().toUpperCase())
      .eq("scope_type", input.scope.scopeType)
      .eq("scope_key", input.scope.scopeKey)
      .limit(2);
    if (error) {
      if (!MISSING_TABLE.test(`${error.code ?? ""} ${error.message}`)) {
        console.warn("[AdSpy source count] read failed", error.message);
      }
      return null;
    }
    const rows = (data ?? []) as Array<{ status_scope: string; meta_total: number; collected_ads: number | null; observed_at: string }>;
    if (!rows.length) return null;
    const pick = (scope: SourceStatusScope): SourceCount | null => {
      const row = rows.find((r) => r.status_scope === scope);
      return row
        ? { total: Number(row.meta_total), collectedAds: Number(row.collected_ads ?? 0), observedAt: String(row.observed_at) }
        : null;
    };
    return { scopeType: input.scope.scopeType, active: pick("active"), all: pick("all") };
  } catch {
    return null;
  }
}
