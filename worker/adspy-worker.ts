/**
 * Zooptrack AdSpy persistent collection worker (runs on a small VPS).
 *
 * Why this exists: Chromium scraping is long-running, stateful and memory
 * heavy. On Vercel it hit the 60s limit, filled /tmp and crashed browsers.
 * Here one long-lived process owns ONE browser, runs ONE collection at a time
 * and cleans up after itself.
 *
 * Queue: Postgres (adspy_requests) is the queue. There is no Redis. Work is
 * claimed with adspy_claim_request (row lock + lease + max_attempts), leases
 * are renewed by the collector heartbeat, and expired leases are reaped. That
 * state machine already exists and is tested in production; a second queue
 * would only create a second source of truth.
 *
 * Loop:  pick candidates -> claim (inside collectAdIntelligence) -> scrape ->
 *        batch ingest -> complete/fail -> maybe recycle browser -> repeat.
 *
 * Env (see worker/env.example):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required
 *   ADSPY_BROWSER=playwright                                required
 *   TMPDIR=/work/tmp            dir owned by the worker (Chromium profiles)
 *   ADSPY_WORKER_ID             default <hostname>:<pid>
 *   ADSPY_WORKER_HEALTH_PORT    default 8787 (bound to 127.0.0.1 in compose)
 *   ADSPY_WORKER_RECYCLE_JOBS   restart Chromium every N jobs (default 15)
 *   ADSPY_WORKER_MAX_RSS_MB     restart Chromium above this RSS (default 1200)
 *   ADSPY_WORKER_MIN_TMP_MB     pause claiming below this free /tmp (default 512)
 */
import { hostname } from "node:os";
import { createServer } from "node:http";
import { statfsSync } from "node:fs";
import os from "node:os";

import {
  collectAdIntelligence,
  NonRetryableCollectionError,
  type CollectionEvent,
} from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import { recoverStaleRuns } from "@/lib/ad-intelligence/jobs/start-collection";
import { reapExpiredAdSpyRequests } from "@/lib/ad-intelligence/durable-run";
import { recycleMetaBrowser, metaBrowserState } from "@/lib/ad-intelligence/providers/deep-meta";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

import {
  CircuitBreaker,
  classifyCollectionError,
  idleDelayMs,
  shouldRecycleBrowser,
  type Candidate,
  pickRunnable,
} from "./worker-core";

const WORKER_ID = process.env.ADSPY_WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
const HEALTH_PORT = Number(process.env.ADSPY_WORKER_HEALTH_PORT) || 8787;
const RECYCLE_JOBS = Number(process.env.ADSPY_WORKER_RECYCLE_JOBS) || 15;
const MAX_RSS_MB = Number(process.env.ADSPY_WORKER_MAX_RSS_MB) || 1200;
const MIN_TMP_MB = Number(process.env.ADSPY_WORKER_MIN_TMP_MB) || 512;
const REAP_EVERY_MS = 60_000;
const DB_HEARTBEAT_EVERY_MS = 30_000;
/** A single job may legitimately run this long (collector budget + ingest). */
const MAX_JOB_MS = (Number(process.env.ADSPY_WORKER_BUDGET_MS) || 8 * 60_000) + 5 * 60_000;

type Stats = {
  startedAt: string;
  jobsProcessed: number;
  jobsFailed: number;
  jobsSkipped: number;
  consecutiveFailures: number;
  lastJobAt: string | null;
  lastJobId: string | null;
  lastError: { code: string; message: string; at: string } | null;
  currentRequestId: string | null;
  jobsSinceRecycle: number;
  lastHeartbeatAt: string | null;
  lastLoopAt: string | null;
  currentJobStartedAt: string | null;
  breaker: string;
};

const stats: Stats = {
  startedAt: new Date().toISOString(),
  jobsProcessed: 0,
  jobsFailed: 0,
  jobsSkipped: 0,
  consecutiveFailures: 0,
  lastJobAt: null,
  lastJobId: null,
  lastError: null,
  currentRequestId: null,
  jobsSinceRecycle: 0,
  lastHeartbeatAt: null,
  lastLoopAt: null,
  currentJobStartedAt: null,
  breaker: "closed",
};

let stopping = false;
const breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 10 * 60_000 });

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, worker: WORKER_ID, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function tmpFreeMb(): number | null {
  try {
    const st = statfsSync(os.tmpdir());
    return Math.round((st.bavail * st.bsize) / 1_048_576);
  } catch {
    return null;
  }
}

function snapshot() {
  const mem = process.memoryUsage();
  return {
    worker: WORKER_ID,
    alive: !stopping,
    healthy: isHealthy(),
    uptimeSec: Math.round(process.uptime()),
    browser: metaBrowserState(),
    rssMb: Math.round(mem.rss / 1_048_576),
    heapMb: Math.round(mem.heapUsed / 1_048_576),
    tmpDir: os.tmpdir(),
    tmpFreeMb: tmpFreeMb(),
    ...stats,
    breaker: breaker.state(),
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Healthy = the DB heartbeat is fresh AND the loop is moving: either idle
 * iterations are recent, or the current job is still inside its budget.
 */
function isHealthy(now = Date.now()): boolean {
  if (stopping) return false;
  const age = (iso: string | null) => (iso ? now - new Date(iso).getTime() : Number.POSITIVE_INFINITY);
  if (age(stats.lastHeartbeatAt) > 3 * 60_000) return false;
  if (stats.currentJobStartedAt) return age(stats.currentJobStartedAt) < MAX_JOB_MS;
  return age(stats.lastLoopAt) < 2 * 60_000;
}

/** Runnable requests, most urgent first. The claim itself is atomic in SQL. */
async function fetchCandidates(): Promise<Candidate[]> {
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_requests")
    .select("id,run_id,payload,attempt,max_attempts,priority,available_at,created_at,status")
    .in("status", ["queued", "retrying"])
    .lte("available_at", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Failed to list AdSpy requests: ${error.message}`);
  return (data ?? []) as Candidate[];
}

async function writeDbHeartbeat() {
  // Best effort. Lets the app / SQL show "is the worker alive?" without SSH.
  const s = snapshot();
  const { error } = await createGlobalServiceClient()
    .from("adspy_workers")
    .upsert(
      {
        worker_id: WORKER_ID,
        host: hostname(),
        started_at: stats.startedAt,
        heartbeat_at: new Date().toISOString(),
        current_request_id: stats.currentRequestId,
        stats: s,
      },
      { onConflict: "worker_id" },
    );
  if (error) log("warn", "db_heartbeat_failed", { error: error.message });
  else stats.lastHeartbeatAt = new Date().toISOString();
}

async function runOne(candidate: Candidate): Promise<void> {
  const payload = (candidate.payload ?? {}) as Partial<CollectionEvent>;
  if (!payload.jobId || !payload.runId) {
    stats.jobsSkipped += 1;
    log("warn", "request_payload_invalid", { requestId: candidate.id });
    return;
  }

  const event: CollectionEvent = {
    ...(payload as CollectionEvent),
    runId: payload.runId,
    requestId: candidate.id,
  };
  const started = Date.now();
  stats.currentRequestId = candidate.id;
  stats.currentJobStartedAt = new Date(started).toISOString();
  log("info", "job_start", {
    requestId: candidate.id,
    runId: event.runId,
    jobId: event.jobId,
    advertiserId: event.advertiserPageId ?? null,
    query: event.query,
    depth: event.collectionDepth ?? "quick",
    attempt: candidate.attempt + 1,
    stage: "claimed",
  });

  try {
    const result = await collectAdIntelligence(event);
    stats.jobsProcessed += 1;
    stats.consecutiveFailures = 0;
    breaker.recordSuccess();
    log("info", "job_done", {
      requestId: candidate.id,
      runId: event.runId,
      status: "completed",
      durationMs: Date.now() - started,
      discovered: result.discoveredAds,
      persisted: result.persistedAds,
    });
  } catch (error) {
    const code = classifyCollectionError(error);
    const message = error instanceof Error ? error.message : String(error);
    stats.jobsFailed += 1;
    stats.consecutiveFailures += 1;
    stats.lastError = { code, message: message.slice(0, 300), at: new Date().toISOString() };
    // Only source-side problems count toward the breaker (don't hammer Meta).
    if (code === "SOURCE_BLOCKED" || code === "SOURCE_NAVIGATION_ERROR" || code === "EXTRACTION_CONTRACT_CHANGED") {
      breaker.recordFailure();
    } else {
      breaker.release();
    }
    log(error instanceof NonRetryableCollectionError ? "warn" : "error", "job_failed", {
      requestId: candidate.id,
      runId: event.runId,
      status: error instanceof NonRetryableCollectionError ? "failed_final" : "failed_retryable",
      errorCode: code,
      error: message.slice(0, 500),
      durationMs: Date.now() - started,
    });
    // BROWSER_RESOURCE_ERROR: start the next job on a fresh Chromium.
    if (code === "BROWSER_RESOURCE_ERROR") stats.jobsSinceRecycle = RECYCLE_JOBS;
  } finally {
    stats.currentRequestId = null;
    stats.currentJobStartedAt = null;
    stats.lastJobAt = new Date().toISOString();
    stats.lastJobId = candidate.id;
    stats.jobsSinceRecycle += 1;
  }

  const rssMb = Math.round(process.memoryUsage().rss / 1_048_576);
  if (shouldRecycleBrowser({ jobsSinceRecycle: stats.jobsSinceRecycle, recycleEvery: RECYCLE_JOBS, rssMb, maxRssMb: MAX_RSS_MB })) {
    const cleaned = await recycleMetaBrowser();
    stats.jobsSinceRecycle = 0;
    log("info", "browser_recycled", { rssMb, ...cleaned });
  }
}

async function maintenance() {
  try {
    const reaped = await reapExpiredAdSpyRequests();
    const recovered = await recoverStaleRuns();
    if (reaped || recovered) log("info", "reaper", { reapedRequests: reaped, recoveredRuns: recovered });
  } catch (error) {
    log("warn", "reaper_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function loop() {
  let idleRounds = 0;
  let lastReap = 0;

  while (!stopping) {
    const now = Date.now();
    stats.lastLoopAt = new Date(now).toISOString();
    if (now - lastReap > REAP_EVERY_MS) {
      lastReap = now;
      await maintenance();
    }

    const free = tmpFreeMb();
    if (free !== null && free < MIN_TMP_MB) {
      const cleaned = await recycleMetaBrowser();
      log("error", "tmp_low", { tmpFreeMbBefore: free, minTmpMb: MIN_TMP_MB, tmpFreeMbAfter: cleaned.tmpFreeMb, removedProfiles: cleaned.removedProfiles });
      if ((cleaned.tmpFreeMb ?? 0) < MIN_TMP_MB) {
        await sleep(30_000);
        continue;
      }
    }

    if (!breaker.allow()) {
      await sleep(15_000);
      continue;
    }

    let candidates: Candidate[] = [];
    try {
      candidates = await fetchCandidates();
    } catch (error) {
      log("error", "queue_poll_failed", { errorCode: "DATABASE_ERROR", error: error instanceof Error ? error.message : String(error) });
      await sleep(10_000);
      continue;
    }

    const next = pickRunnable(candidates);
    if (!next) {
      idleRounds += 1;
      await sleep(idleDelayMs(idleRounds));
      continue;
    }
    idleRounds = 0;
    await runOne(next);
  }
}

function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      const body = snapshot();
      const healthy = isHealthy();
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(HEALTH_PORT, "0.0.0.0", () => log("info", "health_listening", { port: HEALTH_PORT }));
  return server;
}

async function main() {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) {
      log("error", "missing_env", { key });
      process.exit(2);
    }
  }
  if (process.env.ADSPY_BROWSER !== "playwright") {
    log("error", "missing_env", { key: "ADSPY_BROWSER", expected: "playwright" });
    process.exit(2);
  }

  const server = startHealthServer();
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "shutdown", { signal, currentRequestId: stats.currentRequestId });
    // The in-flight job keeps its lease; if we are killed before it finishes,
    // the reaper returns it to "retrying" and another loop picks it up.
    const deadline = Date.now() + 25_000;
    while (stats.currentRequestId && Date.now() < deadline) await sleep(500);
    await recycleMetaBrowser().catch(() => undefined);
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => log("error", "unhandled_rejection", { error: String(reason) }));

  // Start clean: nothing in TMPDIR can be in use yet.
  const cleaned = await recycleMetaBrowser();
  log("info", "worker_start", { tmpDir: os.tmpdir(), ...cleaned, node: process.version });
  await writeDbHeartbeat();
  // Independent of the loop, so a long job still shows the worker as alive.
  setInterval(() => void writeDbHeartbeat(), DB_HEARTBEAT_EVERY_MS);
  await loop();
}

void main();
