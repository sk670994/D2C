import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  buildCollectionKey,
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  requestCollectionRefresh,
} from "@/lib/ad-intelligence/global/store";

import type { AdPlatform } from "@/lib/ad-intelligence/types";

import type {
  CollectionDepth,
} from "@/lib/ad-intelligence/provider";

import type {
  CollectionJob,
} from "@/lib/ad-intelligence/global/types";

import { send } from "@vercel/queue";

import {
  checkRateLimit,
} from "@/lib/rate-limit";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ACTIVE_STATUSES = [
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
] as const;

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
  return value ===
    "keyword"
    ? "keyword"
    : "advertiser";
}

function isActiveStatus(
  status?: string | null,
) {
  return Boolean(
    status &&
      ACTIVE_STATUSES.includes(
        status as
          (typeof ACTIVE_STATUSES)[number],
      ),
  );
}

function mapJob(
  job: CollectionJob,
) {
  return {
    id:
      job.id,

    status:
      job.status,

    stage:
      job.stage,

    discoveredAds:
      Number(
        job.discoveredAds ??
          0,
      ),

    normalizedAds:
      Number(
        job.normalizedAds ??
          0,
      ),

    persistedAds:
      Number(
        job.persistedAds ??
          0,
      ),

    errorMessage:
      job.errorMessage ??
      null,
  };
}

export async function POST(
  request: NextRequest,
) {
  try {
    const auth =
      await createServerAuthClient();

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await auth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const rate =
      checkRateLimit(
        `refresh:${user.id}`,
        6,
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
      request.nextUrl
        .searchParams;

    const query =
      (
        params.get("q") ??
        ""
      ).trim();

    const country =
      (
        params.get(
          "country",
        ) ??
        "IN"
      )
        .trim()
        .toUpperCase();

    const platform =
      normalizePlatform(
        params.get(
          "platform",
        ),
      );

    const mode =
      normalizeMode(
        params.get(
          "mode",
        ),
      );

    /*
     * Exact Meta advertiser Page ID.
     *
     * Only numeric Facebook Page IDs are accepted.
     */
    const advertiserPageIdRaw =
      (
        params.get(
          "pageId",
        ) ??
        ""
      ).trim();

    const advertiserPageId =
      /^\d+$/.test(
        advertiserPageIdRaw,
      )
        ? advertiserPageIdRaw
        : undefined;

    if (
      query.length < 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter at least 2 characters.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      country.length !== 2 ||
      !/^[A-Z]{2}$/.test(
        country,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid country code. Use a 2-letter code such as IN.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Page ID is meaningful only for Meta advertiser searches.
     *
     * Ignore malformed/irrelevant values rather than sending
     * arbitrary data into the queue.
     */
    const normalizedAdvertiserPageId =
      platform === "meta" &&
      mode === "advertiser"
        ? advertiserPageId
        : undefined;

    let job =
      await getOrCreateCollectionJob(
        {
          query,
          country,
          platform,
          mode,
          userId:
            user.id,
        },
      );

    /*
     * Completed/failed jobs may be refreshed.
     */
    if (
      job.status ===
        "complete" ||
      job.status ===
        "failed"
    ) {
      const refresh =
        await requestCollectionRefresh(
          job,
        );

      job =
        refresh.job;
    }

    /*
     * Meta uses the quick-first collector.
     * Other providers remain deep.
     */
    const collectionDepth:
      CollectionDepth =
      platform ===
        "meta"
        ? "quick"
        : "deep";

    /*
     * Queue -> claim -> dispatch.
     */
    if (
      job.status ===
      "queued"
    ) {
      const claimed =
        await claimCollectionDispatch(
          job.id,
        );

      if (claimed) {
        const latest =
          await getCollectionJob(
            job.id,
          );

        if (!latest) {
          throw new Error(
            "Collection job disappeared before dispatch.",
          );
        }

        const collectionKey =
          buildCollectionKey(
            {
              query:
                latest.query,

              country:
                latest.country,

              platform:
                latest.platform,

              mode:
                latest.mode,
            },
          );

        const dispatchBucket =
          Math.floor(
            Date.now() /
              600_000,
          );

        /*
         * IMPORTANT:
         *
         * advertiserPageId is now part of the queue payload.
         *
         * Previously the selected Page ID stopped at the browser.
         */
        await send(
          "adspy-collection",
          {
            jobId:
              latest.id,

            query:
              latest.query,

            country:
              latest.country,

            platform:
              latest.platform,

            mode:
              latest.mode,

            collectionKey,

            collectionDepth,

            advertiserPageId:
              normalizedAdvertiserPageId ??
              null,
          },
          {
            idempotencyKey:
              `${collectionKey}:dispatch:${dispatchBucket}`,

            retentionSeconds:
              24 * 60 * 60,
          },
        );

        console.info(
          "[AdSpy refresh] Collection dispatched:",
          {
            jobId:
              latest.id,

            query:
              latest.query,

            country:
              latest.country,

            platform:
              latest.platform,

            mode:
              latest.mode,

            collectionDepth,

            advertiserPageId:
              normalizedAdvertiserPageId ??
              null,
          },
        );

        job =
          latest;
      }
    }

    const freshJob =
      await getCollectionJob(
        job.id,
      );

    const finalJob =
      freshJob ??
      job;

    return NextResponse.json(
      {
        success: true,

        job:
          mapJob(
            finalJob,
          ),

        isRefreshing:
          isActiveStatus(
            finalJob.status,
          ),

        collectionDepth,

        advertiserPageId:
          normalizedAdvertiserPageId ??
          null,
      },
    );
  } catch (error) {
    console.error(
      "[AdSpy refresh] Failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Background refresh could not be started.",
      },
      {
        status: 500,
      },
    );
  }
}