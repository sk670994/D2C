import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";

import type { AdPlatform } from "@/lib/ad-intelligence/types";
import type { CollectionDepth } from "@/lib/ad-intelligence/provider";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";

import {
  buildAdvertiserCollectionKey,
  getOrCreateAdvertiserCollectionJob,
} from "@/lib/ad-intelligence/global/page-aware-store";

import {
  getCollectionJob,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import { dispatchAdSpyCollection } from "@/lib/ad-intelligence/jobs/dispatch-adspy-collection";
import { checkRateLimit } from "@/lib/rate-limit";

import {
  enqueueAdSpyRequest,
  getDurableRunByCollectionJob,
  getOrCreateDurableRun,
} from "@/lib/ad-intelligence/durable-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
  "deep_queued",
  "deep",
]);

const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "running",
  "retrying",
]);

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

    let job =
      await getOrCreateAdvertiserCollectionJob(
        {
          query,
          country,
          platform,
          mode,
          userId,
          advertiserPageId:
            pageId,
        },
      );

    const collectionKey =
      buildAdvertiserCollectionKey({
        query: job.query,
        country: job.country,
        platform: job.platform,
        mode: job.mode,
        pageId,
      });

    const existingRun =
      await getDurableRunByCollectionJob(
        job.id,
        userId,
      );

    if (
      ACTIVE_JOB_STATUSES.has(
        job.status,
      ) &&
      existingRun &&
      ACTIVE_RUN_STATUSES.has(
        existingRun.status,
      )
    ) {
      return NextResponse.json({
        success: true,
        job: mapJob(job),
        durableRun:
          mapRun(existingRun),
        isRefreshing: true,
        advertiserPageId: pageId,
      });
    }

    const lastRequestedAt =
      new Date(
        job.lastRequestedAt,
      ).getTime();

    if (
      ["complete","exhausted","failed","stale"].includes(
        job.status,
      ) &&
      Number.isFinite(
        lastRequestedAt,
      ) &&
      Date.now() -
          lastRequestedAt <
        MIN_REFRESH_INTERVAL_MS
    ) {
      return NextResponse.json({
        success: true,
        job: mapJob(job),
        durableRun:
          mapRun(existingRun),
        isRefreshing: false,
        advertiserPageId: pageId,
      });
    }

    job =
      await updateCollectionJob(
        job.id,
        {
          status: "queued",
          stage: "queued",
          errorMessage: null,
          completedAt: null,
          discoveredAds: 0,
          normalizedAds: 0,
          persistedAds: 0,
          startedAt: null,
        },
      );

    const run =
      await getOrCreateDurableRun({
        userId,
        collectionJobId:
          job.id,
        collectionKey,
        query: job.query,
        country: job.country,
        platform: job.platform,
        mode: job.mode,
        advertiserPageId:
          pageId,
      });

    const collectionDepth:
      CollectionDepth =
      platform === "meta"
        ? "quick"
        : "deep";

    const payload: Omit<
      CollectionEvent,
      "requestId"
    > = {
      jobId: job.id,
      query: job.query,
      country: job.country,
      platform: job.platform,
      mode: job.mode,
      collectionKey,
      collectionDepth,
      advertiserPageId: pageId,
      runId: run.id,
    };

    const queueRequest =
      await enqueueAdSpyRequest({
        runId: run.id,
        uniqueKey:
          `${collectionKey}:initial`,
        requestType: "initial",
        payload,
        priority: 100,
        maxAttempts: 2,
      });

    const message: CollectionEvent = {
      ...payload,
      requestId:
        queueRequest.id,
    };

    await dispatchAdSpyCollection(
      message,
      `${collectionKey}:initial:${run.id}`,
    );

    const freshJob =
      (await getCollectionJob(
        job.id,
        userId,
      )) ?? job;

    const freshRun =
      await getDurableRunByCollectionJob(
        job.id,
        userId,
      );

    return NextResponse.json({
      success: true,
      job: mapJob(freshJob),
      durableRun:
        mapRun(freshRun),
      isRefreshing: true,
      advertiserPageId: pageId,
    });
  } catch (error) {
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