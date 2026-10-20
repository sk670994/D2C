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
/** complete / stopped_by columns not there yet (migration 20261021010000). */
const MISSING_COLUMN = /PGRST204|42703|column .* does not exist|could not find the '.*' column/i;

/** Best effort: a failed write never fails a collection. */
export async function recordSourceCount(input: {
  platform: string;
  country: string;
  scope: SourceScope;
  statusScope: SourceStatusScope;
  metaTotal: number;
  collectedAds: number;
  /** Browser scans: reached Meta's end (>= 98% of its total)? Null = not known. */
  complete?: boolean | null;
  stoppedBy?: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.metaTotal) || input.metaTotal < 0) return;
  try {
    const client = createGlobalServiceClient();
    const row: Record<string, unknown> = {
      platform: input.platform,
      country: input.country.trim().toUpperCase(),
      scope_type: input.scope.scopeType,
      scope_key: input.scope.scopeKey,
      status_scope: input.statusScope,
      meta_total: Math.round(input.metaTotal),
      collected_ads: Math.max(0, Math.round(input.collectedAds)),
      observed_at: new Date().toISOString(),
    };
    const withScan = input.complete !== undefined || input.stoppedBy !== undefined;
    if (withScan) {
      row.complete = input.complete ?? null;
      row.stopped_by = input.stoppedBy ?? null;
    }
    const onConflict = "platform,country,scope_type,scope_key,status_scope";
    let { error } = await client.from("adspy_source_counts").upsert(row, { onConflict });
    if (error && withScan && MISSING_COLUMN.test(`${error.code ?? ""} ${error.message}`)) {
      // Older schema: keep the count, drop the scan details.
      delete row.complete;
      delete row.stopped_by;
      ({ error } = await client.from("adspy_source_counts").upsert(row, { onConflict }));
    }
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
  /** Called when the read failed (not when there is simply no row). */
  onError?: () => void;
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
        input.onError?.();
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
    input.onError?.();
    return null;
  }
}
