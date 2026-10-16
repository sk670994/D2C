/**
 * Founder dashboard "Operations" panel: pure summaries (unit-tested in
 * ops.test.ts). Data is loaded in ops-server.ts.
 */

export type RunRow = {
  status: string;
  persisted_ads: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export function summarizeRuns(rows: RunRow[]) {
  let done = 0;
  let failed = 0;
  let running = 0;
  let ads = 0;
  let firstStart: string | null = null;
  let lastEnd: string | null = null;
  const errors = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "exhausted") done += 1;
    else if (r.status === "failed" || r.status === "cancelled") failed += 1;
    else running += 1; // queued / running / retrying
    ads += Math.max(0, Number(r.persisted_ads ?? 0) || 0);
    const start = r.started_at ?? r.created_at;
    if (!firstStart || start < firstStart) firstStart = start;
    if (r.completed_at && (!lastEnd || r.completed_at > lastEnd)) lastEnd = r.completed_at;
    if (r.error_message && r.status === "failed") {
      // Group by the first sentence so one outage is one line.
      const key = r.error_message.split(/[:.]\s/)[0].slice(0, 80);
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
  }
  const topError = [...errors.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return { total: rows.length, done, failed, running, ads, firstStart, lastEnd, topError: topError ? { message: topError[0], count: topError[1] } : null };
}

export type CoverageRow = { scope_key: string; meta_total: number; collected_ads: number; observed_at: string };

/** A page is complete when we hold at least as many live ads as Meta shows. */
export function summarizeCoverage(rows: CoverageRow[], names: Map<string, string> = new Map()) {
  const incomplete = rows
    .filter((r) => r.meta_total > 0 && r.collected_ads < r.meta_total)
    .map((r) => ({
      pageId: r.scope_key,
      name: names.get(r.scope_key) ?? r.scope_key,
      collected: r.collected_ads,
      metaTotal: r.meta_total,
      pct: Math.floor((100 * r.collected_ads) / r.meta_total),
    }))
    .sort((a, b) => a.pct - b.pct);
  return { pages: rows.length, complete: rows.length - incomplete.length, incomplete };
}

export type CounterRow = { key: string; hits: number };

/** Rate-limit counters (one row per user and window): users and calls. */
export function summarizeCounters(rows: CounterRow[], cap = Number.POSITIVE_INFINITY) {
  let calls = 0;
  let atCap = 0;
  for (const r of rows) {
    const hits = Math.max(0, Number(r.hits) || 0);
    calls += Math.min(hits, cap);
    if (hits >= cap) atCap += 1;
  }
  return { users: rows.length, calls, atCap };
}

/** Supabase Free: 500 MB database. */
export const DB_LIMIT_BYTES = 500 * 1024 * 1024;

/**
 * Counters are cumulative since the table was created; this baseline was
 * read on 16 Oct 2026, right before the in-place-update fix, so the share
 * shown is for updates made after the fix.
 */
export const HOT_BASELINE = { updates: 97_657, hot: 774, label: "since 16 Oct" };

export function dbHealth(stats: { db_bytes: number; creatives_upd: number; creatives_hot: number } | null) {
  if (!stats) return null;
  const upd = Math.max(0, stats.creatives_upd - HOT_BASELINE.updates);
  const hot = Math.max(0, stats.creatives_hot - HOT_BASELINE.hot);
  return {
    mb: Math.round(stats.db_bytes / (1024 * 1024)),
    pctOfLimit: Math.round((100 * stats.db_bytes) / DB_LIMIT_BYTES),
    hotPct: upd > 0 ? Math.round((1000 * hot) / upd) / 10 : null,
  };
}
