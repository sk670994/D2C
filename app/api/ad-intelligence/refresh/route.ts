import { NextRequest, NextResponse, after } from "next/server";
import {
  buildCollectionKey,
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import type { AdPlatform } from "@/lib/ad-intelligence/types";
import type { CollectionDepth } from "@/lib/ad-intelligence/provider";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import type { CollectionJob } from "@/lib/ad-intelligence/global/types";
import { send } from "@vercel/queue";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set([
  "queued", "scraping", "normalizing", "enriching", "finalizing",
]);
const STALE_AFTER_MS = 3 * 60_000;

function normalizePlatform(value: string | null): AdPlatform {
  return value === "google" || value === "linkedin" ? value : "meta";
}
function normalizeMode(value: string | null): "advertiser" | "keyword" {
  return value === "keyword" ? "keyword" : "advertiser";
}
function isActive(status?: string | null) {
  return Boolean(status && ACTIVE_STATUSES.has(status));
}
function isStale(job: CollectionJob) {
  if (!isActive(job.status)) return false;
  const updated = new Date(job.updatedAt ?? "").getTime();
  return !Number.isFinite(updated) || Date.now() - updated > STALE_AFTER_MS;
}
function mapJob(job: CollectionJob) {
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

async function dispatch(payload: CollectionEvent, idempotencyKey: string) {
  if (process.env.VERCEL) {
    await send("adspy-collection", payload, {
      idempotencyKey,
      retentionSeconds: 24 * 60 * 60,
    });
    return;
  }

  const { collectAdIntelligence } = await import(
    "@/lib/ad-intelligence/jobs/collect-ad-intelligence"
  );

  after(async () => {
    try {
      await collectAdIntelligence(payload);
    } catch (error) {
      console.error("[AdSpy refresh] inline collection failed", error);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const { data: { user }, error } = await auth.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit(`adspy-refresh:${user.id}`, 6, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many refresh requests." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").trim();
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    const platform = normalizePlatform(params.get("platform"));
    const mode = normalizeMode(params.get("mode"));
    const rawPageId = (params.get("pageId") ?? "").trim();
    const pageId =
      platform === "meta" &&
      mode === "advertiser" &&
      /^\d+$/.test(rawPageId)
        ? rawPageId
        : undefined;

    if (query.length < 2) {
      return NextResponse.json({ success: false, error: "Enter at least 2 characters." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      return NextResponse.json({ success: false, error: "Invalid country code." }, { status: 400 });
    }

    let job = await getOrCreateCollectionJob({
      query, country, platform, mode, userId: user.id,
    });

    if (isStale(job)) {
      await updateCollectionJob(job.id, {
        status: "failed",
        stage: "failed",
        errorMessage: "Previous collection became stale and was restarted.",
        completedAt: new Date().toISOString(),
      });
      job = await getOrCreateCollectionJob({
        query, country, platform, mode, userId: user.id,
      });
    } else if (job.status === "complete" || job.status === "failed") {
      await updateCollectionJob(job.id, {
        status: "queued",
        stage: "queued",
        errorMessage: null,
        completedAt: null,
      });
      job = (await getCollectionJob(job.id)) ?? job;
    }

    if (job.status === "queued") {
      const claimed = await claimCollectionDispatch(job.id);
      if (claimed) {
        const latest = (await getCollectionJob(job.id)) ?? job;
        const collectionDepth: CollectionDepth =
          platform === "meta" ? "quick" : "deep";

        const payload: CollectionEvent = {
          jobId: latest.id,
          query: latest.query,
          country: latest.country,
          platform: latest.platform,
          mode: latest.mode,
          collectionKey: buildCollectionKey({
            query: latest.query,
            country: latest.country,
            platform: latest.platform,
            mode: latest.mode,
          }),
          collectionDepth,
          advertiserPageId: pageId ?? null,
        };

        await dispatch(
          payload,
          `${payload.collectionKey}:dispatch:${Math.floor(Date.now() / 600_000)}`,
        );
      }
    }

    const freshJob = (await getCollectionJob(job.id)) ?? job;

    return NextResponse.json({
      success: true,
      job: mapJob(freshJob),
      isRefreshing: isActive(freshJob.status),
      advertiserPageId: pageId ?? null,
    });
  } catch (error) {
    console.error("[AdSpy refresh]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Background refresh failed.",
      },
      { status: 500 },
    );
  }
}
