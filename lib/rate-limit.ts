type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size >= MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

/**
 * Limit shared by every server instance (Postgres `rate_limit_hit`), for
 * endpoints that cost money: collection, AI, checkout. Falls back to the
 * per-instance limiter if the database call fails, so a DB hiccup never
 * blocks users and never removes the guard entirely.
 */
export async function checkSharedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const { createGlobalServiceClient } = await import("@/lib/ad-intelligence/global/supabase");
    const { data, error } = await createGlobalServiceClient().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; remaining: number; retry_after_seconds: number }
      | null;
    if (error || !row) throw new Error(error?.message ?? "no row");
    return { allowed: Boolean(row.allowed), remaining: Number(row.remaining), retryAfterSeconds: Number(row.retry_after_seconds) };
  } catch {
    return checkRateLimit(key, limit, windowMs);
  }
}
