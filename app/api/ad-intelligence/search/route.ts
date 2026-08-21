import { NextRequest, NextResponse } from "next/server";

import type {
  AdSearchInput,
  AdSearchMode,
} from "@/lib/ad-intelligence/provider";

import { metaProvider } from "@/lib/ad-intelligence/providers/meta";

import {
  enrichAds,
  buildAdSearchSummary,
} from "@/lib/ad-intelligence/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ad-intelligence/search
 *
 * Examples:
 *
 * /api/ad-intelligence/search?q=Mamaearth
 * /api/ad-intelligence/search?q=Mamaearth&page=2
 * /api/ad-intelligence/search?q=Mamaearth&page=2&limit=20
 * /api/ad-intelligence/search?q=Mamaearth&mode=keyword
 * /api/ad-intelligence/search?q=Mamaearth&country=IN&platform=meta
 */
export async function GET(
  request: NextRequest
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    // ------------------------------------------------------------
    // QUERY
    // ------------------------------------------------------------

    const query =
      searchParams
        .get("q")
        ?.trim() ?? "";

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required query parameter: q",
        },
        {
          status: 400,
        }
      );
    }

    // ------------------------------------------------------------
    // COUNTRY
    // ------------------------------------------------------------

    const country =
      (
        searchParams
          .get("country")
          ?.trim() || "IN"
      ).toUpperCase();

    // ------------------------------------------------------------
    // PLATFORM
    // ------------------------------------------------------------

    const platform =
      (
        searchParams
          .get("platform")
          ?.trim()
          .toLowerCase() || "meta"
      );

    if (platform !== "meta") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported platform: ${platform}`,
          supportedPlatforms: ["meta"],
        },
        {
          status: 400,
        }
      );
    }

    // ------------------------------------------------------------
    // MODE
    //
    // IMPORTANT:
    // AdSearchMode is:
    // "advertiser" | "keyword"
    //
    // Never pass an arbitrary string here.
    // ------------------------------------------------------------

    const rawMode =
      searchParams
        .get("mode")
        ?.trim()
        .toLowerCase();

    const mode: AdSearchMode =
      rawMode === "keyword"
        ? "keyword"
        : "advertiser";

    // ------------------------------------------------------------
    // PAGE
    // ------------------------------------------------------------

    const rawPage =
      Number(
        searchParams.get("page") ?? "1"
      );

    const page =
      Number.isFinite(rawPage) &&
      rawPage >= 1
        ? Math.floor(rawPage)
        : 1;

    // ------------------------------------------------------------
    // LIMIT
    // ------------------------------------------------------------

    const rawLimit =
      Number(
        searchParams.get("limit") ?? "20"
      );

    const limit =
      Number.isFinite(rawLimit) &&
      rawLimit >= 1
        ? Math.min(
            Math.floor(rawLimit),
            100
          )
        : 20;

    // ------------------------------------------------------------
    // PROVIDER
    //
    // We deliberately use metaProvider directly instead of
    // importing `adProviders`, because your current project does
    // not expose that barrel export consistently.
    // ------------------------------------------------------------

    const provider = metaProvider;

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error: "Meta provider is not available.",
        },
        {
          status: 500,
        }
      );
    }

    // ------------------------------------------------------------
    // SEARCH
    //
    // We collect the provider's full result set first.
    // Pagination is applied AFTER:
    //
    // 1. scraping
    // 2. normalization
    // 3. intelligence enrichment
    //
    // This keeps totalAdsFound and pagination accurate.
    // ------------------------------------------------------------

    const searchInput: AdSearchInput = {
      query,
      country,
      platform: "meta",
      mode,
      limit,
      page: 1,
    };

    const providerResult =
      await provider.search(
        searchInput
      );

    const scrapedAds =
      providerResult?.ads ?? [];

    // ------------------------------------------------------------
    // INTELLIGENCE / ENRICHMENT
    // ------------------------------------------------------------

    const enrichedAds =
      enrichAds(
        scrapedAds,
        query
      );

    // ------------------------------------------------------------
    // SORT
    //
    // Intelligence should normally already rank the ads, but we
    // preserve that ordering here.
    // ------------------------------------------------------------

    const rankedAds =
      [...enrichedAds];

    // ------------------------------------------------------------
    // SUMMARY
    //
    // Build summary from ALL matching ads, not only the current
    // page. Therefore:
    //
    // totalAdsFound = complete result set
    // activeAds      = complete result set
    // videoAds       = complete result set
    // etc.
    // ------------------------------------------------------------

    const summary =
      buildAdSearchSummary(
        rankedAds
      );

    // ------------------------------------------------------------
    // PAGINATION
    // ------------------------------------------------------------

    const total =
      rankedAds.length;

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
      startIndex + limit;

    const paginatedAds =
      rankedAds.slice(
        startIndex,
        endIndex
      );

    const hasNextPage =
      safePage < totalPages;

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

    // ------------------------------------------------------------
    // RESPONSE
    // ------------------------------------------------------------

    return NextResponse.json(
      {
        success: true,

        query,

        country,

        platform: "meta",

        mode,

        count:
          paginatedAds.length,

        pagination: {
          page: safePage,

          limit,

          total,

          totalPages,

          hasNextPage,

          hasPreviousPage,

          nextPage,

          previousPage,
        },

        summary,

        ads: paginatedAds,
      },
      {
        status: 200,
      }
    );
  }  catch (error: unknown) {
    let message = "Unknown error";

    if (error instanceof Error) {
      message = error.message;
    } else if (
      typeof error === "string"
    ) {
      message = error;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = "Unknown error";
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