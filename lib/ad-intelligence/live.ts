/**
 * The one definition of a "live" ad for TypeScript readers (Today, Brand
 * Vault). An ad is live only when Meta still lists it as active AND we saw
 * it within the last LIVE_WINDOW_HOURS: a stale "active" flag on a brand we
 * have not re-collected is not evidence that the ad is still running.
 * SQL readers keep their own filters.
 */
export const LIVE_WINDOW_HOURS = 48;

const LIVE_WINDOW_MS = LIVE_WINDOW_HOURS * 60 * 60 * 1000;

export type LiveAdLike = {
  is_currently_active?: boolean | null;
  last_seen_at?: string | null;
};

export function isLiveAd(row: LiveAdLike | null | undefined, now: number = Date.now()): boolean {
  if (!row || row.is_currently_active !== true || !row.last_seen_at) return false;
  const seen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(seen)) return false;
  return now - seen <= LIVE_WINDOW_MS;
}
