import "server-only";

import type { MetaScrapeOutcome } from "@/lib/ad-intelligence/providers/deep-meta";
import { markStoppedAds } from "@/lib/ad-intelligence/global/mark-stopped";
import { dailyCreditCap, pagesAllowed, quickPages } from "@/lib/ad-intelligence/credit-guard";

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
/**
 * Heartbeat refreshes adspy_runs.heartbeat_at and the request lease
 * (adspy_requests.locked_at). 60 s keeps well inside every window that reads
 * them: the claim lease (LEASE_SECONDS, at least 90 s), the 300 s reaper lease
 * and the 3 min run-stale window (lib/ad-intelligence/jobs/stale-run.ts).
 */
const HEARTBEAT_MS = 60_000;
/** Progress (counts) is written at most this often, or every N chunks. */
const PROGRESS_EVERY_MS = 30_000;
const PROGRESS_EVERY_CHUNKS = 10;

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
// Vercel (60-300 s functions): at most 2 min per slice. A long-running
// worker (GitHub Actions) may read a whole brand in one go.
const SEARCHAPI_JOB_BUDGET_MS = Math.min(
  Number(process.env.SEARCHAPI_JOB_BUDGET_MS) || 100_000,
  process.env.VERCEL ? 120_000 : 15 * 60_000,
);
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
  /** When the first slice of a chained API scan started (for marking stopped ads). */
  apiScanStartedAt?: string | null;
};

type State = {
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
};

export type CollectionResult = State & {
  jobId: string;
  pageId?: string | null;
  /** False when another worker held the request: nothing was collected here. */
  claimed: boolean;
  /**
   * Browser scans only: did the scan reach Meta's end (>= 98% of its total)?
   * Null when not known (quick runs, API sources).
   */
  complete?: boolean | null;
  stoppedBy?: MetaScrapeOutcome["stoppedBy"] | null;
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

async function refreshAdvertiserSummaries(platform: string, country: string, pageIds: Set<string>, deadlineAt?: number): Promise<void> {
  // Best effort per page: a failed refresh must never fail the collection.
  // Search no longer writes summaries (adspy_search_facets is read-only since
  // Pack C), so EVERY page this run touched is refreshed here, not just 25.
  // The Today cache of each page is dropped too, so its 6-hour TTL never
  // hides the ads just saved.
  const { createGlobalServiceClient } = await import("@/lib/ad-intelligence/global/supabase");
  const { forgetBrand } = await import("@/lib/today/cache");
  const client = createGlobalServiceClient();
  const all = Array.from(pageIds);
  for (let i = 0; i < all.length; i += 1) {
    const pageId = all[i];
    // Only a hard function deadline (Vercel) stops the loop; facets for a page
    // whose summary is missing are still computed (read-only) at search time.
    if (deadlineAt && Date.now() > deadlineAt) {
      console.warn("[AdSpy collect] summary refresh stopped at deadline", { refreshed: i, skipped: all.length - i });
      break;
    }
    try {
      const { error } = await client.rpc("adspy_refresh_advertiser_summary", {
        p_platform: platform,
        p_page_id: pageId,
        p_country: country,
      });
      if (error) {
        console.warn("[AdSpy collect] summary refresh failed", { pageId, error: error.message });
      }
    } catch (error) {
      console.warn("[AdSpy collect] summary refresh failed", { pageId, error: error instanceof Error ? error.message : error });
    }
    await forgetBrand(pageId).catch(() => undefined);
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
): Promise<CollectionResult> {
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
      claimed: false,
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
  let continuation: { cursor: string; pagesSoFar: number; pageId: string | null; scanStartedAt: string } | null = null;
  // Browser scan outcome (null = not a browser scan or not known).
  let scanComplete: boolean | null = null;
  let scanStoppedBy: MetaScrapeOutcome["stoppedBy"] | null = null;

  /*
   * Progress writes (job row + run row) are throttled: at most every 30 s or
   * every 10 chunks. They used to be 2 row updates per 25-ad chunk. The
   * completion / failure paths below always write the final counts, so
   * nothing is lost. A failed progress write never fails the brand.
   */
  // 0: the first chunk is written at once, so open pages see ads arriving.
  let lastProgressAt = 0;
  let chunksSinceProgress = 0;
  const writeProgress = async (force = false): Promise<void> => {
    chunksSinceProgress += 1;
    if (!force && chunksSinceProgress < PROGRESS_EVERY_CHUNKS && Date.now() - lastProgressAt < PROGRESS_EVERY_MS) return;
    chunksSinceProgress = 0;
    lastProgressAt = Date.now();
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
    } catch (error) {
      console.warn("[AdSpy collect] progress write skipped", error instanceof Error ? error.message : error);
    }
  };

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

      const chunkStarted = Date.now();
      const result = await processAdChunk({
        ads: chunk,
      });
      const chunkMs = Date.now() - chunkStarted;
      if (chunkMs > 20_000) {
        console.warn("[AdSpy persist] slow save", { ads: chunk.length, seconds: Math.round(chunkMs / 1000) });
        // Worker only: the database is struggling (Disk IO budget). Pause as
        // long as the save took (max 60 s) so it can recover, instead of
        // pushing it into timeouts.
        if (!IS_SERVERLESS) await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, chunkMs)));
      }

      state.normalizedAds += chunk.length;
      state.persistedAds += Number(
        result.insertedOrUpdated ?? 0,
      );

      await writeProgress();
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

      // Credit guard: quick = Meta's first pages only; never past the day's budget.
      const { apiCreditsUsedToday } = await import("@/lib/ad-intelligence/credit-guard-server");
      const creditsUsedToday = await apiCreditsUsedToday();
      const maxPages = pagesAllowed({
        phase,
        perRunPages: PER_RUN_PAGES,
        totalPagesLeft: TOTAL_PAGES - Number(data.apiPagesSoFar ?? 0),
        creditsUsedToday,
        dailyCap: dailyCreditCap(),
        quickPages: quickPages(),
      });

      // Brand name -> one exact Meta page (1 call). Ambiguous names stay a
      // name search, filtered to advertisers carrying that name.
      let resolveCalls = 0;
      if (data.mode === "advertiser" && !scrapePageId && maxPages > 0) {
        resolveCalls = 1;
        const page = await api.resolve(data.query, data.country).catch(() => null);
        if (page) {
          scrapePageId = page.pageId;
          resolvedPageId = page.pageId;
        }
      }

      const deadlineAt = Math.min(options.deadlineAt ?? Number.POSITIVE_INFINITY, Date.now() + SEARCHAPI_JOB_BUDGET_MS);
      const pagesSoFar = Number(data.apiPagesSoFar ?? 0);

      const apiScanStartedAt = data.apiScanStartedAt ?? new Date().toISOString();
      // Live ads only (as the browser path); stopped ads are marked below.
      const apiActiveStatus = phase === "deep" && process.env.ADSPY_DEEP_STATUS === "all" ? "all" : "active";
      if (maxPages <= 0) console.info("[AdSpy credits] daily budget used; skipping paid fetch", { query: data.query, creditsUsedToday });
      const outcome = maxPages <= 0
        ? { calls: 0, ads: 0, totalResults: null, stoppedBy: "max_pages" as const, ms: 0, nextToken: null }
        : await api.collect(
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId: scrapePageId,
          activeStatus: apiActiveStatus,
          deadlineAt,
          startToken: data.apiCursor ?? null,
          maxPages,
          // Quick refresh: stop once pages bring nothing new (saves credits).
          ...(phase === "quick" && scrapePageId ? { isKnown: await knownAdIds(scrapePageId), stopAfterKnownPages: 2 } : {}),
        },
        async (batch) => {
          await persist(batch);
        },
      );
      searchApiCalls = outcome.calls + resolveCalls;
      // Big brand, time or page budget used up: continue in a fresh run.
      if (
        phase === "deep" &&
        outcome.nextToken &&
        (outcome.stoppedBy === "deadline" || outcome.stoppedBy === "max_pages") &&
        pagesSoFar + outcome.calls < TOTAL_PAGES
      ) {
        continuation = { cursor: outcome.nextToken, pagesSoFar: pagesSoFar + outcome.calls, pageId: scrapePageId, scanStartedAt: apiScanStartedAt };
      }

      // Read the page's whole live list (this slice or a chain of them):
      // whatever of this page is still flagged live but was not seen has stopped.
      if (
        phase === "deep" &&
        apiActiveStatus === "active" &&
        scrapePageId &&
        data.mode === "advertiser" &&
        outcome.stoppedBy === "exhausted"
      ) {
        try {
          const marked = await markStoppedAds({ pageId: scrapePageId, platform: data.platform, scanStartedAt: apiScanStartedAt });
          if (marked.stopped > 0) touchedAdvertisers.add(scrapePageId);
          console.info("[AdSpy collect] live scan complete", { provider, pageId: scrapePageId, metaTotal: outcome.totalResults, ...marked });
        } catch (error) {
          console.warn("[AdSpy collect] mark stopped failed", error instanceof Error ? error.message : error);
        }
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

      const scanStartedAt = new Date().toISOString();
      let outcome: MetaScrapeOutcome | null = null;
      await collectMetaAdsInBatches(
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId: scrapePageId,
          // The caller's deadline (nightly run: time left tonight) wins over
          // the per-brand budget when it is earlier.
          deadlineAt: Math.min(
            options.deadlineAt ?? Number.POSITIVE_INFINITY,
            Date.now() + (IS_SERVERLESS ? SERVERLESS_BUDGET_MS : WORKER_BUDGET_MS),
          ),
        },
        async (batch) => {
          await persist(batch);
        },
        (o) => {
          outcome = o;
        },
      );

      // A complete live-only scan of one page (>= 98% of Meta's total):
      // anything of that page still flagged live but not seen in this scan
      // gets a strike; the second miss in a row marks it stopped.
      const scan = outcome as MetaScrapeOutcome | null;
      if (scan && phase === "deep") {
        scanComplete = scan.complete;
        scanStoppedBy = scan.stoppedBy;
      }
      if (scan && scrapePageId && data.mode === "advertiser" && scan.activeOnly && scan.complete) {
        try {
          const marked = await markStoppedAds({ pageId: scrapePageId, platform: data.platform, scanStartedAt });
          if (marked.stopped > 0) touchedAdvertisers.add(scrapePageId);
          console.info("[AdSpy collect] live scan complete", {
            pageId: scrapePageId,
            seen: scan.collected,
            metaTotal: scan.metaTotal,
            ...marked,
          });
        } catch (error) {
          console.warn("[AdSpy collect] mark stopped failed", error instanceof Error ? error.message : error);
        }
      } else if (scan && scrapePageId && data.mode === "advertiser" && phase === "deep") {
        console.info("[AdSpy collect] partial scan: no ad marked stopped", {
          pageId: scrapePageId,
          collected: scan.collected,
          metaTotal: scan.metaTotal,
          hasNextPage: scan.hasNextPage,
          stoppedBy: scan.stoppedBy,
        });
      }

      // Keep Meta's own count so the app can show "Meta shows N, we have M".
      const observedTotal = metaTotalCount as number | null;
      const scope = sourceScopeFor({ mode: data.mode, query: data.query, pageId: scrapePageId });
      if (scope && observedTotal != null) {
        await recordSourceCount({
          platform: data.platform,
          country: data.country,
          scope,
          statusScope: scan?.activeOnly ? "active" : statusScopeForDepth(phase),
          metaTotal: observedTotal,
          collectedAds: state.discoveredAds,
          complete: scan ? scan.complete : null,
          stoppedBy: scan?.stoppedBy ?? null,
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

      await refreshAdvertiserSummaries(data.platform, data.country, touchedAdvertisers, options.deadlineAt);

      return {
        jobId: data.jobId,
        pageId: resolvedPageId ?? scrapePageId,
        claimed: true,
        ...state,
      };
    }
    // Continuation first, in the same breath as finishing this slice: the run
    // then never passes through a terminal state while more work is due.
    if (continuation) {
      const { enqueueAdSpyRequest } = await import("@/lib/ad-intelligence/durable-run");
      const { requestId: _done, ...rest } = data;
      await enqueueAdSpyRequest({
        runId: data.runId,
        // One continuation per slice: if this slice is retried after a crash, the
        // same row comes back instead of a duplicate (unique run_id + key).
        uniqueKey: `cont:${data.requestId}`,
        requestType: "deep",
        payload: { ...rest, advertiserPageId: continuation.pageId ?? rest.advertiserPageId ?? null, apiCursor: continuation.cursor, apiPagesSoFar: continuation.pagesSoFar, apiScanStartedAt: continuation.scanStartedAt },
        priority: 90,
        maxAttempts: 2,
      });
    }
    // A browser scan that stopped early (deadline, rate limit, < 98% of
    // Meta's total) is saved but not "completed": no completed_at, so the
    // minimum-interval checks (completed_at only) let it run again soon, and
    // tonight's oldest-first order puts it at the front next time.
    const partialScan = scanComplete === false;
    await completeAdSpyRequest({
      requestId: data.requestId,
      result: {
        phase,
        metaTotalCount,
        resolvedPageId,
        complete: scanComplete,
        stoppedBy: scanStoppedBy,
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

    if (!continuation) await finishAdSpyRun({
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
        completedAt: continuation || partialScan ? null : new Date().toISOString(),
        errorMessage: null,
      },
    );

    await refreshAdvertiserSummaries(data.platform, data.country, touchedAdvertisers, options.deadlineAt);


    if (continuation) {
      const { kickAdSpyDrain } = await import("./drain");
      kickAdSpyDrain();
    }

    // Bookkeeping only: the ads are already saved and the job is complete.
    // A failure here must never flip a successful collection to "failed".
    // A partial scan leaves the tracked brand due, so it is read again.
    if (!partialScan) try {
      await markTrackedBrandCollected({
        query: data.query,
        country: data.country,
        platform: data.platform,
      });
    } catch (markError) {
      console.warn("[AdSpy] markTrackedBrandCollected failed (collection kept):", markError instanceof Error ? markError.message : markError);
    }

    return {
      jobId: data.jobId,
      pageId: resolvedPageId ?? scrapePageId,
      claimed: true,
      complete: scanComplete,
      stoppedBy: scanStoppedBy,
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
