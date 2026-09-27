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

function missing(message: string) {
  return /42P01|PGRST205|does not exist|schema cache/i.test(message);
}

async function readDb(key: string, ttlMs: number): Promise<unknown | undefined> {
  if (tableMissing) return undefined;
  const { data, error } = await createGlobalServiceClient().from("today_cache").select("payload,computed_at").eq("cache_key", key).maybeSingle();
  if (error) {
    if (missing(error.message)) tableMissing = true;
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
  if (error && missing(error.message)) tableMissing = true;
}

function remember(key: string, value: unknown) {
  if (memory.size >= MAX_MEMORY_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { at: Date.now(), value });
}

export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const job = (async () => {
    const fromDb = await readDb(key, ttlMs).catch(() => undefined);
    if (fromDb !== undefined) {
      remember(key, fromDb);
      return fromDb as T;
    }
    const value = await compute();
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
