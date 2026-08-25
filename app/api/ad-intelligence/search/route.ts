import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import type { AdPlatform } from "@/lib/ad-intelligence/types";
import {
  buildCollectionKey,
  getCollectionJob,
  getOrCreateCollectionJob,
  requestCollectionRefresh,
  claimCollectionDispatch,
  searchGlobalAds,
} from "@/lib/ad-intelligence/global/store";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = new Set<AdPlatform>([
  "meta",
  "google",
  "linkedin",
]);

type SearchMode = "advertiser" | "keyword";

function normalizeMode(value: string | null): SearchMode {
  return value?.trim().toLowerCase() === "keyword"
    ? "keyword"
    : "advertiser";
}

function normalizePlatform(value: string | null): AdPlatform | null {
  const normalized = (value ?? "meta").trim().toLowerCase() as AdPlatform;
  return SUPPORTED_PLATFORMS.has(normalized) ? normalized : null;
}

async function startCollectionIfNeeded(jobId: string): Promise<boolean> {
  const claimed = await claimCollectionDispatch(jobId);
  if (!claimed) return false;

  const job = await getCollectionJob(jobId);
  if (!job) throw new Error("Collection job disappeared before dispatch.");

  await inngest.send({
    name: "zooptrack/ad-intelligence.collection.requested",
    data: {
      jobId: job.id,
      query: job.query,
      country: job.country,
      platform: job.platform,
      mode: job.mode,
      collectionKey: buildCollectionKey({
        query: job.query,
        country: job.country,
        platform: job.platform,
        mode: job.mode,
      }),
    },
  });

  return true;
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
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? "20") || 20));

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: q" },
        { status: 400 },
      );
    }

    if (!platform) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported platform.",
          supportedPlatforms: Array.from(SUPPORTED_PLATFORMS),
        },
        { status: 400 },
      );
    }

    let job = await getOrCreateCollectionJob({
      query,
      country,
      platform,
      mode,
    });

    let shouldStart = job.status === "queued";

    if (job.status === "complete" || job.status === "failed") {
      const refresh = await requestCollectionRefresh(job, 10);
      job = refresh.job;
      shouldStart = refresh.shouldEnqueue;
    }

    let collectionStarted = false;
    let dispatchError: string | null = null;

    if (shouldStart) {
      try {
        collectionStarted = await startCollectionIfNeeded(job.id);
        job = (await getCollectionJob(job.id)) ?? job;
      } catch (error) {
        dispatchError = error instanceof Error ? error.message : "Background collection could not be started.";
        console.error("[AdIntelligenceSearch] Background dispatch failed:", error);
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

    const isRefreshing = [
      "queued",
      "scraping",
      "normalizing",
      "enriching",
      "finalizing",
    ].includes(job.status);

    return NextResponse.json({
      success: true,
      ...result,
      collectionJob: job,
      isRefreshing,
      collectionStarted,
      dispatchError,
      source: {
        platform,
        country,
        mode,
        statement: "Results are based on the public ad data currently indexed by Zooptrack.",
      },
    });
  } catch (error) {
    console.error("[AdIntelligenceSearch] Search failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to search ad intelligence.",
        message: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
