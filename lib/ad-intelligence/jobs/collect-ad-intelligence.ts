import "server-only";

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
/**
 * Where Meta ads come from:
 *  - "scrapecreators" / "searchapi": paid APIs, run on Vercel, no browser
 *  - "playwright": our own collector on the worker PC/VPS
 * ADSPY_COLLECTOR=searchapi moves collection to Vercel (API mode). The API is
 * ADSPY_META_SOURCE when set, else whichever API key is configured
 * (ScrapeCreators first: cheaper, prepaid credits).
 */
export type MetaSourceName = "scrapecreators" | "searchapi" | "playwright";
export function metaSource(): MetaSourceName {
  const forced = process.env.ADSPY_META_SOURCE?.trim().toLowerCase();
  if (forced === "scrapecreators" || forced === "searchapi" || forced === "playwright") return forced;
  if (process.env.ADSPY_COLLECTOR !== "searchapi") return "playwright";
  if (process.env.SCRAPECREATORS_API_KEY?.trim()) return "scrapecreators";
  return "searchapi";
}
function isApiSource(source: MetaSourceName): boolean {
  return source === "scrapecreators" || source === "searchapi";
}
/** API sources: pages per run and per brand in total (~14 ads per page). */
const PER_RUN_PAGES = Number(process.env.META_API_PAGES_PER_RUN) || 30;
const TOTAL_PAGES = Number(process.env.META_API_MAX_TOTAL_PAGES) || 100;
/** One SearchApi collection gets this long (the drain route runs up to 300 s). */
const SEARCHAPI_JOB_BUDGET_MS = Number(process.env.SEARCHAPI_JOB_BUDGET_MS) || 150_000;
/** Lease must cover one invocation, not 5 of them. */
const LEASE_SECONDS =
  isApiSource(metaSource())
    ? Math.ceil(SEARCHAPI_JOB_BUDGET_MS / 1000) + 90
    : IS_SERVERLESS
      ? 90
      : Math.ceil(WORKER_BUDGET_MS / 1000) + 120;

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
  /** API sources: page token to continue a big brand where the last run stopped. */
  apiCursor?: string | null;
  apiPagesSoFar?: number;
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

/** Ad archive ids we already hold for a page (for the incremental stop). */
async function knownAdIds(pageId: string): Promise<(id: string) => boolean> {
  const { createGlobalServiceClient } = await import("@/lib/ad-intelligence/global/supabase");
  const known = new Set<string>();
  const { data } = await createGlobalServiceClient()
    .from("ad_intelligence_creatives")
    .select("external_ad_key")
    .eq("platform", "meta")
    .eq("advertiser_id", pageId)
    .limit(5000);
  for (const row of (data ?? []) as Array<{ external_ad_key: string | null }>) {
    const key = String(row.external_ad_key ?? "");
    if (key.startsWith("meta:")) known.add(key.slice(5));
  }
  return (id) => known.has(id);
}

export async function collectAdIntelligence(
  data: CollectionEvent,
  options: { deadlineAt?: number } = {},
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
  // Billed SearchApi calls for this collection (cost tracking).
  let searchApiCalls = 0;
  let continuation: { cursor: string; pagesSoFar: number; pageId: string | null } | null = null;

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

    // No static provider import here: it would load Playwright on Vercel API routes.
    if (!["meta", "google", "linkedin"].includes(data.platform)) {
      throw new Error(
        `No provider configured for ${data.platform}.`,
      );
    }

    if (data.platform === "meta" && isApiSource(metaSource())) {
      const provider = metaSource();
      const api =
        provider === "scrapecreators"
          ? await import("@/lib/ad-intelligence/sources/scrapecreators-meta").then((m) => ({
              collect: m.collectMetaAdsViaScrapeCreators,
              resolve: m.resolvePageViaScrapeCreators,
            }))
          : await import("@/lib/ad-intelligence/sources/searchapi-meta").then((m) => ({
              collect: m.collectMetaAdsViaSearchApi,
              resolve: m.resolvePageViaSearchApi,
            }));

      // Brand name -> one exact Meta page (1 call). Ambiguous names stay a
      // name search, filtered to advertisers carrying that name.
      if (data.mode === "advertiser" && !scrapePageId) {
        const page = await api.resolve(data.query, data.country).catch(() => null);
        if (page) {
          scrapePageId = page.pageId;
          resolvedPageId = page.pageId;
        }
      }

      const deadlineAt = Math.min(options.deadlineAt ?? Number.POSITIVE_INFINITY, Date.now() + SEARCHAPI_JOB_BUDGET_MS);
      const pagesSoFar = Number(data.apiPagesSoFar ?? 0);
      const outcome = await api.collect(
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId: scrapePageId,
          activeStatus: phase === "deep" ? "all" : "active",
          deadlineAt,
          startToken: data.apiCursor ?? null,
          maxPages: Math.max(1, Math.min(PER_RUN_PAGES, TOTAL_PAGES - pagesSoFar)),
          // Quick refresh: stop once pages bring nothing new (saves credits).
          ...(phase === "quick" && scrapePageId ? { isKnown: await knownAdIds(scrapePageId), stopAfterKnownPages: 2 } : {}),
        },
        async (batch) => {
          await persist(batch);
        },
      );
      searchApiCalls = outcome.calls;
      // Big brand, time or page budget used up: continue in a fresh run.
      if (
        phase === "deep" &&
        outcome.nextToken &&
        (outcome.stoppedBy === "deadline" || outcome.stoppedBy === "max_pages") &&
        pagesSoFar + outcome.calls < TOTAL_PAGES
      ) {
        continuation = { cursor: outcome.nextToken, pagesSoFar: pagesSoFar + outcome.calls, pageId: scrapePageId };
      }
      console.info("[AdSpy collect] API source", {
        provider,
        query: data.query,
        pageId: scrapePageId,
        calls: outcome.calls,
        ads: outcome.ads,
        metaTotal: outcome.totalResults,
        stoppedBy: outcome.stoppedBy,
        ms: outcome.ms,
      });

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
    } else if (data.platform === "meta") {
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
        source: data.platform === "meta" ? metaSource() : null,
        searchApiCalls,
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
        // A continuation follows: keep the job "collecting" so open pages keep polling.
        status: continuation ? "deep" : "exhausted",
        stage: continuation ? "deep" : "exhausted",
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
        completedAt: continuation ? null : new Date().toISOString(),
        errorMessage: null,
      },
    );

    await refreshAdvertiserSummaries(data.platform, data.country, touchedAdvertisers);

    if (continuation) {
      // Queue the next slice on the same run; the drain picks it up next.
      const { enqueueAdSpyRequest } = await import("@/lib/ad-intelligence/durable-run");
      const { requestId: _done, ...rest } = data;
      await enqueueAdSpyRequest({
        runId: data.runId,
        uniqueKey: `cont:${continuation.pagesSoFar}:${Date.now()}`,
        requestType: "deep",
        payload: { ...rest, advertiserPageId: continuation.pageId ?? rest.advertiserPageId ?? null, apiCursor: continuation.cursor, apiPagesSoFar: continuation.pagesSoFar },
        priority: 90,
        maxAttempts: 2,
      });
      const { kickAdSpyDrain } = await import("./drain");
      kickAdSpyDrain();
    }

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
