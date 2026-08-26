import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

import {
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  requestCollectionRefresh,
  searchGlobalAds,
} from "@/lib/ad-intelligence/global/store";

import type { AdPlatform } from "@/lib/ad-intelligence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePlatform(value: string | null): AdPlatform {
  if (value === "google" || value === "linkedin") {
    return value;
  }
  return "meta";
}

function normalizeMode(value: string | null): "advertiser" | "keyword" {
  return value === "keyword" ? "keyword" : "advertiser";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();

    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const params = request.nextUrl.searchParams;

    const query = (params.get("q") ?? "").trim();
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    const platform = normalizePlatform(params.get("platform"));
    const mode = normalizeMode(params.get("mode"));

    const rawPage = Number(params.get("page") ?? "1");
    const rawLimit = Number(params.get("limit") ?? "24");

    const page =
      Number.isFinite(rawPage) && rawPage >= 1
        ? Math.floor(rawPage)
        : 1;

    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.min(60, Math.floor(rawLimit))
        : 24;

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        ads: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        summary: {
          totalAds: 0,
          activeAds: 0,
          inactiveAds: 0,
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
            status: "unavailable",
            reason: "A public reach figure is not exposed reliably.",
          },
        },
        languages: [],
        markets: [],
        lastUpdatedAt: null,
        isRefreshing: false,
        collectionJobId: null,
        collectionJob: null,
      });
    }

    let job = await getOrCreateCollectionJob({
      query,
      country,
      platform,
      mode,
    });

    if (job.status === "complete" || job.status === "failed") {
      const refresh = await requestCollectionRefresh(job);
      job = refresh.job;
    }

    if (job.status === "queued") {
      const claimed = await claimCollectionDispatch(job.id);

      if (claimed) {
        const latest = await getCollectionJob(job.id);

        if (!latest) {
          throw new Error("Collection job disappeared before dispatch.");
        }

        await inngest.send({
          name: "zooptrack/ad-intelligence.collection.requested",
          data: {
            jobId: latest.id,
            query: latest.query,
            country: latest.country,
            platform: latest.platform,
            mode: latest.mode,
            collectionKey: latest.collectionKey,
          },
        });

        job = latest;
      }
    }

    const result = await searchGlobalAds({
      query,
      country,
      platform,
      mode,
      page,
      limit,
    });

    const latestJob = await getCollectionJob(job.id);
    const activeJob = latestJob ?? job;

    const isRefreshing = [
      "queued",
      "scraping",
      "normalizing",
      "enriching",
      "finalizing",
    ].includes(activeJob.status);

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
      totalPages: result.totalPages,
      summary: result.summary,
      intelligence: result.intelligence,
      languages: result.languages,
      markets: result.markets,
      lastUpdatedAt: result.lastUpdatedAt,
      isRefreshing,
      collectionJobId: activeJob.id,
      collectionJob: {
        id: activeJob.id,
        status: activeJob.status,
        stage: activeJob.stage,
        discoveredAds: activeJob.discoveredAds,
        normalizedAds: activeJob.normalizedAds,
        persistedAds: activeJob.persistedAds,
        errorMessage: activeJob.errorMessage,
      },
    });
  } catch (error) {
    console.error("[AdSpy] Search failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AdSpy search failed.",
      },
      { status: 500 },
    );
  }
}
