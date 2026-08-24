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
 * Reuse a persisted AdSpy snapshot for 5 minutes.
 *
 * This is intentionally conservative for now.
 * We can later introduce:
 *
 * - stale-while-revalidate
 * - Redis / Upstash
 * - background refresh
 *
 * without changing the frontend contract.
 */
const FRESH_SNAPSHOT_MAX_AGE_MS =
  5 * 60 * 1000;

/* =========================================================
 * STORED SNAPSHOT TYPES
 * ======================================================= */

type SnapshotCacheResult = {
  ads: EnrichedCompetitorAd[];
  summary: AdSearchSummary | null;
  createdAt: string;
  ageMs: number;
};

/* =========================================================
 * HELPERS
 * ======================================================= */

function normalizeStoredAds(
  value: unknown
): EnrichedCompetitorAd[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as EnrichedCompetitorAd[];
}

function normalizeStoredSummary(
  value: unknown
): AdSearchSummary | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  return value as AdSearchSummary;
}

function getSnapshotAgeMs(
  createdAt: string
): number {
  const timestamp =
    new Date(
      createdAt
    ).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const age =
    Date.now() -
    timestamp;

  /*
   * Never treat a future-dated snapshot
   * as fresh.
   */
  if (age < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return age;
}

function isFreshSnapshot(
  createdAt: string
): boolean {
  return (
    getSnapshotAgeMs(
      createdAt
    ) <=
    FRESH_SNAPSHOT_MAX_AGE_MS
  );
}

function paginateAds(
  ads: EnrichedCompetitorAd[],
  page: number,
  limit: number
) {
  const total =
    ads.length;

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(
          total / limit
        );

  const safePage =
    totalPages === 0
      ? 1
      : Math.min(
          page,
          totalPages
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
      endIndex
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
 * GET /api/ad-intelligence/search
 *
 * Examples:
 *
 * /api/ad-intelligence/search?q=Mamaearth
 * /api/ad-intelligence/search?q=Mamaearth&page=2
 * /api/ad-intelligence/search?q=Mamaearth&page=2&limit=20
 * /api/ad-intelligence/search?q=Mamaearth&mode=keyword
 * /api/ad-intelligence/search?q=Mamaearth&country=IN&platform=meta
 * ======================================================= */

export async function GET(
  request: NextRequest
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
        "[AdIntelligenceSearch] Unauthorized request."
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message:
            "You must be signed in to use AdSpy.",
        },
        {
          status: 401,
        }
      );
    }

    /* -----------------------------------------------------
     * 2. SEARCH PARAMS
     * --------------------------------------------------- */

    const searchParams =
      request.nextUrl
        .searchParams;

    const query =
      searchParams
        .get("q")
        ?.trim() ??
      "";

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required query parameter: q",
        },
        {
          status: 400,
        }
      );
    }

    const country =
      (
        searchParams
          .get("country")
          ?.trim() ||
        "IN"
      ).toUpperCase();

    const platform =
      (
        searchParams
          .get("platform")
          ?.trim()
          .toLowerCase() ||
        "meta"
      );

    if (
      platform !== "meta" &&
      platform !== "google" &&
      platform !== "linkedin"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Unsupported platform: ${platform}`,
          supportedPlatforms: [
            "meta",
            "google",
            "linkedin",
          ],
        },
        {
          status: 400,
        }
      );
    }

    const rawMode =
      searchParams
        .get("mode")
        ?.trim()
        .toLowerCase();

    const mode: AdSearchMode =
      rawMode === "keyword"
        ? "keyword"
        : "advertiser";

    /* -----------------------------------------------------
     * 3. PAGINATION
     * --------------------------------------------------- */

    const rawPage =
      Number(
        searchParams
          .get("page") ??
          "1"
      );

    const page =
      Number.isFinite(
        rawPage
      ) &&
      rawPage >= 1
        ? Math.floor(
            rawPage
          )
        : 1;

    const rawLimit =
      Number(
        searchParams
          .get("limit") ??
          "20"
      );

    const limit =
      Number.isFinite(
        rawLimit
      ) &&
      rawLimit >= 1
        ? Math.min(
            Math.floor(
              rawLimit
            ),
            100
          )
        : 20;

    /* -----------------------------------------------------
     * 4. FAST PATH — RECENT SNAPSHOT
     *
     * This is the first performance improvement.
     *
     * IMPORTANT:
     * We still authenticate before reading the snapshot,
     * because snapshots belong to the authenticated user.
     * --------------------------------------------------- */

    console.info(
      `[AdIntelligenceSearch] Checking recent snapshot: ${query} (${country})`
    );

    try {
      const latestSnapshot =
        await getLatestAdSpySnapshot(
          {
            userId:
              user.id,
            query,
            country,
            platform:
              platform as
                | "meta"
                | "google"
                | "linkedin",
          }
        );

      if (
        latestSnapshot &&
        isFreshSnapshot(
          latestSnapshot.createdAt
        )
      ) {
        const cachedAds =
          normalizeStoredAds(
            latestSnapshot.ads
          );

        const cachedSummary =
          normalizeStoredSummary(
            latestSnapshot
              .intelligence
          );

        /*
         * Only use the snapshot as a cache hit
         * when it actually contains a usable result.
         */
        if (
          cachedAds.length > 0
        ) {
          const ageMs =
            getSnapshotAgeMs(
              latestSnapshot.createdAt
            );

          const pagination =
            paginateAds(
              cachedAds,
              page,
              limit
            );

          console.info(
            `[AdIntelligenceSearch] Fresh snapshot hit: ${query} (${cachedAds.length} ads, ${ageMs}ms old)`
          );

          return NextResponse.json(
            {
              success: true,

              query,
              country,

              platform:
                platform as AdPlatform,

              mode,

              count:
                pagination
                  .paginatedAds
                  .length,

              pagination: {
                page:
                  pagination.safePage,

                limit,

                total:
                  pagination.total,

                totalPages:
                  pagination.totalPages,

                hasNextPage:
                  pagination
                    .hasNextPage,

                hasPreviousPage:
                  pagination
                    .hasPreviousPage,

                nextPage:
                  pagination
                    .nextPage,

                previousPage:
                  pagination
                    .previousPage,
              },

              /*
               * Existing frontend compatibility.
               */
              summary:
                cachedSummary ??
                buildAdSearchSummary(
                  cachedAds
                ),

              ads:
                pagination
                  .paginatedAds,

              /*
               * New metadata for the future loading/cache UI.
               */
              meta: {
                cacheHit: true,
                stale: false,
                cacheAgeMs:
                  ageMs,
                fetchedAt:
                  latestSnapshot.createdAt,
              },
            },
            {
              status: 200,
            }
          );
        }
      }

      console.info(
        `[AdIntelligenceSearch] No fresh usable snapshot found: ${query}`
      );
    } catch (cacheError) {
      /*
       * Cache/storage failures must NEVER prevent
       * a fresh AdSpy search.
       */
      console.warn(
        "[AdIntelligenceSearch] Snapshot lookup failed; continuing with fresh search.",
        cacheError
      );
    }

    /* -----------------------------------------------------
     * 5. PROVIDER
     * --------------------------------------------------- */

    const provider =
      adProviders[
        platform as AdPlatform
      ];

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error:
            `${platform} provider is not available.`,
        },
        {
          status: 500,
        }
      );
    }

    /* -----------------------------------------------------
     * 6. BUILD SEARCH INPUT
     * --------------------------------------------------- */

    const searchInput: AdSearchInput =
      {
        query,
        country,
        platform:
          platform as AdPlatform,
        mode,
      };

    console.info(
      `[AdIntelligenceSearch] Fresh search: ${platform}: ${query} (${country})`
    );

    /* -----------------------------------------------------
     * 7. SCRAPE PROVIDER
     * --------------------------------------------------- */

    const scrapeStartedAt =
      Date.now();

    const providerResult =
      await provider.search(
        searchInput
      );

    const scrapeDurationMs =
      Date.now() -
      scrapeStartedAt;

    const scrapedAds =
      providerResult?.ads ??
      [];

    console.info(
      `[AdIntelligenceSearch] Provider returned ${scrapedAds.length} ads in ${scrapeDurationMs}ms.`
    );

    /* -----------------------------------------------------
     * 8. ENRICH / RANK
     * --------------------------------------------------- */

    const analysisStartedAt =
      Date.now();

    const enrichedAds =
      enrichAds(
        scrapedAds,
        query
      );

    /*
     * Preserve the existing behavior:
     *
     * provider result
     *   ↓
     * enrichment
     *   ↓
     * rankedAds
     *
     * The existing provider already returns the relevant
     * ordered dataset.
     */
    const rankedAds =
      [...enrichedAds];

    console.info(
      `[AdIntelligenceSearch] Enriched ${rankedAds.length} ads.`
    );

    /* -----------------------------------------------------
     * 9. BUILD INTELLIGENCE SUMMARY
     * --------------------------------------------------- */

    const summary =
      buildAdSearchSummary(
        rankedAds
      );

    const analysisDurationMs =
      Date.now() -
      analysisStartedAt;

    /* -----------------------------------------------------
     * 10. SAVE COMPLETE SNAPSHOT
     * --------------------------------------------------- */

    try {
      await saveAdSpySnapshot(
        {
          userId:
            user.id,

          query,

          country,

          platform:
            platform as
              | "meta"
              | "google"
              | "linkedin",

          /*
           * IMPORTANT:
           * Save the complete ranked dataset.
           */
          ads:
            rankedAds,

          /*
           * Save the complete intelligence summary.
           */
          intelligence:
            summary,
        }
      );

      console.info(
        `[AdIntelligenceSearch] Saved AdSpy snapshot: ${query} (${rankedAds.length} ads)`
      );
    } catch (
      snapshotError
    ) {
      /*
       * Snapshot storage should NEVER break AdSpy.
       */
      console.error(
        "[AdIntelligenceSearch] Failed to persist AdSpy snapshot:",
        snapshotError
      );
    }

    /* -----------------------------------------------------
     * 11. PAGINATION
     * --------------------------------------------------- */

    const pagination =
      paginateAds(
        rankedAds,
        page,
        limit
      );

    /* -----------------------------------------------------
     * 12. RESPONSE
     * --------------------------------------------------- */

    const totalDurationMs =
      Date.now() -
      requestStartedAt;

    return NextResponse.json(
      {
        success: true,

        query,

        country,

        platform:
          platform as AdPlatform,

        mode,

        count:
          pagination
            .paginatedAds
            .length,

        pagination: {
          page:
            pagination.safePage,

          limit,

          total:
            pagination.total,

          totalPages:
            pagination.totalPages,

          hasNextPage:
            pagination
              .hasNextPage,

          hasPreviousPage:
            pagination
              .hasPreviousPage,

          nextPage:
            pagination.nextPage,

          previousPage:
            pagination.previousPage,
        },

        /*
         * Summary represents the COMPLETE matching result set,
         * not just the current page.
         */
        summary,

        /*
         * Current frontend continues to consume only
         * the requested page.
         */
        ads:
          pagination
            .paginatedAds,

        /*
         * New metadata.
         *
         * This does not break the existing frontend.
         */
        meta: {
          cacheHit: false,
          stale: false,
          cacheAgeMs: 0,
          fetchedAt:
            new Date().toISOString(),
          scrapeDurationMs,
          analysisDurationMs,
          totalDurationMs,
        },
      },
      {
        status: 200,
      }
    );
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
      message = error;
    } else {
      try {
        message =
          JSON.stringify(
            error
          );
      } catch {
        message =
          "Unknown error";
      }
    }

    console.error(
      `[AdIntelligenceSearch] ${message}`
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to search ad intelligence.",

        message,
      },
      {
        status: 500,
      }
    );
  }
}