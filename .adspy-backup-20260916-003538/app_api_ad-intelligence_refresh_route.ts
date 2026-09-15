import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import type { AdPlatform } from "@/lib/ad-intelligence/types";
import type { CollectionDepth } from "@/lib/ad-intelligence/provider";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import { buildAdvertiserCollectionKey, getOrCreateAdvertiserCollectionJob } from "@/lib/ad-intelligence/global/page-aware-store";
import { claimCollectionDispatch, getCollectionJob, updateCollectionJob } from "@/lib/ad-intelligence/global/store";
import { dispatchAdSpyCollection } from "@/lib/ad-intelligence/jobs/dispatch-adspy-collection";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["queued", "scraping", "normalizing", "enriching", "finalizing", "deep_queued", "deep"]);
const STALE_AFTER_MS = 3 * 60_000;
const MIN_REFRESH_INTERVAL_MS = 10 * 60_000;

function normalizePlatform(value: string | null): AdPlatform {
  return value === "google" || value === "linkedin" ? value : "meta";
}

function normalizeMode(value: string | null): "advertiser" | "keyword" {
  return value === "keyword" ? "keyword" : "advertiser";
}

function isStale(job: { status: string; updatedAt: string }) {
  if (!ACTIVE_STATUSES.has(job.status)) return false;
  const updated = new Date(job.updatedAt).getTime();
  return !Number.isFinite(updated) || Date.now() - updated > STALE_AFTER_MS;
}

function mapJob(job: Awaited<ReturnType<typeof getOrCreateAdvertiserCollectionJob>>) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    discoveredAds: Number(job.discoveredAds ?? 0),
    normalizedAds: Number(job.normalizedAds ?? 0),
    persistedAds: Number(job.persistedAds ?? 0),
    errorMessage: job.errorMessage ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const userId = await getVerifiedUserId(auth);
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const rate = checkRateLimit(`adspy-refresh:${userId}`, 8, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: "Too many refresh requests." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").replace(/\s+/g, " ").trim();
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    const platform = normalizePlatform(params.get("platform"));
    const mode = normalizeMode(params.get("mode"));
    const rawPageId = (params.get("pageId") ?? "").trim();
    const pageId = platform === "meta" && mode === "advertiser" && /^\d+$/.test(rawPageId) ? rawPageId : null;

    if (query.length < 2) return NextResponse.json({ success: false, error: "Enter at least 2 characters." }, { status: 400 });
    if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ success: false, error: "Invalid country code." }, { status: 400 });

    let job = await getOrCreateAdvertiserCollectionJob({
      query,
      country,
      platform,
      mode,
      userId,
      advertiserPageId: pageId,
    });

    const staleBeforeRequest = isStale(job);
    if (staleBeforeRequest) {
      job = await updateCollectionJob(job.id, {
        status: "stale",
        stage: "stale",
        errorMessage: "Previous collection worker stopped reporting progress and was replaced.",
        completedAt: new Date().toISOString(),
      });
      // A stale job is immediately eligible for a replacement dispatch.
      job = await updateCollectionJob(job.id, {
        status: "queued",
        stage: "queued",
        errorMessage: null,
        completedAt: null,
        discoveredAds: 0,
        normalizedAds: 0,
        persistedAds: 0,
      });
    } else if (ACTIVE_STATUSES.has(job.status)) {
      return NextResponse.json({ success: true, job: mapJob(job), isRefreshing: true, advertiserPageId: pageId });
    } else if ((job.status === "complete" || job.status === "exhausted" || job.status === "failed" || job.status === "stale") && Date.now() - new Date(job.lastRequestedAt).getTime() >= MIN_REFRESH_INTERVAL_MS) {
      job = await updateCollectionJob(job.id, {
        status: "queued",
        stage: "queued",
        errorMessage: null,
        completedAt: null,
        discoveredAds: 0,
        normalizedAds: 0,
        persistedAds: 0,
      });
    }

    if (job.status === "queued") {
      const claimed = await claimCollectionDispatch(job.id);
      if (claimed) {
        const latest = (await getCollectionJob(job.id, userId)) ?? job;
        const collectionDepth: CollectionDepth = platform === "meta" ? "quick" : "deep";
        const payload: CollectionEvent = {
          jobId: latest.id,
          query: latest.query,
          country: latest.country,
          platform: latest.platform,
          mode: latest.mode,
          collectionKey: buildAdvertiserCollectionKey({ query: latest.query, country: latest.country, platform: latest.platform, mode: latest.mode, pageId }),
          collectionDepth,
          advertiserPageId: pageId,
        };

        await dispatchAdSpyCollection(payload, `${payload.collectionKey}:quick`);
        console.info("[ADSPY_COLLECTION_START]", { jobId: payload.jobId, query: payload.query, country: payload.country, platform: payload.platform, page: pageId ?? null, phase: "quick" });
      }
    }

    const freshJob = (await getCollectionJob(job.id, userId)) ?? job;
    return NextResponse.json({ success: true, job: mapJob(freshJob), isRefreshing: ACTIVE_STATUSES.has(freshJob.status), advertiserPageId: pageId });
  } catch (error) {
    console.error("[AdSpy refresh]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Background refresh failed." }, { status: 500 });
  }
}
