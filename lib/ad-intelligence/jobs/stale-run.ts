/**
 * When a collection run counts as dead (pure; used by recoverStaleRuns).
 * No server-only imports so it can be unit tested.
 */

/** A claimed (running) collection heartbeats every 60s (HEARTBEAT_MS in collect-ad-intelligence.ts). */
export const RUN_STALE_AFTER_MS = 3 * 60_000;
/**
 * A running request's lease: adspy_requests.locked_at is refreshed by every
 * heartbeat and expires after 300 s (adspy_reap_expired_requests default).
 * A running run whose heartbeat is older than RUN_STALE_AFTER_MS is still left
 * alone while one of its requests holds an unexpired lease.
 */
export const REQUEST_LEASE_MS = 300_000;
/** Without a live lease, a running run is only failed after this long. */
export const RUNNING_RUN_HARD_STALE_MS = 20 * 60_000;

/**
 * Pure decision for recoverStaleRuns. `leaseLive` is null when the lease
 * could not be checked.
 */
export function isRunStale(input: { status: string; heartbeatAgeMs: number; leaseLive: boolean | null }): boolean {
  if (input.status !== "running") return input.heartbeatAgeMs >= WAITING_RUN_STALE_AFTER_MS;
  if (input.heartbeatAgeMs < RUN_STALE_AFTER_MS) return false;
  if (input.leaseLive === false) return true;
  // Lease still held, or unknown: only a very old heartbeat counts as dead.
  return input.heartbeatAgeMs >= RUNNING_RUN_HARD_STALE_MS;
}
/**
 * A run that is only waiting (queued / retrying backoff) has no heartbeat.
 * With one persistent worker, waiting behind an 8-minute job is normal, so
 * waiting runs are only given up on after this much longer window.
 */
export const WAITING_RUN_STALE_AFTER_MS =
  Number(process.env.ADSPY_WAITING_RUN_STALE_MS) ||
  (process.env.ADSPY_COLLECTOR === "worker" || process.env.ADSPY_COLLECTOR === "searchapi" ? 30 * 60_000 : RUN_STALE_AFTER_MS);
