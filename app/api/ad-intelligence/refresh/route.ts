import { NextRequest, NextResponse } from "next/server";

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
import type { CollectionDepth } from "@/lib/ad-intelligence/provider";

import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

function isActiveStatus(
  status?: string | null,
) {
  return Boolean(
    status &&
      ACTIVE_STATUSES.includes(
        status as (typeof ACTIVE_STATUSES)[number],
      ),
  );
}

function mapJob(job: any) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    discoveredAds:
      Number(
        job.discoveredAds ?? 0,
      ),
    normalizedAds:
      Number(
        job.normalizedAds ?? 0,
      ),
    persistedAds:
      Number(
        job.persistedAds ?? 0,
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
      data: { user },
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
          error:
            "Unauthorized",
        },
        { status: 401 },
      );
    }

    const params =
      request.nextUrl.searchParams;

    const query =
      (
        params.get("q") ??
        ""
      ).trim();

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

    if (
      query.length < 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter at least 2 characters.",
        },
        { status: 400 },
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
        { status: 400 },
      );
    }

    let job =
      await getOrCreateCollectionJob({
        query,
        country,
        platform,
        mode,
      });

    /*
     * A completed/failed job may be eligible for another refresh.
     * The store applies the refresh interval atomically.
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
     * Quick-first policy:
     *
     * - No previously discovered creatives -> quick Meta discovery.
     * - Existing discovered creatives -> deep refresh.
     *
     * Non-Meta providers still receive "deep" because the current
     * quick/deep implementation is Meta-specific.
     */
    const collectionDepth: CollectionDepth =
      platform === "meta" &&
      Number(
        job.discoveredAds ?? 0,
      ) === 0
        ? "quick"
        : "deep";

    /*
     * Queue -> claim -> dispatch.
     *
     * claimCollectionDispatch prevents duplicate active dispatches
     * when multiple tabs/users hit the endpoint together.
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

        await inngest.send({
          name:
            "zooptrack/ad-intelligence.collection.requested",

          data: {
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

            collectionKey:
              buildCollectionKey({
                query:
                  latest.query,

                country:
                  latest.country,

                platform:
                  latest.platform,

                mode:
                  latest.mode,
              }),

            collectionDepth,
          },
        });

        job =
          latest;
      }
    }

    const freshJob =
      await getCollectionJob(
        job.id,
      );

    const finalJob =
      freshJob ?? job;

    return NextResponse.json({
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
    });
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
      { status: 500 },
    );
  }
}
