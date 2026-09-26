import "server-only";

import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform, CompetitorAd } from "@/lib/ad-intelligence/types";
import type {
  AdSearchMode,
  CollectionDepth,
} from "@/lib/ad-intelligence/provider";

import {
  getCollectionJob,
  markTrackedBrandCollected,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import { recordSourceCount } from "@/lib/ad-intelligence/global/source-counts";
import { sourceScopeFor, statusScopeForDepth } from "@/lib/ad-intelligence/global/source-scope";

import { processAdChunk } from "./process-ad-chunk";
import { dispatchAdSpyCollection } from "./dispatch-adspy-collection";

import {
  claimAdSpyRequest,
  completeAdSpyRequest,
  failAdSpyRequest,
  finishAdSpyRun,
  heartbeatAdSpyRun,
  updateAdSpyRunCounts,
} from "@/lib/ad-intelligence/durable-run";

const CHUNK_SIZE = 25;
const HEARTBEAT_MS = 15_000;

/**
 * Serverless functions are killed at maxDuration (60s). The scrape must stop
 * well before that so results are persisted and the request is completed
 * instead of timing out, being redelivered and starting over.
 */
const SERVERLESS_BUDGET_MS = Number(process.env.ADSPY_SERVERLESS_BUDGET_MS) || 40_000;
/** Long-running workers (GitHub Actions) get a per-brand budget instead. */
const WORKER_BUDGET_MS = Number(process.env.ADSPY_WORKER_BUDGET_MS) || 8 * 60_000;
const IS_SERVERLESS = Boolean(process.env.VERCEL) && process.env.ADSPY_BROWSER !== "playwright";
/** Lease must cover one invocation, not 5 of them. */
const LEASE_SECONDS = IS_SERVERLESS ? 90 : Math.ceil(WORKER_BUDGET_MS / 1000) + 120;

/**
 * An error that retrying cannot fix (missing job, malformed message, request
 * already terminal). The queue consumer acknowledges these instead of letting
 * the message be redelivered for 24 hours.
 */
export class NonRetryableCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableCollectionError";
  }
}

type Phase = "quick" | "deep";

export type CollectionEvent = {
  jobId: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;
  collectionKey: string;
  collectionDepth?: CollectionDepth;
  advertiserPageId?: string | null;
  runId?: string;
  requestId?: string;
};

type State = {
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
};

function uniqueBatch(
  ads: CompetitorAd[],
  seen: Set<string>,
): CompetitorAd[] {
  const unique: CompetitorAd[] = [];

  for (const ad of ads) {
    const id = String(ad.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(ad);
  }

  return unique;
}

async function refreshAdvertiserSummaries(platform: string, country: string, pageIds: Set<string>): Promise<void> {
  // Best effort: a failed refresh must never fail the collection. Search
  // recomputes a summary lazily when it is missing or older than 6 hours.
  const { createGlobalServiceClient } = await import("@/lib/ad-intelligence/global/supabase");
  const client = createGlobalServiceClient();
  for (const pageId of Array.from(pageIds).slice(0, 25)) {
    const { error } = await client.rpc("adspy_refresh_advertiser_summary", {
      p_platform: platform,
      p_page_id: pageId,
      p_country: country,
    });
    if (error) {
      console.warn("[AdSpy collect] summary refresh failed", { pageId, error: error.message });
    }
  }
}

export async function collectAdIntelligence(
  data: CollectionEvent,
): Promise<State & { jobId: string }> {
  const job = await getCollectionJob(data.jobId);

  if (!job) {
    throw new NonRetryableCollectionError(`Collection job ${data.jobId} was not found.`);
  }

  const phase: Phase =
    data.platform === "meta" && data.collectionDepth === "deep"
      ? "deep"
      : data.platform === "meta"
        ? "quick"
        : "deep";

  if (!data.runId || !data.requestId) {
    throw new NonRetryableCollectionError(
      "Durable AdSpy execution requires both runId and requestId.",
    );
  }

  const claimed = await claimAdSpyRequest({
    requestId: data.requestId,
    workerId: `adspy:${process.pid}:${crypto.randomUUID()}`,
    leaseSeconds: LEASE_SECONDS,
  });

  if (!claimed) {
    const latest = await getCollectionJob(data.jobId);

    return {
      jobId: data.jobId,
      discoveredAds: latest?.discoveredAds ?? 0,
      normalizedAds: latest?.normalizedAds ?? 0,
      persistedAds: latest?.persistedAds ?? 0,
    };
  }

  const state: State = {
    discoveredAds: Number(job.discoveredAds ?? 0),
    normalizedAds: Number(job.normalizedAds ?? 0),
    persistedAds: Number(job.persistedAds ?? 0),
  };

  const seenIds = new Set<string>();
  // Advertisers whose precomputed summary must be refreshed after this run.
  const touchedAdvertisers = new Set<string>();
  // Meta's own total for this query/page (source-backed), when observed.
  let metaTotalCount: number | null = null;
  // Page the scrape actually read (given, or resolved from the brand name).
  let scrapePageId: string | null = data.advertiserPageId ?? null;
  let resolvedPageId: string | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const persist = async (
    incoming: CompetitorAd[],
  ): Promise<void> => {
    for (const ad of incoming) {
      const total = Number(ad.metadata?.metaTotalCount);
      if (Number.isFinite(total) && total > 0) {
        metaTotalCount = Math.max(metaTotalCount ?? 0, total);
      }
    }

    const ads = uniqueBatch(incoming, seenIds);
    if (!ads.length) return;
    for (const ad of ads) {
      const pageId = String(ad.advertiserId ?? "").trim();
      if (/^\d+$/.test(pageId)) touchedAdvertisers.add(pageId);
    }

    state.discoveredAds += ads.length;

    for (
      let offset = 0;
      offset < ads.length;
      offset += CHUNK_SIZE
    ) {
      const chunk = ads.slice(
        offset,
        offset + CHUNK_SIZE,
      );

      const result = await processAdChunk({
        ads: chunk,
      });

      state.normalizedAds += chunk.length;
      state.persistedAds += Number(
        result.insertedOrUpdated ?? 0,
      );

      await updateCollectionJob(data.jobId, {
        status:
          phase === "quick"
            ? "scraping"
            : "deep",
        stage:
          phase === "quick"
            ? "scraping"
            : "deep",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });

      await updateAdSpyRunCounts({
        runId: data.runId!,
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
        stage:
          phase === "quick"
            ? "meta_quick"
            : "meta_deep",
        status: "running",
      });
    }
  };

  try {
    await updateCollectionJob(data.jobId, {
      status:
        phase === "quick"
          ? "scraping"
          : "deep",
      stage:
        phase === "quick"
          ? "scraping"
          : "deep",
      startedAt:
        job.startedAt ??
        new Date().toISOString(),
      errorMessage: null,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
    });

    await heartbeatAdSpyRun(
      data.runId,
      data.requestId,
    );

    heartbeatTimer = setInterval(() => {
      void heartbeatAdSpyRun(
        data.runId!,
        data.requestId!,
      ).catch((error) => {
        console.error(
          "[ADSPY_DURABLE_HEARTBEAT_FAILED]",
          error,
        );
      });
    }, HEARTBEAT_MS);

    if (!adProviders[data.platform]) {
      throw new Error(
        `No provider configured for ${data.platform}.`,
      );
    }

    if (data.platform === "meta") {
      const {
        collectMetaAdsInBatches,
      } = await import(
        "@/lib/ad-intelligence/providers/deep-meta"
      );

      // A brand NAME search makes Meta run a keyword search ("mars" matches a
      // resort, a cafe and YouTube). On the background worker, first resolve
      // the name to one Meta page; when exactly one page matches, read that
      // page's full ad list instead. Never a guess: ambiguous names stay a
      // name search.
      if (
        data.mode === "advertiser" &&
        !scrapePageId &&
        !IS_SERVERLESS &&
        process.env.ADSPY_RESOLVE_PAGES !== "0"
      ) {
        try {
          const { resolveExactMetaPage } = await import(
            "@/lib/ad-intelligence/discovery/advertiser-discovery"
          );
          const page = await resolveExactMetaPage(data.query, data.country);
          if (page) {
            scrapePageId = page.pageId;
            resolvedPageId = page.pageId;
            console.info("[AdSpy collect] brand name resolved to Meta page", {
              query: data.query,
              pageId: page.pageId,
              name: page.name,
              source: page.source,
            });
          }
        } catch (error) {
          console.warn("[AdSpy collect] page resolution skipped", error instanceof Error ? error.message : error);
        }
      }

      await collectMetaAdsInBatches(
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId: scrapePageId,
          deadlineAt:
            Date.now() + (IS_SERVERLESS ? SERVERLESS_BUDGET_MS : WORKER_BUDGET_MS),
        },
        async (batch) => {
          await persist(batch);
        },
      );

      // Keep Meta's own count so the app can show "Meta shows N, we have M".
      const observedTotal = metaTotalCount as number | null;
      const scope = sourceScopeFor({ mode: data.mode, query: data.query, pageId: scrapePageId });
      if (scope && observedTotal != null) {
        await recordSourceCount({
          platform: data.platform,
          country: data.country,
          scope,
          statusScope: statusScopeForDepth(phase),
          metaTotal: observedTotal,
          collectedAds: state.discoveredAds,
        });
      }
    } else {
      // Google/LinkedIn providers only return a link to the public library,
      // not real creatives. Never write those placeholders into the shared
      // creative index.
      console.info(
        "[AdSpy collect] Skipping non-Meta collection (no creative-level source yet)",
        { platform: data.platform, jobId: data.jobId },
      );
    }

    if (
      phase === "quick" &&
      data.platform === "meta"
    ) {
      await completeAdSpyRequest({
        requestId: data.requestId,
        result: {
          phase: "quick",
          metaTotalCount,
          resolvedPageId,
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
        },
      });

      await finishAdSpyRun({
        runId: data.runId,
        status: "exhausted",
      });

      await updateCollectionJob(
        data.jobId,
        {
          status: "exhausted",
          stage: "complete",
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
        },
      );

      await updateAdSpyRunCounts({
        runId: data.runId,
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
        stage: "complete",
        status: "exhausted",
      });

      await refreshAdvertiserSummaries(data.platform, data.country, touchedAdvertisers);

      return {
        jobId: data.jobId,
        ...state,
      };
    }
    await completeAdSpyRequest({
      requestId: data.requestId,
      result: {
        phase,
        metaTotalCount,
        resolvedPageId,
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
      },
    });

    await finishAdSpyRun({
      runId: data.runId,
      status: "exhausted",
      errorMessage: null,
    });

    await updateCollectionJob(
      data.jobId,
      {
        status: "exhausted",
        stage: "exhausted",
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
        completedAt:
          new Date().toISOString(),
        errorMessage: null,
      },
    );

    await refreshAdvertiserSummaries(data.platform, data.country, touchedAdvertisers);

    await markTrackedBrandCollected({
      query: data.query,
      country: data.country,
      platform: data.platform,
    });

    return {
      jobId: data.jobId,
      ...state,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Collection failed.";

    let requestState:
      | Awaited<
          ReturnType<
            typeof failAdSpyRequest
          >
        >
      | null = null;

    try {
      requestState =
        await failAdSpyRequest({
          requestId: data.requestId,
          errorMessage: message,
          retryable: true,
        });
    } catch (requestError) {
      console.error(
        "[ADSPY_REQUEST_FAILURE_TRANSITION]",
        requestError,
      );
    }

    try {
      if (
        requestState?.status === "retrying"
      ) {
        await updateAdSpyRunCounts({
          runId: data.runId,
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
          stage: "retrying",
          status: "retrying",
        });

        await updateCollectionJob(
          data.jobId,
          {
            status: "queued",
            stage: "queued",
            errorMessage: message,
            discoveredAds:
              state.discoveredAds,
            normalizedAds:
              state.normalizedAds,
            persistedAds:
              state.persistedAds,
          },
        );
      } else {
        await finishAdSpyRun({
          runId: data.runId,
          status: "failed",
          errorMessage: message,
        });

        await updateCollectionJob(
          data.jobId,
          {
            status: "failed",
            stage: "failed",
            errorMessage: message,
            discoveredAds:
              state.discoveredAds,
            normalizedAds:
              state.normalizedAds,
            persistedAds:
              state.persistedAds,
            completedAt:
              new Date().toISOString(),
          },
        );
      }
    } catch (stateError) {
      console.error(
        "[ADSPY_RUN_STATE_UPDATE_FAILED]",
        stateError,
      );
    }

    // Only a request that is genuinely going to be retried may be redelivered.
    // Anything terminal (failed, completed elsewhere, missing) is acknowledged.
    if (requestState?.status !== "retrying") {
      throw new NonRetryableCollectionError(message);
    }
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(
        heartbeatTimer,
      );
    }
  }
}


/**
 * Called by the queue consumer when a message has been delivered too many
 * times. Marks the request/run/job failed (best effort) so the UI stops
 * showing "Collecting" and the message can be acknowledged.
 */
export async function abandonCollection(
  data: CollectionEvent,
  reason: string,
): Promise<void> {
  if (data.requestId) {
    await failAdSpyRequest({
      requestId: data.requestId,
      errorMessage: reason,
      retryable: false,
    }).catch((error) => console.error("[ADSPY_ABANDON_REQUEST_FAILED]", error));
  }
  if (data.runId) {
    await finishAdSpyRun({
      runId: data.runId,
      status: "failed",
      errorMessage: reason,
    }).catch((error) => console.error("[ADSPY_ABANDON_RUN_FAILED]", error));
  }
  if (data.jobId) {
    await updateCollectionJob(data.jobId, {
      status: "failed",
      stage: "failed",
      errorMessage: reason,
      completedAt: new Date().toISOString(),
    }).catch((error) => console.error("[ADSPY_ABANDON_JOB_FAILED]", error));
  }
}
