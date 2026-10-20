import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

/**
 * Shared, short-lived cache for per-brand summaries.
 *
 * Every user who watches Mamaearth needs the same Mamaearth summary, which
 * costs up to 3,000 ad rows to compute. Without a cache, 5 users opening
 * Today at once meant ~75,000 rows read in seconds and the database stalled
 * (QA run, 27 Sep). Now each brand is computed at most once per TTL:
 *   1. this server's memory (instant)
 *   2. one computation in flight per key (concurrent requests wait for it)
 *   3. the today_cache table, shared by all servers (migration 20260930010000)
 *   4. compute, then store in 1 and 3
 * If the table is missing, it quietly works with memory only.
 */

type Entry = { at: number; value: unknown };
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_MEMORY_KEYS = 500;
let tableMissing = false;

/**
 * Only a genuinely missing table switches the shared cache off for this
 * server's lifetime. A generic "schema cache" error is transient (PostgREST
 * reloading) and used to disable the shared cache until the next deploy.
 */
function missing(error: { code?: string | null; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /\b(42P01|PGRST205)\b/.test(error.message) || /relation .* does not exist/i.test(error.message);
}

async function readDb(key: string, ttlMs: number): Promise<unknown | undefined> {
  if (tableMissing) return undefined;
  const { data, error } = await createGlobalServiceClient().from("today_cache").select("payload,computed_at").eq("cache_key", key).maybeSingle();
  if (error) {
    if (missing(error)) tableMissing = true;
    return undefined;
  }
  const row = data as { payload: unknown; computed_at: string } | null;
  if (!row) return undefined;
  const age = Date.now() - Date.parse(row.computed_at);
  return Number.isFinite(age) && age < ttlMs ? row.payload : undefined;
}

async function writeDb(key: string, value: unknown) {
  if (tableMissing) return;
  const { error } = await createGlobalServiceClient()
    .from("today_cache")
    .upsert({ cache_key: key, payload: value, computed_at: new Date().toISOString() }, { onConflict: "cache_key" });
  if (error && missing(error)) tableMissing = true;
}

function remember(key: string, value: unknown) {
  if (memory.size >= MAX_MEMORY_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { at: Date.now(), value });
}

/** Longest time this server trusts its own memory copy (see cached()). */
const MEMORY_TTL_MS = 10 * 60_000;
/** How long a value computed while a sub-read failed is reused (memory only). */
const DEGRADED_TTL_MS = 2 * 60_000;

/**
 * `options.store` is asked after compute(): when it returns false (a sub-read
 * failed and the value is partial), the value is served but not written to
 * the shared table, and this server keeps it for 2 minutes only.
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>, options: { store?: () => boolean } = {}): Promise<T> {
  const hit = memory.get(key);
  // Memory is per server and cannot be cleared by forget() on another one, so
  // it is trusted for at most 10 minutes; after that the shared row (one
  // primary-key read) decides, which forget() does clear.
  if (hit && Date.now() - hit.at < Math.min(ttlMs, MEMORY_TTL_MS)) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const job = (async () => {
    const fromDb = await readDb(key, ttlMs).catch(() => undefined);
    if (fromDb !== undefined) {
      remember(key, fromDb);
      return fromDb as T;
    }
    const value = await compute();
    if (options.store && !options.store()) {
      // Partial result: reuse briefly so an outage does not recompute per request.
      remember(key, value);
      const entry = memory.get(key);
      if (entry) entry.at = Date.now() - Math.max(0, Math.min(ttlMs, MEMORY_TTL_MS) - DEGRADED_TTL_MS);
      return value;
    }
    remember(key, value);
    await writeDb(key, value).catch(() => undefined);
    return value;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/** Drop a brand's cached summary (e.g. right after a fresh collection). */
export async function forget(prefix: string) {
  for (const key of Array.from(memory.keys())) if (key.startsWith(prefix)) memory.delete(key);
  if (!tableMissing) await createGlobalServiceClient().from("today_cache").delete().like("cache_key", `${prefix}%`).then(() => undefined, () => undefined);
}

/**
 * Drop one brand page's Today entries (lib/today/load.ts keys
 * `sum:<pageId>` and `core:<pageId>:<country>`). Called by the collector after
 * it saved that page's ads, so the 6-hour TTL never hides a fresh collection.
 * Best effort, never throws.
 */
export async function forgetBrand(pageId: string): Promise<void> {
  const id = String(pageId ?? "").trim();
  if (!/^\d+$/.test(id)) return;
  await Promise.all([forget(`sum:${id}`), forget(`core:${id}:`)]).catch(() => undefined);
}
