import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import type {
  AdSearchInput,
  AdSearchMode,
} from "@/lib/ad-intelligence/provider";

import {
  adProviders,
} from "@/lib/ad-intelligence/providers";

import type {
  AdPlatform,
} from "@/lib/ad-intelligence/types";

import {
  enrichAds,
  buildAdSearchSummary,
} from "@/lib/ad-intelligence/intelligence";

import {
  getLatestAdSpySnapshot,
  saveAdSpySnapshot,

  getFreshSharedAdSpyCache,
  ensureSharedAdSpyCache,
  claimSharedAdSpyJob,
  completeSharedAdSpyJob,
  failSharedAdSpyJob,

  type AdSpyPlatform,
  type AdSpySearchMode,
  type SharedAdSpyCache,
} from "@/lib/ad-intelligence/adspy-store";

import type {
  EnrichedCompetitorAd,
  AdSearchSummary,
} from "@/lib/ad-intelligence/intelligence";

/* =========================================================
 * ROUTE CONFIG
 * ======================================================= */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
 * CACHE POLICY
 * ======================================================= */

/*
 * Shared AdSpy intelligence is reusable for 5 minutes.
 *
 * User-specific snapshots remain available for history.
 */
const SHARED_CACHE_MAX_AGE_MINUTES = 5;

/*
 * When another request already owns the scrape job,
 * wait for the shared result for a bounded amount of time.
 *
 * This prevents a second user from starting another scraper.
 *
 * Important:
 * This is a transitional synchronous bridge.
 * Later we should move the UI to a true async search-job model.
 */
const SHARED_JOB_WAIT_TIMEOUT_MS =
  20_000;

const SHARED_JOB_POLL_INTERVAL_MS =
  1_000;

/*
 * Do not let a failed provider execution become
 * a valid shared result containing zero ads.
 */
const EMPTY_PROVIDER_RESULT_IS_FAILURE =
  true;

/* =========================================================
 * TYPES
 * ======================================================= */

type SnapshotCacheResult = {
  ads: EnrichedCompetitorAd[];
  summary: AdSearchSummary | null;
  createdAt: string;
  ageMs: number;
};

type SearchResponseOptions = {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;

  ads: EnrichedCompetitorAd[];

  summary: AdSearchSummary;

  page: number;
  limit: number;

  cacheHit: boolean;
  stale: boolean;
  cacheAgeMs: number;

  fetchedAt: string;

  scrapeDurationMs?: number;
  analysisDurationMs?: number;
  totalDurationMs?: number;

  sharedCacheKey?: string;
};

/* =========================================================
 * NORMALIZATION HELPERS
 * ======================================================= */

function normalizeStoredAds(
  value: unknown,
): EnrichedCompetitorAd[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as EnrichedCompetitorAd[];
}

function normalizeStoredSummary(
  value: unknown,
): AdSearchSummary | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  return value as AdSearchSummary;
}

/* =========================================================
 * DATE HELPERS
 * ======================================================= */

function getSnapshotAgeMs(
  createdAt: string,
): number {
  const timestamp =
    new Date(
      createdAt,
    ).getTime();

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const age =
    Date.now() -
    timestamp;

  /*
   * Never treat a future timestamp as fresh.
   */
  if (age < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return age;
}

function isFreshSnapshot(
  createdAt: string,
): boolean {
  return (
    getSnapshotAgeMs(
      createdAt,
    ) <=
    SHARED_CACHE_MAX_AGE_MINUTES *
      60 *
      1000
  );
}

/* =========================================================
 * PAGINATION
 * ======================================================= */

function paginateAds(
  ads: EnrichedCompetitorAd[],
  page: number,
  limit: number,
) {
  const total =
    ads.length;

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(
          total / limit,
        );

  const safePage =
    totalPages === 0
      ? 1
      : Math.min(
          page,
          totalPages,
        );

  const startIndex =
    (safePage - 1) *
    limit;

  const endIndex =
    startIndex +
    limit;

  const paginatedAds =
    ads.slice(
      startIndex,
      endIndex,
    );

  const hasNextPage =
    safePage <
    totalPages;

  const hasPreviousPage =
    safePage > 1;

  const nextPage =
    hasNextPage
      ? safePage + 1
      : null;

  const previousPage =
    hasPreviousPage
      ? safePage - 1
      : null;

  return {
    paginatedAds,

    total,

    totalPages,

    safePage,

    hasNextPage,

    hasPreviousPage,

    nextPage,

    previousPage,
  };
}

/* =========================================================
 * PLATFORM HELPERS
 * ======================================================= */

function isAdSpyPlatform(
  value: string,
): value is AdSpyPlatform {
  return (
    value === "meta" ||
    value === "google" ||
    value === "linkedin"
  );
}

function normalizeMode(
  value: string | null,
): AdSearchMode {
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

/* =========================================================
 * SHARED JOB WAITING
 * ======================================================= */

/**
 * When User A is already scraping BEARDO and User B
 * arrives a moment later, User B waits for the shared
 * result instead of starting another Meta scrape.
 */
async function waitForSharedJob(
  input: {
    query: string;
    country: string;
    platform: AdSpyPlatform;
    mode: AdSearchMode;
  },
): Promise<SharedAdSpyCache | null> {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    SHARED_JOB_WAIT_TIMEOUT_MS
  ) {
    const sharedCache =
      await getFreshSharedAdSpyCache({
        query:
          input.query,

        country:
          input.country,

        platform:
          input.platform,

        mode:
          input.mode,

        maxAgeMinutes:
          SHARED_CACHE_MAX_AGE_MINUTES,
      });

    if (sharedCache) {
      return sharedCache;
    }

    /*
     * If the job has failed, stop immediately.
     *
     * We deliberately fetch the raw cache to distinguish
     * running from failed.
     */
    const current =
      await ensureSharedAdSpyCache({
        query:
          input.query,

        country:
          input.country,

        platform:
          input.platform,

        mode:
          input.mode,
      });

    if (
      current.status ===
      "failed"
    ) {
      return null;
    }

    /*
     * If nobody is running it anymore and it is not ready,
     * return so the caller can attempt to claim it.
     */
    if (
      current.status !==
      "running"
    ) {
      return null;
    }

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          SHARED_JOB_POLL_INTERVAL_MS,
        ),
    );
  }

  return null;
}

/* =========================================================
 * SAVE USER SNAPSHOT SAFELY
 * ======================================================= */

async function persistUserSnapshotSafely(
  input: {
    userId: string;
    query: string;
    country: string;
    platform: AdSpyPlatform;
    ads: EnrichedCompetitorAd[];
    intelligence: AdSearchSummary;
  },
): Promise<void> {
  /*
   * Never write empty results produced by a failed provider.
   */
  if (
    EMPTY_PROVIDER_RESULT_IS_FAILURE &&
    input.ads.length === 0
  ) {
    console.warn(
      "[AdIntelligenceSearch] Skipping user snapshot save for empty result.",
      {
        query:
          input.query,
        country:
          input.country,
        platform:
          input.platform,
      },
    );

    return;
  }

  try {
    await saveAdSpySnapshot({
      userId:
        input.userId,

      query:
        input.query,

      country:
        input.country,

      platform:
        input.platform,

      ads:
        input.ads,

      intelligence:
        input.intelligence,
    });

    console.info(
      "[AdIntelligenceSearch] Saved user AdSpy snapshot:",
      {
        userId:
          input.userId,

        query:
          input.query,

        ads:
          input.ads.length,
      },
    );
  } catch (error) {
    /*
     * User snapshot failure must not destroy the actual
     * shared AdSpy result.
     */
    console.error(
      "[AdIntelligenceSearch] Failed to persist user snapshot:",
      error,
    );
  }
}

/* =========================================================
 * RESPONSE BUILDER
 * ======================================================= */

function buildSearchResponse(
  options: SearchResponseOptions,
): NextResponse {
  const pagination =
    paginateAds(
      options.ads,
      options.page,
      options.limit,
    );

  return NextResponse.json(
    {
      success: true,

      query:
        options.query,

      country:
        options.country,

      platform:
        options.platform,

      mode:
        options.mode,

      count:
        pagination
          .paginatedAds
          .length,

      pagination: {
        page:
          pagination.safePage,

        limit:
          options.limit,

        total:
          pagination.total,

        totalPages:
          pagination.totalPages,

        hasNextPage:
          pagination.hasNextPage,

        hasPreviousPage:
          pagination.hasPreviousPage,

        nextPage:
          pagination.nextPage,

        previousPage:
          pagination.previousPage,
      },

      /*
       * Summary is for the COMPLETE dataset,
       * not only the current page.
       */
      summary:
        options.summary,

      /*
       * Existing frontend continues to render the
       * requested page only.
       */
      ads:
        pagination
          .paginatedAds,

      meta: {
        cacheHit:
          options.cacheHit,

        stale:
          options.stale,

        cacheAgeMs:
          options.cacheAgeMs,

        fetchedAt:
          options.fetchedAt,

        scrapeDurationMs:
          options.scrapeDurationMs ??
          0,

        analysisDurationMs:
          options.analysisDurationMs ??
          0,

        totalDurationMs:
          options.totalDurationMs ??
          0,

        sharedCacheKey:
          options.sharedCacheKey ??
          null,
      },
    },
    {
      status: 200,
    },
  );
}

/* =========================================================
 * GET /api/ad-intelligence/search
 * ======================================================= */

export async function GET(
  request: NextRequest,
) {
  const requestStartedAt =
    Date.now();

  try {
    /* -----------------------------------------------------
     * 1. AUTHENTICATION
     * --------------------------------------------------- */

    const authClient =
      await createServerAuthClient();

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await authClient.auth.getUser();

    if (
      userError ||
      !user
    ) {
      console.warn(
        "[AdIntelligenceSearch] Unauthorized request.",
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unauthorized",

          message:
            "You must be signed in to use AdSpy.",
        },
        {
          status:
            401,
        },
      );
    }

    /* -----------------------------------------------------
     * 2. SEARCH PARAMS
     * --------------------------------------------------- */

    const searchParams =
      request.nextUrl
        .searchParams;

    const query =
      (
        searchParams.get("q") ??
        ""
      ).trim();

    if (!query) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Missing required query parameter: q",
        },
        {
          status:
            400,
        },
      );
    }

    const country =
      (
        searchParams.get(
          "country",
        ) ??
        "IN"
      )
        .trim()
        .toUpperCase();

    const platformValue =
      (
        searchParams.get(
          "platform",
        ) ??
        "meta"
      )
        .trim()
        .toLowerCase();

    if (
      !isAdSpyPlatform(
        platformValue,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Unsupported platform: ${platformValue}`,

          supportedPlatforms: [
            "meta",
            "google",
            "linkedin",
          ],
        },
        {
          status:
            400,
        },
      );
    }

    const platform =
      platformValue;

    const mode =
      normalizeMode(
        searchParams.get(
          "mode",
        ),
      );

    /* -----------------------------------------------------
     * 3. PAGINATION
     * --------------------------------------------------- */

    const rawPage =
      Number(
        searchParams.get(
          "page",
        ) ??
        "1",
      );

    const page =
      Number.isFinite(
        rawPage,
      ) &&
      rawPage >= 1
        ? Math.floor(
            rawPage,
          )
        : 1;

    const rawLimit =
      Number(
        searchParams.get(
          "limit",
        ) ??
        "20",
      );

    const limit =
      Number.isFinite(
        rawLimit,
      ) &&
      rawLimit >= 1
        ? Math.min(
            Math.floor(
              rawLimit,
            ),
            100,
          )
        : 20;

    console.info(
      "[AdIntelligenceSearch] Search request:",
      {
        userId:
          user.id,

        query,

        country,

        platform,

        mode,

        page,

        limit,
      },
    );

    /* -----------------------------------------------------
     * 4. SHARED CACHE FAST PATH
     *
     * This is the key multi-user change.
     *
     * User A may have generated this result.
     * User B can now reuse it.
     * User C can reuse it.
     * User D can reuse it.
     * --------------------------------------------------- */

    try {
      const sharedCache =
        await getFreshSharedAdSpyCache({
          query,

          country,

          platform,

          mode,

          maxAgeMinutes:
            SHARED_CACHE_MAX_AGE_MINUTES,
        });

      if (sharedCache) {
        const sharedAds =
          normalizeStoredAds(
            sharedCache.ads,
          );

        const sharedSummary =
          normalizeStoredSummary(
            sharedCache.intelligence,
          ) ??
          buildAdSearchSummary(
            sharedAds,
          );

        const ageMs =
          getSnapshotAgeMs(
            sharedCache.updatedAt,
          );

        console.info(
          "[AdIntelligenceSearch] Shared cache HIT:",
          {
            query,

            country,

            platform,

            ads:
              sharedAds.length,

            ageMs,

            cacheKey:
              sharedCache.cacheKey,
          },
        );

        /*
         * Preserve user-specific history on page 1 only.
         * This avoids generating one history record per pagination request.
         */
        if (
          page === 1 &&
          sharedAds.length > 0
        ) {
          await persistUserSnapshotSafely({
            userId:
              user.id,

            query,

            country,

            platform,

            ads:
              sharedAds,

            intelligence:
              sharedSummary,
          });
        }

        return buildSearchResponse({
          query,

          country,

          platform,

          mode,

          ads:
            sharedAds,

          summary:
            sharedSummary,

          page,

          limit,

          cacheHit:
            true,

          stale:
            false,

          cacheAgeMs:
            ageMs,

          fetchedAt:
            sharedCache.updatedAt,

          totalDurationMs:
            Date.now() -
            requestStartedAt,

          sharedCacheKey:
            sharedCache.cacheKey,
        });
      }
    } catch (sharedCacheError) {
      /*
       * Shared-cache problems should not make AdSpy unusable.
       *
       * We can still fall back to the provider.
       */
      console.warn(
        "[AdIntelligenceSearch] Shared cache lookup failed. Falling back:",
        sharedCacheError,
      );
    }

    /* -----------------------------------------------------
     * 5. USER-SPECIFIC SNAPSHOT FALLBACK
     *
     * Existing history/cache behavior remains.
     * This protects backward compatibility.
     * --------------------------------------------------- */

    try {
      console.info(
        "[AdIntelligenceSearch] Checking user snapshot:",
        {
          userId:
            user.id,

          query,

          country,

          platform,
        },
      );

      const latestSnapshot =
        await getLatestAdSpySnapshot({
          userId:
            user.id,

          query,

          country,

          platform,
        });

      if (
        latestSnapshot &&
        isFreshSnapshot(
          latestSnapshot.createdAt,
        )
      ) {
        const cachedAds =
          normalizeStoredAds(
            latestSnapshot.ads,
          );

        const cachedSummary =
          normalizeStoredSummary(
            latestSnapshot.intelligence,
          );

        /*
         * Only treat a non-empty snapshot as a
         * successful cache hit.
         */
        if (
          cachedAds.length > 0
        ) {
          const ageMs =
            getSnapshotAgeMs(
              latestSnapshot.createdAt,
            );

          console.info(
            "[AdIntelligenceSearch] User snapshot HIT:",
            {
              query,

              userId:
                user.id,

              ads:
                cachedAds.length,

              ageMs,
            },
          );

          return buildSearchResponse({
            query,

            country,

            platform,

            mode,

            ads:
              cachedAds,

            summary:
              cachedSummary ??
              buildAdSearchSummary(
                cachedAds,
              ),

            page,

            limit,

            cacheHit:
              true,

            stale:
              false,

            cacheAgeMs:
              ageMs,

            fetchedAt:
              latestSnapshot.createdAt,

            totalDurationMs:
              Date.now() -
              requestStartedAt,
          });
        }
      }
    } catch (snapshotError) {
      console.warn(
        "[AdIntelligenceSearch] User snapshot lookup failed. Continuing:",
        snapshotError,
      );
    }

    /* -----------------------------------------------------
     * 6. PROVIDER VALIDATION
     * --------------------------------------------------- */

    const provider =
      adProviders[
        platform
      ];

    if (!provider) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `${platform} provider is not available.`,
        },
        {
          status:
            500,
        },
      );
    }

    /* -----------------------------------------------------
     * 7. SHARED CACHE RECORD
     * --------------------------------------------------- */

    let sharedCache:
      SharedAdSpyCache;

    try {
      sharedCache =
        await ensureSharedAdSpyCache({
          query,

          country,

          platform,

          mode,
        });
    } catch (error) {
      console.error(
        "[AdIntelligenceSearch] Failed to initialize shared cache:",
        error,
      );

      /*
       * We cannot safely coordinate concurrent scraping
       * without the shared cache, so fall back to the
       * existing direct provider behavior.
       */
      sharedCache =
        null as never;
    }

    /* -----------------------------------------------------
     * 8. CLAIM SINGLE SHARED JOB
     * --------------------------------------------------- */

    let ownsSharedJob =
      false;

    let claimedLeaseUntil:
      | string
      | null =
      null;

    let sharedCacheKey =
      sharedCache?.cacheKey ??
      null;

    if (sharedCache) {
      try {
        const claim =
          await claimSharedAdSpyJob({
            query,

            country,

            platform,

            mode,
          });

        sharedCache =
          claim.cache;

        sharedCacheKey =
          claim.cache.cacheKey;

        ownsSharedJob =
          claim.claimed;

        claimedLeaseUntil =
          claim.leaseUntil;

        console.info(
          "[AdIntelligenceSearch] Shared job decision:",
          {
            query,

            cacheKey:
              sharedCache.cacheKey,

            claimed:
              claim.claimed,

            status:
              claim.cache.status,

            leaseUntil:
              claim.leaseUntil,
          },
        );
      } catch (claimError) {
        console.error(
          "[AdIntelligenceSearch] Shared job claim failed:",
          claimError,
        );

        ownsSharedJob =
          false;
      }
    }

    /* -----------------------------------------------------
     * 9. ANOTHER REQUEST OWNS THE JOB
     * --------------------------------------------------- */

    if (
      sharedCache &&
      !ownsSharedJob
    ) {
      console.info(
        "[AdIntelligenceSearch] Another request owns this search. Waiting for shared result:",
        {
          query,

          cacheKey:
            sharedCache.cacheKey,
        },
      );

      try {
        const completed =
          await waitForSharedJob({
            query,

            country,

            platform,

            mode,
          });

        if (completed) {
          const completedAds =
            normalizeStoredAds(
              completed.ads,
            );

          const completedSummary =
            normalizeStoredSummary(
              completed.intelligence,
            ) ??
            buildAdSearchSummary(
              completedAds,
            );

          if (
            completedAds.length > 0
          ) {
            const ageMs =
              getSnapshotAgeMs(
                completed.updatedAt,
              );

            /*
             * Save this user's history on the
             * first page only.
             */
            if (
              page === 1
            ) {
              await persistUserSnapshotSafely({
                userId:
                  user.id,

                query,

                country,

                platform,

                ads:
                  completedAds,

                intelligence:
                  completedSummary,
              });
            }

            return buildSearchResponse({
              query,

              country,

              platform,

              mode,

              ads:
                completedAds,

              summary:
                completedSummary,

              page,

              limit,

              cacheHit:
                true,

              stale:
                false,

              cacheAgeMs:
                ageMs,

              fetchedAt:
                completed.updatedAt,

              totalDurationMs:
                Date.now() -
                requestStartedAt,

              sharedCacheKey:
                completed.cacheKey,
            });
          }
        }

        /*
         * If waiting timed out, return a clear response
         * rather than silently starting another expensive
         * concurrent Meta scrape.
         */
        return NextResponse.json(
          {
            success:
              false,

            error:
              "AdSpy search is already running.",

            message:
              "Another search for this brand is currently collecting fresh competitor data. Please retry in a few seconds.",

            retryable:
              true,

            meta: {
              sharedJob:
                true,

              cacheKey:
                sharedCache.cacheKey,
            },
          },
          {
            status:
              409,
          },
        );
      } catch (waitError) {
        console.error(
          "[AdIntelligenceSearch] Shared job wait failed:",
          waitError,
        );

        return NextResponse.json(
          {
            success:
              false,

            error:
              "Another AdSpy search is currently running.",

            message:
              "Please retry in a few seconds.",

            retryable:
              true,
          },
          {
            status:
              409,
          },
        );
      }
    }

    /* -----------------------------------------------------
     * 10. BUILD SEARCH INPUT
     * --------------------------------------------------- */

    const searchInput:
      AdSearchInput = {
      query,

      country,

      platform,

      mode,
    };

    console.info(
      "[AdIntelligenceSearch] Starting provider:",
      {
        provider:
          platform,

        query,

        country,

        mode,

        ownsSharedJob,
      },
    );

    /* -----------------------------------------------------
     * 11. PROVIDER SEARCH
     * --------------------------------------------------- */

    const scrapeStartedAt =
      Date.now();

    let providerResult;

    try {
      providerResult =
        await provider.search(
          searchInput,
        );
    } catch (providerError) {
      /*
       * If this request owns the shared job,
       * mark that job failed so another request can
       * safely retry later.
       */
      if (
        sharedCache &&
        ownsSharedJob &&
        claimedLeaseUntil
      ) {
        try {
          await failSharedAdSpyJob({
            cacheKey:
              sharedCache.cacheKey,

            leaseUntil:
              claimedLeaseUntil,

            errorMessage:
              providerError instanceof Error
                ? providerError.message
                : "Provider search failed.",
          });
        } catch (failError) {
          console.error(
            "[AdIntelligenceSearch] Failed to mark shared job failed:",
            failError,
          );
        }
      }

      throw providerError;
    }

    const scrapeDurationMs =
      Date.now() -
      scrapeStartedAt;

    const scrapedAds =
      providerResult?.ads ??
      [];

    console.info(
      "[AdIntelligenceSearch] Provider returned:",
      {
        ads:
          scrapedAds.length,

        durationMs:
          scrapeDurationMs,

        query,

        platform,
      },
    );

    /* -----------------------------------------------------
     * 12. EMPTY PROVIDER RESULT
     * --------------------------------------------------- */

    if (
      EMPTY_PROVIDER_RESULT_IS_FAILURE &&
      scrapedAds.length === 0
    ) {
      const message =
        `Provider returned 0 ads for "${query}".`;

      /*
       * IMPORTANT:
       *
       * Do NOT save zero-result provider failures
       * as valid user/shared snapshots.
       */
      if (
        sharedCache &&
        ownsSharedJob &&
        claimedLeaseUntil
      ) {
        try {
          await failSharedAdSpyJob({
            cacheKey:
              sharedCache.cacheKey,

            leaseUntil:
              claimedLeaseUntil,

            errorMessage:
              message,
          });
        } catch (failError) {
          console.error(
            "[AdIntelligenceSearch] Failed to mark empty provider result as failed:",
            failError,
          );
        }
      }

      console.warn(
        "[AdIntelligenceSearch] Empty provider result; refusing to cache as valid data:",
        {
          query,

          platform,

          country,
        },
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "No usable ads were returned.",

          message:
            "The provider did not return usable competitor data. Please retry shortly.",

          retryable:
            true,

          meta: {
            cacheHit:
              false,

            providerEmpty:
              true,

            scrapeDurationMs,
          },
        },
        {
          status:
            502,
        },
      );
    }

    /* -----------------------------------------------------
     * 13. ENRICH / RANK
     * --------------------------------------------------- */

    const analysisStartedAt =
      Date.now();

    const enrichedAds =
      enrichAds(
        scrapedAds,
        query,
      );

    /*
     * Provider already returns the relevant ordered
     * dataset.
     */
    const rankedAds =
      [
        ...enrichedAds,
      ];

    console.info(
      "[AdIntelligenceSearch] Enriched:",
      {
        ads:
          rankedAds.length,

        query,
      },
    );

    /* -----------------------------------------------------
     * 14. BUILD INTELLIGENCE SUMMARY
     * --------------------------------------------------- */

    const summary =
      buildAdSearchSummary(
        rankedAds,
      );

    const analysisDurationMs =
      Date.now() -
      analysisStartedAt;

    /* -----------------------------------------------------
     * 15. COMPLETE SHARED CACHE
     * --------------------------------------------------- */

    if (
      sharedCache &&
      ownsSharedJob &&
      claimedLeaseUntil
    ) {
      try {
        const completed =
          await completeSharedAdSpyJob({
            cacheKey:
              sharedCache.cacheKey,

            leaseUntil:
              claimedLeaseUntil,

            ads:
              rankedAds,

            intelligence:
              summary,
          });

        sharedCache =
          completed;

        console.info(
          "[AdIntelligenceSearch] Shared AdSpy cache completed:",
          {
            cacheKey:
              completed.cacheKey,

            ads:
              rankedAds.length,
          },
        );
      } catch (sharedCompleteError) {
        /*
         * Do not destroy an otherwise valid result because
         * cache persistence failed.
         */
        console.error(
          "[AdIntelligenceSearch] Failed to complete shared cache:",
          sharedCompleteError,
        );
      }
    }

    /* -----------------------------------------------------
     * 16. USER SNAPSHOT
     * --------------------------------------------------- */

    /*
     * Save only page 1 as user history.
     *
     * Pagination requests should not create duplicate snapshots.
     */
    if (
      page === 1
    ) {
      await persistUserSnapshotSafely({
        userId:
          user.id,

        query,

        country,

        platform,

        ads:
          rankedAds,

        intelligence:
          summary,
      });
    }

    /* -----------------------------------------------------
     * 17. PAGINATION
     * --------------------------------------------------- */

    const pagination =
      paginateAds(
        rankedAds,
        page,
        limit,
      );

    /* -----------------------------------------------------
     * 18. RESPONSE
     * --------------------------------------------------- */

    const totalDurationMs =
      Date.now() -
      requestStartedAt;

    console.info(
      "[AdIntelligenceSearch] Completed search:",
      {
        query,

        country,

        platform,

        totalAds:
          rankedAds.length,

        page:

          pagination.safePage,

        pageSize:
          pagination
            .paginatedAds
            .length,

        scrapeDurationMs,

        analysisDurationMs,

        totalDurationMs,
      },
    );

    return buildSearchResponse({
      query,

      country,

      platform,

      mode,

      ads:
        rankedAds,

      summary,

      page,

      limit,

      cacheHit:
        false,

      stale:
        false,

      cacheAgeMs:
        0,

      fetchedAt:
        new Date().toISOString(),

      scrapeDurationMs,

      analysisDurationMs,

      totalDurationMs,

      sharedCacheKey:
        sharedCacheKey ??
        undefined,
    });
  } catch (
    error: unknown
  ) {
    let message =
      "Unknown error";

    if (
      error instanceof Error
    ) {
      message =
        error.message;
    } else if (
      typeof error ===
      "string"
    ) {
      message =
        error;
    } else {
      try {
        message =
          JSON.stringify(
            error,
          );
      } catch {
        message =
          "Unknown error";
      }
    }

    console.error(
      "[AdIntelligenceSearch] Search failed:",
      {
        message,

        stack:
          error instanceof Error
            ? error.stack
            : undefined,
      },
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Failed to search ad intelligence.",

        message,

        retryable:
          true,
      },
      {
        status:
          500,
      },
    );
  }
}