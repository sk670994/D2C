import "server-only";

import type { AdPlatform } from "@/lib/ad-intelligence/types";
import type { CollectionJob } from "@/lib/ad-intelligence/global/types";
import type { CollectionEvent } from "./collect-ad-intelligence";

import {
  buildAdvertiserCollectionKey,
  getOrCreateAdvertiserCollectionJob,
} from "@/lib/ad-intelligence/global/page-aware-store";
import { getCollectionJob, updateCollectionJob } from "@/lib/ad-intelligence/global/store";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import {
  enqueueAdSpyRequest,
  finishAdSpyRun,
  getDurableRunByCollectionJob,
  getOrCreateDurableRun,
  type DurableRun,
} from "@/lib/ad-intelligence/durable-run";
import { dispatchAdSpyCollection } from "./dispatch-adspy-collection";

/**
 * The ONE entry point that starts an AdSpy collection.
 *
 * Every caller (user refresh, "track", scheduled refresh) goes through here,
 * so every queue message carries the runId + requestId the worker requires,
 * and stuck runs are recovered before a new one is started.
 */

/** A claimed (running) collection heartbeats every 15s. */
export const RUN_STALE_AFTER_MS = 3 * 60_000;
/**
 * A run that is only waiting (queued / retrying backoff) has no heartbeat.
 * With one persistent worker, waiting behind an 8-minute job is normal, so
 * waiting runs are only given up on after this much longer window.
 */
export const WAITING_RUN_STALE_AFTER_MS =
  Number(process.env.ADSPY_WAITING_RUN_STALE_MS) ||
  (process.env.ADSPY_COLLECTOR === "worker" ? 30 * 60_000 : RUN_STALE_AFTER_MS);

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
  "deep_queued",
  "deep",
]);

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "retrying"]);

export type StartCollectionReason = "user" | "track" | "scheduled";

export type StartCollectionResult = {
  job: CollectionJob;
  run: DurableRun | null;
  dispatched: boolean;
  outcome:
    | "dispatched"
    | "already_running"
    | "recently_collected"
    | "running_for_another_request";
  collectionKey: string;
};

export class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(
      `${platform} collection is not available yet. Only Meta Ad Library collection is supported.`,
    );
    this.name = "UnsupportedPlatformError";
  }
}

function heartbeatAgeMs(run: { heartbeat_at?: string | null; updated_at?: string | null }): number {
  const stamp = run.heartbeat_at ?? run.updated_at ?? null;
  const t = stamp ? new Date(stamp).getTime() : NaN;
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

/**
 * Marks runs whose worker stopped heart-beating (e.g. killed at the 60s
 * function limit) as failed, and the collection jobs they drive as stale,
 * so a new collection can start instead of "refreshing" forever.
 */
export async function recoverStaleRuns(collectionKey?: string): Promise<number> {
  const client = createGlobalServiceClient();
  let query = client
    .from("adspy_runs")
    .select("id,collection_job_id,status,heartbeat_at,updated_at")
    .in("status", Array.from(ACTIVE_RUN_STATUSES))
    .limit(200);
  if (collectionKey) query = query.eq("collection_key", collectionKey);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to scan AdSpy runs: ${error.message}`);

  let recovered = 0;
  for (const row of data ?? []) {
    const limit = row.status === "running" ? RUN_STALE_AFTER_MS : WAITING_RUN_STALE_AFTER_MS;
    if (heartbeatAgeMs(row) < limit) continue;

    await finishAdSpyRun({
      runId: String(row.id),
      status: "failed",
      errorMessage: "Collector stopped responding before finishing (timed out).",
    });

    await client
      .from("ad_intelligence_collection_jobs")
      .update({
        status: "stale",
        stage: "stale",
        error_message: "The previous collection timed out. Start a refresh to try again.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(row.collection_job_id))
      .in("status", Array.from(ACTIVE_JOB_STATUSES));

    recovered += 1;
  }
  return recovered;
}

async function findActiveRunForKey(collectionKey: string): Promise<{ id: string; collection_job_id: string } | null> {
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_runs")
    .select("id,collection_job_id")
    .eq("collection_key", collectionKey)
    .in("status", Array.from(ACTIVE_RUN_STATUSES))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to check active AdSpy run: ${error.message}`);
  return data ? { id: String(data.id), collection_job_id: String(data.collection_job_id) } : null;
}

export async function startAdSpyCollection(input: {
  userId: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  pageId?: string | null;
  /** Skip if this job finished less than this long ago. */
  minIntervalMs?: number;
  reason: StartCollectionReason;
  /** "deep" reads the full library (background collector only). */
  depth?: "quick" | "deep";
}): Promise<StartCollectionResult> {
  if (input.platform !== "meta") {
    throw new UnsupportedPlatformError(input.platform);
  }

  const query = input.query.replace(/\s+/g, " ").trim();
  const country = input.country.trim().toUpperCase();
  const pageId =
    input.mode === "advertiser" && input.pageId && /^\d+$/.test(input.pageId.trim())
      ? input.pageId.trim()
      : null;

  let job = await getOrCreateAdvertiserCollectionJob({
    query,
    country,
    platform: input.platform,
    mode: input.mode,
    userId: input.userId,
    advertiserPageId: pageId,
  });

  const collectionKey = buildAdvertiserCollectionKey({
    query: job.query,
    country: job.country,
    platform: job.platform,
    mode: job.mode,
    pageId,
  });

  // 1. Clear out collections whose worker died, for this key.
  await recoverStaleRuns(collectionKey);

  // 2. Already running for this user's job → just report it.
  const ownRun = await getDurableRunByCollectionJob(job.id, input.userId);
  job = (await getCollectionJob(job.id, input.userId)) ?? job;

  if (
    ACTIVE_JOB_STATUSES.has(job.status) &&
    ownRun &&
    ACTIVE_RUN_STATUSES.has(ownRun.status)
  ) {
    return { job, run: ownRun, dispatched: false, outcome: "already_running", collectionKey };
  }

  // 3. Someone else's collection for the same advertiser is in flight; it
  //    writes to the shared index, so don't start a duplicate scrape.
  const activeForKey = await findActiveRunForKey(collectionKey);
  if (activeForKey && activeForKey.collection_job_id !== job.id) {
    return { job, run: ownRun, dispatched: false, outcome: "running_for_another_request", collectionKey };
  }

  // 4. Respect the minimum interval between collections.
  const minInterval = Math.max(0, input.minIntervalMs ?? 0);
  const lastActivityAt = Math.max(
    new Date(job.lastRequestedAt).getTime() || 0,
    job.completedAt ? new Date(job.completedAt).getTime() || 0 : 0,
  );
  if (
    minInterval > 0 &&
    !ACTIVE_JOB_STATUSES.has(job.status) &&
    job.status !== "stale" &&
    job.status !== "failed" &&
    lastActivityAt > 0 &&
    Date.now() - lastActivityAt < minInterval
  ) {
    return { job, run: ownRun, dispatched: false, outcome: "recently_collected", collectionKey };
  }

  // 5. Start a fresh run + request and hand it to the worker.
  job = await updateCollectionJob(job.id, {
    status: "queued",
    stage: "queued",
    errorMessage: null,
    completedAt: null,
    discoveredAds: 0,
    normalizedAds: 0,
    persistedAds: 0,
    startedAt: null,
    lastRequestedAt: new Date().toISOString(),
  });

  const run = await getOrCreateDurableRun({
    userId: input.userId,
    collectionJobId: job.id,
    collectionKey,
    query: job.query,
    country: job.country,
    platform: job.platform,
    mode: job.mode,
    advertiserPageId: pageId,
  });

  const payload: Omit<CollectionEvent, "requestId"> = {
    jobId: job.id,
    query: job.query,
    country: job.country,
    platform: job.platform,
    mode: job.mode,
    collectionKey,
    collectionDepth: input.depth ?? "quick",
    advertiserPageId: pageId,
    runId: run.id,
  };

  const request = await enqueueAdSpyRequest({
    runId: run.id,
    // Unique per dispatch so a re-used run never hands back an old,
    // already-completed request that the worker would refuse to claim.
    uniqueKey: `${collectionKey}:${input.reason}:${Date.now()}`,
    requestType: "initial",
    payload,
    priority: input.reason === "user" ? 100 : 50,
    maxAttempts: 2,
  });

  await dispatchAdSpyCollection(
    { ...payload, requestId: request.id },
    `${collectionKey}:${request.id}`,
  );

  return { job, run, dispatched: true, outcome: "dispatched", collectionKey };
}
