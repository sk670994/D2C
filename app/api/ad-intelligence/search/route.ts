import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { searchGlobalAdsAccurate } from "@/lib/ad-intelligence/global/accurate-search";
import type { AdPlatform } from "@/lib/ad-intelligence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePlatform(
  value: string | null,
): AdPlatform {
  if (
    value === "google" ||
    value === "linkedin"
  ) {
    return value;
  }

  return "meta";
}

function normalizeMode(
  value: string | null,
): "advertiser" | "keyword" {
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

function normalizeCountry(
  value: string | null,
) {
  const country =
    (value ?? "IN")
      .trim()
      .toUpperCase();

  return /^[A-Z]{2}$/.test(country)
    ? country
    : "IN";
}

export async function GET(
  request: NextRequest,
) {
  const requestStartedAt =
    Date.now();

  try {
    const auth =
      await createServerAuthClient();

    const {
      data: {
        user,
      },
      error: authError,
    } =
      await auth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const params =
      request.nextUrl.searchParams;

    const query =
      (
        params.get("q") ?? ""
      ).trim();

    const country =
      normalizeCountry(
        params.get(
          "country",
        ),
      );

    const platform =
      normalizePlatform(
        params.get(
          "platform",
        ),
      );

    const mode =
      normalizeMode(
        params.get("mode"),
      );

    const rawPage =
      Number(
        params.get("page") ??
          "1",
      );

    const rawLimit =
      Number(
        params.get("limit") ??
          "24",
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

    const limit =
      Number.isFinite(
        rawLimit,
      ) &&
      rawLimit >= 1
        ? Math.min(
            60,
            Math.floor(
              rawLimit,
            ),
          )
        : 24;

    if (
      query.length <
      2
    ) {
      return NextResponse.json({
        success: true,
        query,
        country,
        platform,
        mode,
        ads: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        summary: {
          totalAds: 0,
          activeAds: 0,
          inactiveAds: 0,
          unknownAds: 0,
          videoAds: 0,
          imageAds: 0,
          carouselAds: 0,
          creatorAds: 0,
          averageRunningDays: 0,
          longestRunningDays: 0,
        },
        intelligence: {
          topCreators: [],
          topOffers: [],
          topHooks: [],
          longestRunningAd: null,
          reach: {
            status:
              "unavailable",
            reason:
              "A public reach figure is not exposed reliably.",
          },
        },
        languages: [],
        markets: [],
        lastUpdatedAt: null,
        isRefreshing: false,
        collectionJobId: null,
        collectionJob: null,
        meta: {
          durationMs:
            Date.now() -
            requestStartedAt,
        },
      });
    }

    const result =
      await searchGlobalAdsAccurate({
        query,
        country,
        platform,
        mode,
        page,
        limit,
      });

    return NextResponse.json({
      success: true,
      query,
      country,
      platform,
      mode,
      ads: result.ads,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages:
        result.totalPages,
      summary:
        result.summary,
      intelligence:
        result.intelligence,
      languages:
        result.languages,
      markets:
        result.markets,
      lastUpdatedAt:
        result.lastUpdatedAt,
      isRefreshing: false,
      collectionJobId: null,
      collectionJob: null,
      meta: {
        durationMs:
          Date.now() -
          requestStartedAt,
      },
    });
  } catch (error) {
    console.error(
      "[AdSpy] Search failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AdSpy search failed.",
      },
      {
        status: 500,
      },
    );
  }
}
