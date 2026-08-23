import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";

import type {
  AdSearchInput,
  AdSearchMode,
} from "@/lib/ad-intelligence/provider";

import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform } from "@/lib/ad-intelligence/types";

import {
  enrichAds,
  buildAdSearchSummary,
} from "@/lib/ad-intelligence/intelligence";

import { saveAdSpySnapshot } from "@/lib/ad-intelligence/adspy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ad-intelligence/search
 *
 * Examples:
 * /api/ad-intelligence/search?q=Mamaearth
 * /api/ad-intelligence/search?q=Mamaearth&page=2
 * /api/ad-intelligence/search?q=Mamaearth&page=2&limit=20
 * /api/ad-intelligence/search?q=Mamaearth&mode=keyword
 * /api/ad-intelligence/search?q=Mamaearth&country=IN&platform=meta
 */
export async function GET(request: NextRequest) {
  try {
    // ------------------------------------------------------------
    // 1. AUTHENTICATION
    // ------------------------------------------------------------

    const authClient = await createServerAuthClient();

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      console.warn(
        "[AdIntelligenceSearch] Unauthorized request."
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "You must be signed in to use AdSpy.",
        },
        {
          status: 401,
        }
      );
    }

    // ------------------------------------------------------------
    // 2. SEARCH PARAMS
    // ------------------------------------------------------------

    const searchParams = request.nextUrl.searchParams;

    const query =
      searchParams.get("q")?.trim() ?? "";

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

    const country = (
      searchParams.get("country")?.trim() || "IN"
    ).toUpperCase();

    const platform =
      (
        searchParams.get("platform")?.trim().toLowerCase() ||
        "meta"
      );

    if (platform !== "meta" && platform !== "google" && platform !== "linkedin") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported platform: ${platform}`,
          supportedPlatforms: ["meta", "google", "linkedin"],
        },
        {
          status: 400,
        }
      );
    }

    const rawMode =
      searchParams.get("mode")?.trim().toLowerCase();

    const mode: AdSearchMode =
      rawMode === "keyword"
        ? "keyword"
        : "advertiser";

    // ------------------------------------------------------------
    // 3. PAGINATION PARAMS
    // ------------------------------------------------------------

    const rawPage = Number(
      searchParams.get("page") ?? "1"
    );

    const page =
      Number.isFinite(rawPage) && rawPage >= 1
        ? Math.floor(rawPage)
        : 1;

    const rawLimit = Number(
      searchParams.get("limit") ?? "20"
    );

    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.min(Math.floor(rawLimit), 100)
        : 20;

    // ------------------------------------------------------------
    // 4. PROVIDER
    // ------------------------------------------------------------

    const provider = adProviders[platform as AdPlatform];

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error: `${platform} provider is not available.`,
        },
        {
          status: 500,
        }
      );
    }

    // ------------------------------------------------------------
    // 5. BUILD SEARCH INPUT
    // ------------------------------------------------------------

    const searchInput: AdSearchInput = {
      query,
      country,
      platform: platform as AdPlatform,
      mode,
    };

    console.info(
      `[AdIntelligenceSearch] Searching ${platform}: ${query} (${country})`
    );

    // ------------------------------------------------------------
    // 6. SCRAPE META
    // ------------------------------------------------------------

    const providerResult =
      await provider.search(searchInput);

    const scrapedAds =
      providerResult?.ads ?? [];

    console.info(
      `[AdIntelligenceSearch] Provider returned ${scrapedAds.length} ads.`
    );

    // ------------------------------------------------------------
    // 7. ENRICH / RANK
    // ------------------------------------------------------------

    const enrichedAds = enrichAds(
      scrapedAds,
      query
    );

    const rankedAds = [...enrichedAds];

    console.info(
      `[AdIntelligenceSearch] Enriched ${rankedAds.length} ads.`
    );

    // ------------------------------------------------------------
    // 8. BUILD INTELLIGENCE SUMMARY
    // ------------------------------------------------------------

    const summary =
      buildAdSearchSummary(
        rankedAds
      );

    // ------------------------------------------------------------
    // 9. SAVE COMPLETE ADSPY SNAPSHOT
    // ------------------------------------------------------------

    /**
     * IMPORTANT:
     *
     * Save the COMPLETE ranked dataset.
     *
     * Do NOT save paginatedAds here.
     *
     * This allows ZWIRK to later access:
     * - all ads from the search
     * - creative patterns
     * - offers
     * - creators
     * - longevity
     * - scores
     * - historical snapshots
     */
    try {
      await saveAdSpySnapshot({
        userId: user.id,
        query,
        country,
        platform: platform as "meta" | "google" | "linkedin",
        ads: rankedAds,
        intelligence: summary,
      });

      console.info(
        `[AdIntelligenceSearch] Saved AdSpy snapshot: ${query} (${rankedAds.length} ads)`
      );
    } catch (snapshotError) {
      /**
       * Snapshot storage should NEVER break AdSpy search.
       */
      console.error(
        "[AdIntelligenceSearch] Failed to persist AdSpy snapshot:",
        snapshotError
      );
    }

    // ------------------------------------------------------------
    // 10. PAGINATION
    // ------------------------------------------------------------

    const total = rankedAds.length;

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(total / limit);

    const safePage =
      totalPages === 0
        ? 1
        : Math.min(page, totalPages);

    const startIndex =
      (safePage - 1) * limit;

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
    // 11. RESPONSE
    // ------------------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        query,
        country,
        platform: platform as AdPlatform,
        mode,

        count: paginatedAds.length,

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

        /**
         * Summary represents the COMPLETE matching result set,
         * not just the current page.
         */
        summary,

        /**
         * UI receives only the requested page.
         */
        ads: paginatedAds,
      },
      {
        status: 200,
      }
    );
  } catch (error: unknown) {
    let message = "Unknown error";

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
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
