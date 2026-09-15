import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { getCollectionJob, updateCollectionJob } from "@/lib/ad-intelligence/global/store";
import type { CollectionJob } from "@/lib/ad-intelligence/global/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 3 * 60_000;
const ACTIVE_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
  "deep_queued",
  "deep",
]);

function isStale(job: CollectionJob): boolean {
  if (!ACTIVE_STATUSES.has(job.status)) return false;
  const timestamp = new Date(job.updatedAt ?? "").getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS;
}

function mapJob(job: CollectionJob, stale: boolean) {
  return {
    id: job.id,
    collectionKey: job.collectionKey,
    query: job.query,
    country: job.country,
    platform: job.platform,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    discoveredAds: job.discoveredAds,
    normalizedAds: job.normalizedAds,
    persistedAds: job.persistedAds,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    lastRequestedAt: job.lastRequestedAt,
    updatedAt: job.updatedAt,
    createdAt: job.createdAt,
    stale,
    hasMore: job.status !== "complete" && job.status !== "exhausted" && job.status !== "failed" && job.status !== "cancelled" && !stale,
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await createServerAuthClient();
    const userId = await getVerifiedUserId(auth);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await context.params;
    const normalizedJobId = jobId?.trim();
    if (!normalizedJobId) {
      return NextResponse.json({ success: false, error: "Missing jobId." }, { status: 400 });
    }

    let job = await getCollectionJob(normalizedJobId, userId);
    if (!job) {
      return NextResponse.json({ success: false, error: "Collection job not found." }, { status: 404 });
    }

    let stale = isStale(job);
    if (stale) {
      job = await updateCollectionJob(job.id, {
        status: "stale",
        stage: "stale",
        errorMessage: "Collection worker heartbeat stopped before completion.",
        completedAt: new Date().toISOString(),
      });
      stale = true;
      console.warn("[ADSPY_COLLECTION_STALE]", {
        jobId: job.id,
        query: job.query,
        updatedAt: job.updatedAt,
      });
    }

    return NextResponse.json(
      { success: true, job: mapJob(job, stale) },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[AdSpy Status]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load collection status.", retryable: true },
      { status: 500 },
    );
  }
}
