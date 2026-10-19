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
import { dispatchAdSpyCollection, getAdSpyDispatchMode } from "./dispatch-adspy-collection";
import { apiMinIntervalMs, dailyCreditCap, DEFERRED_MESSAGE, paidMetaSourceActive, TRIAL_LIMIT_MESSAGE } from "@/lib/ad-intelligence/credit-guard";

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
  (process.env.ADSPY_COLLECTOR === "worker" || process.env.ADSPY_COLLECTOR === "searchapi" ? 30 * 60_000 : RUN_STALE_AFTER_MS);

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

/**
 * How much of Meta's library a collection reads when the caller does not say.
 * "quick" = Meta's first page of ACTIVE ads (~30), the most a 60s Vercel
 * function can do. With the persistent worker there is no such limit, so
 * every collection reads the advertiser's full library ("deep", active and
 * inactive, up to DEEP_TARGET ads). This is what closes the gap with Meta.
 */
export function defaultCollectionDepth(): "quick" | "deep" {
  const forced = process.env.ADSPY_DEFAULT_DEPTH;
  if (forced === "quick" || forced === "deep") return forced;
  const mode = getAdSpyDispatchMode();
  return mode === "worker" || mode === "searchapi" ? "deep" : "quick";
}

export type StartCollectionReason = "user" | "track" | "scheduled";

export type StartCollectionResult = {
  job: CollectionJob;
  run: DurableRun | null;
  dispatched: boolean;
  outcome:
    | "dispatched"
    | "already_running"
    | "recently_collected"
    | "running_for_another_request"
    /** Paid live-fetch budget used up: the PC collects this brand tonight. */
    | "deferred"
    /** Free trial's 3 brand look-ups are used up. */
    | "trial_limit";
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

/**
 * A person looked this brand up but nothing new was started (already running,
 * recently collected...). Still record the look-up: tonight's prefill reads
 * brands whose last_requested_at is within 26 h. Best effort, never throws.
 */
async function recordLookup(job: CollectionJob): Promise<void> {
  // Already recorded by getOrCreateAdvertiserCollectionJob a moment ago.
  const last = new Date(job.lastRequestedAt).getTime();
  if (Number.isFinite(last) && Date.now() - last < 60_000) return;
  try {
    const { error } = await createGlobalServiceClient()
      .from("ad_intelligence_collection_jobs")
      .update({ last_requested_at: new Date().toISOString() })
      .eq("id", job.id);
    if (error) console.warn("[AdSpy] could not record look-up:", error.message);
  } catch (error) {
    console.warn("[AdSpy] could not record look-up:", error instanceof Error ? error.message : error);
  }
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
  // Only people's look-ups are recorded; the scheduled prefill must not keep
  // re-adding brands to its own "looked up in the last 26 h" list.
  const lookup = input.reason === "user" || input.reason === "track";
  const country = input.country.trim().toUpperCase();
  let pageId =
    input.mode === "advertiser" && input.pageId && /^\d+$/.test(input.pageId.trim())
      ? input.pageId.trim()
      : null;
  // A person searching a brand name: if exactly one known Meta page matches,
  // collect that page, not a name (keyword) search. A name search reads other
  // pages' ads and finds only a handful of the brand's own (P-TAL: 5 of 144).
  if (!pageId && input.mode === "advertiser" && (input.reason === "user" || input.reason === "track")) {
    const { resolveIndexedPage } = await import("@/lib/ad-intelligence/discovery/resolve-indexed-page");
    pageId = (await resolveIndexedPage(query, country))?.pageId ?? null;
  }

  let job = await getOrCreateAdvertiserCollectionJob({
    query,
    country,
    platform: input.platform,
    mode: input.mode,
    userId: input.userId,
    advertiserPageId: pageId,
    recordLookup: lookup,
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
    if (lookup) await recordLookup(job);
    return { job, run: ownRun, dispatched: false, outcome: "already_running", collectionKey };
  }

  // 3. Someone else's collection for the same advertiser is in flight; it
  //    writes to the shared index, so don't start a duplicate scrape.
  const activeForKey = await findActiveRunForKey(collectionKey);
  if (activeForKey && activeForKey.collection_job_id !== job.id) {
    // Hand back the job that is actually collecting, so the page follows its progress.
    const live = (await getCollectionJob(activeForKey.collection_job_id)) ?? job;
    if (lookup) await recordLookup(job);
    return { job: live, run: ownRun, dispatched: false, outcome: "running_for_another_request", collectionKey };
  }

  // 3b. Same Meta page, different name ("Mamaearth" vs "mama earth", or many
  //     users setting the same page as their brand): one collection per page.
  //     Without this, 10 users = 10 deep scrapes of one page, all writing the
  //     same rows at once (QA run, 27 Sep: timeouts and deadlocks).
  if (pageId) {
    const since = new Date(Date.now() - Math.max(input.minIntervalMs ?? 0, 30 * 60_000)).toISOString();
    const { data: pageRuns } = await createGlobalServiceClient()
      .from("adspy_runs")
      .select("id,status,completed_at,collection_job_id")
      .eq("advertiser_page_id", pageId)
      .or(`status.in.(queued,running,retrying),completed_at.gte.${since}`)
      .limit(5);
    const busy = (pageRuns ?? []) as Array<{ status: string; completed_at: string | null; collection_job_id: string | null }>;
    const other = busy.find((r) => ACTIVE_RUN_STATUSES.has(r.status) && r.collection_job_id !== job.id);
    if (other) {
      // Follow the collection already running for this page (same data for everyone).
      const live = other.collection_job_id ? await getCollectionJob(other.collection_job_id) : null;
      if (lookup) await recordLookup(job);
      return { job: live ?? job, run: ownRun, dispatched: false, outcome: "running_for_another_request", collectionKey };
    }
    if (busy.some((r) => r.status === "completed")) {
      if (lookup) await recordLookup(job);
      return { job, run: ownRun, dispatched: false, outcome: "recently_collected", collectionKey };
    }
  }

  // Paid source (credits): user searches get a quick first look at most,
  // within a daily budget; the free PC collector reads the full library.
  const creditGuarded = paidMetaSourceActive() && (input.reason === "user" || input.reason === "track");

  // 4. Respect the minimum interval between collections.
  const minInterval = Math.max(0, input.minIntervalMs ?? 0, creditGuarded ? apiMinIntervalMs() : 0);
  // Only finished collections count. last_requested_at records every
  // look-up (for tonight's prefill), so it must not reset this window: a
  // look-up would otherwise block the next refresh and tonight's full read.
  const lastActivityAt = job.completedAt ? new Date(job.completedAt).getTime() || 0 : 0;
  if (
    minInterval > 0 &&
    !ACTIVE_JOB_STATUSES.has(job.status) &&
    job.status !== "stale" &&
    job.status !== "failed" &&
    lastActivityAt > 0 &&
    Date.now() - lastActivityAt < minInterval
  ) {
    if (lookup) await recordLookup(job);
    return { job, run: ownRun, dispatched: false, outcome: "recently_collected", collectionKey };
  }

  // 4b. Credit budget: site-wide daily ceiling, then the user's daily allowance.
  let depth = input.depth ?? defaultCollectionDepth();
  // What the slot cost, refunded if the collection then fails to start.
  const slotReceipt: { counterKey?: string; brandKeys?: string[] } = {};
  if (creditGuarded) {
    if (process.env.ADSPY_API_USER_DEPTH !== "deep") depth = "quick";
    const { apiCreditsUsedToday, takeUserBrandSlot } = await import("@/lib/ad-intelligence/credit-guard-server");
    const used = await apiCreditsUsedToday();
    const slot = used < dailyCreditCap() ? await takeUserBrandSlot(input.userId, { pageId, name: query }, slotReceipt) : false;
    if (slot === "trial_limit") {
      // Trial look-ups used up: not queued for the night run either.
      job = await updateCollectionJob(job.id, { status: "stale", stage: "stale", errorMessage: TRIAL_LIMIT_MESSAGE });
      return { job, run: ownRun, dispatched: false, outcome: "trial_limit", collectionKey };
    }
    if (!slot) {
      console.info("[AdSpy credits] deferred to the night run", { query, pageId, creditsUsedToday: used });
      job = await updateCollectionJob(job.id, {
        status: "stale",
        stage: "stale",
        errorMessage: DEFERRED_MESSAGE,
        lastRequestedAt: new Date().toISOString(),
      });
      return { job, run: ownRun, dispatched: false, outcome: "deferred", collectionKey };
    }
  }

  // 5. Start a fresh run + request and hand it to the worker.
  //    The trial/daily slot above is taken before this point (it decides
  //    whether to start at all). If any step until the request is queued
  //    throws, give the slot back: the user got nothing for it. Once queued,
  //    the worker will collect it even if the dispatch ping below fails.
  const queue = async () => {
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
      collectionDepth: depth,
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
    return { run, payload, requestId: request.id };
  };
  const queued = await queue().catch(async (error: unknown) => {
    if (slotReceipt.counterKey) {
      const { refundUserBrandSlot } = await import("@/lib/ad-intelligence/credit-guard-server");
      await refundUserBrandSlot(slotReceipt);
    }
    throw error;
  });

  await dispatchAdSpyCollection(
    { ...queued.payload, requestId: queued.requestId },
    `${collectionKey}:${queued.requestId}`,
  );

  return { job, run: queued.run, dispatched: true, outcome: "dispatched", collectionKey };
}
