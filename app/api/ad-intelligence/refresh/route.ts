import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";

import type { AdPlatform } from "@/lib/ad-intelligence/types";
import {
  getCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import { checkRateLimit } from "@/lib/rate-limit";

import {
  getDurableRunByCollectionJob,
} from "@/lib/ad-intelligence/durable-run";

import {
  startAdSpyCollection,
  UnsupportedPlatformError,
} from "@/lib/ad-intelligence/jobs/start-collection";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

const MIN_REFRESH_INTERVAL_MS = 10 * 60_000;

function normalizePlatform(value: string | null): AdPlatform {
  return value === "google" || value === "linkedin"
    ? value
    : "meta";
}

function normalizeMode(
  value: string | null,
): "advertiser" | "keyword" {
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

function mapJob(job: any) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    discoveredAds: Number(
      job.discoveredAds ?? 0,
    ),
    normalizedAds: Number(
      job.normalizedAds ?? 0,
    ),
    persistedAds: Number(
      job.persistedAds ?? 0,
    ),
    errorMessage:
      job.errorMessage ?? null,
  };
}

function mapRun(run: any) {
  if (!run) return null;

  return {
    id: run.id,
    status: run.status,
    stage: run.stage,
    discoveredAds:
      run.discoveredAds,
    normalizedAds:
      run.normalizedAds,
    persistedAds:
      run.persistedAds,
    queuedRequests:
      run.queuedRequests,
    runningRequests:
      run.runningRequests,
    completedRequests:
      run.completedRequests,
    failedRequests:
      run.failedRequests,
    attempt: run.attempt,
    heartbeatAt:
      run.heartbeatAt,
    errorMessage:
      run.errorMessage,
  };
}

export async function POST(
  request: NextRequest,
) {
  try {
    const auth =
      await createServerAuthClient();

    const userId =
      await getVerifiedUserId(
        auth,
      );

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(
      `adspy-refresh:${userId}`,
      8,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many refresh requests.",
        },
        {
          status: 429,
          headers: {
            "Retry-After":
              String(
                rate.retryAfterSeconds,
              ),
          },
        },
      );
    }

    const params =
      request.nextUrl.searchParams;

    const query =
      (
        params.get("q") ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

    const country =
      (
        params.get("country") ??
        "IN"
      )
        .trim()
        .toUpperCase();

    const platform =
      normalizePlatform(
        params.get("platform"),
      );

    const mode =
      normalizeMode(
        params.get("mode"),
      );

    const rawPageId =
      (
        params.get("pageId") ??
        ""
      ).trim();

    const pageId =
      platform === "meta" &&
      mode === "advertiser" &&
      /^\d+$/.test(rawPageId)
        ? rawPageId
        : null;

    if (query.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter at least 2 characters.",
        },
        { status: 400 },
      );
    }

    if (!/^[A-Z]{2}$/.test(country)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid country code.",
        },
        { status: 400 },
      );
    }

    const result = await startAdSpyCollection({
      userId,
      query,
      country,
      platform,
      mode,
      pageId,
      minIntervalMs: MIN_REFRESH_INTERVAL_MS,
      reason: "user",
    });

    const freshJob =
      (await getCollectionJob(result.job.id, userId)) ?? result.job;

    const freshRun =
      (await getDurableRunByCollectionJob(result.job.id, userId)) ?? result.run;

    const isRefreshing =
      result.outcome === "dispatched" ||
      result.outcome === "already_running";

    return NextResponse.json({
      success: true,
      job: mapJob(freshJob),
      durableRun: mapRun(freshRun),
      isRefreshing,
      outcome: result.outcome,
      message:
        result.outcome === "recently_collected"
          ? "This advertiser was refreshed a few minutes ago. Showing the latest indexed data."
          : result.outcome === "running_for_another_request"
            ? "A collection for this advertiser is already running. Search again in a minute to see new ads."
            : null,
      advertiserPageId: pageId,
    });
  } catch (error) {
    if (error instanceof UnsupportedPlatformError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    console.error(
      "[AdSpy refresh]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Background refresh failed.",
      },
      { status: 500 },
    );
  }
}
