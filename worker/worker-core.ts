/**
 * Pure logic for the AdSpy worker, kept free of I/O so it can be unit tested.
 */

export type Candidate = {
  id: string;
  run_id: string;
  payload: Record<string, unknown> | null;
  attempt: number;
  max_attempts: number;
  priority: number;
  available_at: string;
  created_at: string;
  status: string;
};

export type ErrorCode =
  | "SOURCE_NAVIGATION_ERROR"
  | "SOURCE_BLOCKED"
  | "EXTRACTION_CONTRACT_CHANGED"
  | "BROWSER_RESOURCE_ERROR"
  | "DATABASE_ERROR"
  | "MEDIA_ERROR"
  | "STATE_CONFLICT"
  | "INVALID_DATA"
  | "UNKNOWN";

/** Map a thrown collection error to a stable code for logs, retries and alerts. */
export function classifyCollectionError(error: unknown): ErrorCode {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const m = message.toLowerCase();

  if (/err_insufficient_resources|file_error_no_space|no space left|target page, context or browser has been closed|browser has (been closed|disconnected)|out of memory|crashed/.test(m)) {
    return "BROWSER_RESOURCE_ERROR";
  }
  if (/login|checkpoint|captcha|temporarily blocked|rate limit|429|you.?re temporarily/.test(m)) {
    return "SOURCE_BLOCKED";
  }
  if (/page\.goto|net::err_|navigation timeout|timeout .* exceeded|err_connection|err_name_not_resolved/.test(m)) {
    return "SOURCE_NAVIGATION_ERROR";
  }
  if (/extract|no ad cards|contract|unexpected payload|selector/.test(m)) {
    return "EXTRACTION_CONTRACT_CHANGED";
  }
  if (/is not running or no longer exists|already (completed|terminal)|not claimed/.test(m)) {
    return "STATE_CONFLICT";
  }
  if (/media|storage|upload/.test(m)) return "MEDIA_ERROR";
  if (/supabase|postgres|statement timeout|failed to (update|claim|complete|transition|load|create|enqueue)|fetch failed|pgrst/.test(m)) {
    return "DATABASE_ERROR";
  }
  if (name === "NonRetryableCollectionError" || /requires both runid|not found|invalid/.test(m)) return "INVALID_DATA";
  return "UNKNOWN";
}

/**
 * First candidate that can still be attempted. The SQL claim re-checks every
 * condition under a row lock; this only avoids pointless claim round-trips.
 */
export function pickRunnable(candidates: Candidate[], now = Date.now()): Candidate | null {
  for (const c of candidates) {
    if (c.status !== "queued" && c.status !== "retrying") continue;
    if (c.attempt >= c.max_attempts) continue;
    const at = new Date(c.available_at).getTime();
    if (Number.isFinite(at) && at > now) continue;
    return c;
  }
  return null;
}

/** Idle poll delay: 1s right after work, backing off to 5s, with jitter. */
export function idleDelayMs(idleRounds: number, random = Math.random): number {
  const base = Math.min(5_000, 1_000 * Math.max(1, idleRounds));
  return Math.round(base * (0.85 + random() * 0.3));
}

export function shouldRecycleBrowser(input: {
  jobsSinceRecycle: number;
  recycleEvery: number;
  rssMb: number;
  maxRssMb: number;
}): boolean {
  return input.jobsSinceRecycle >= input.recycleEvery || input.rssMb >= input.maxRssMb;
}

/**
 * Stops collection while the source keeps failing, then lets one probe
 * through after `openMs`. Protects Meta (and our IP) from a retry storm when
 * the extractor or the network is broken.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probing = false;

  constructor(
    private readonly opts: { failureThreshold: number; openMs: number },
    private readonly clock: () => number = Date.now,
  ) {}

  state(): "closed" | "open" | "half_open" {
    if (this.openedAt === null) return "closed";
    return this.clock() - this.openedAt >= this.opts.openMs ? "half_open" : "open";
  }

  allow(): boolean {
    const s = this.state();
    if (s === "closed") return true;
    if (s === "half_open" && !this.probing) {
      this.probing = true;
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
    this.probing = false;
  }

  /** A probe that ended for a reason unrelated to the source: allow another probe. */
  release() {
    this.probing = false;
  }

  recordFailure() {
    this.failures += 1;
    if (this.probing || this.failures >= this.opts.failureThreshold) {
      this.openedAt = this.clock();
      this.probing = false;
    }
  }
}
