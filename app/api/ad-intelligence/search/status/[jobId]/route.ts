import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";

import {
  getCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import {
  getDurableRunByCollectionJob,
} from "@/lib/ad-intelligence/durable-run";

import type { CollectionJob } from "@/lib/ad-intelligence/global/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_STALE_AFTER_MS =
  10 * 60_000;

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
  "deep_queued",
  "deep",
]);

function mapJob(
  job: CollectionJob,
  stale: boolean,
) {
  return {
    id: job.id,
    collectionKey:
      job.collectionKey,
    query:
      job.query,
    country:
      job.country,
    platform:
      job.platform,
    mode:
      job.mode,
    status:
      job.status,
    stage:
      job.stage,
    discoveredAds:
      job.discoveredAds,
    normalizedAds:
      job.normalizedAds,
    persistedAds:
      job.persistedAds,
    errorMessage:
      job.errorMessage,
    startedAt:
      job.startedAt,
    completedAt:
      job.completedAt,
    lastRequestedAt:
      job.lastRequestedAt,
    updatedAt:
      job.updatedAt,
    createdAt:
      job.createdAt,
    stale,
    hasMore:
      job.status !== "complete" &&
      job.status !== "exhausted" &&
      job.status !== "failed" &&
      job.status !== "cancelled" &&
      !stale,
  };
}

function mapRun(
  run: Awaited<
    ReturnType<
      typeof getDurableRunByCollectionJob
    >
  >,
) {
  if (!run) return null;

  return {
    id: run.id,
    status:
      run.status,
    stage:
      run.stage,
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
    attempt:
      run.attempt,
    heartbeatAt:
      run.heartbeatAt,
    errorMessage:
      run.errorMessage,
    createdAt:
      run.createdAt,
    startedAt:
      run.startedAt,
    completedAt:
      run.completedAt,
    updatedAt:
      run.updatedAt,
  };
}

function oldJob(
  job: CollectionJob,
): boolean {
  if (
    !ACTIVE_JOB_STATUSES.has(
      job.status,
    )
  ) {
    return false;
  }

  const t =
    new Date(
      job.updatedAt ?? "",
    ).getTime();

  return Number.isFinite(t)
    && Date.now() - t >
      JOB_STALE_AFTER_MS;
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  },
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
          error:
            "Unauthorized",
        },
        { status: 401 },
      );
    }

    const { jobId } =
      await context.params;

    const normalized =
      jobId?.trim();

    if (!normalized) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing jobId.",
        },
        { status: 400 },
      );
    }

    let job =
      await getCollectionJob(
        normalized,
        userId,
      );

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Collection job not found.",
        },
        { status: 404 },
      );
    }

    const durableRun =
      await getDurableRunByCollectionJob(
        job.id,
        userId,
      );

    const isOld = oldJob(job);

    const durableAlive =
      durableRun &&
      ["queued","running","retrying"].includes(
        durableRun.status,
      );

    if (
      isOld &&
      !durableAlive
    ) {
      job = {
        ...job,
        status: "stale",
        stage: "stale",
        errorMessage:
          durableRun?.errorMessage ??
          "Collection worker heartbeat stopped before completion.",
        completedAt:
          new Date().toISOString(),
      };
    }

    return NextResponse.json(
      {
        success: true,
        job: mapJob(
          job,
          isOld && !durableAlive,
        ),
        durableRun:
          mapRun(durableRun),
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[AdSpy Status]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load collection status.",
        retryable: true,
      },
      { status: 500 },
    );
  }
}