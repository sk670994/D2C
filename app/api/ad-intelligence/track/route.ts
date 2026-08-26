import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import type { AdPlatform } from "@/lib/ad-intelligence/types";

import {
  buildCollectionKey,
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  trackBrand,
} from "@/lib/ad-intelligence/global/store";

import { inngest } from "@/inngest/client";

const PLATFORMS: AdPlatform[] = [
  "meta",
  "google",
  "linkedin",
];

function normalizePlatform(
  value: unknown,
): AdPlatform {
  const normalized =
    String(
      value ?? "meta",
    )
      .trim()
      .toLowerCase();

  return PLATFORMS.includes(
    normalized as AdPlatform,
  )
    ? (normalized as AdPlatform)
    : "meta";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const body =
      await request.json();

    const query =
      String(
        body?.query ?? "",
      ).trim();

    const country =
      String(
        body?.country ?? "IN",
      )
        .trim()
        .toUpperCase();

    const platform =
      normalizePlatform(
        body?.platform,
      );

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing query.",
        },
        { status: 400 },
      );
    }

    await trackBrand({
      userId:
        user.id,

      query,

      country,

      platform,
    });

    const job =
      await getOrCreateCollectionJob({
        query,
        country,
        platform,
        mode:
          "advertiser",
      });

    let dispatched = false;

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
            "Collection job disappeared after tracking.",
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
          },
        });

        dispatched = true;
      }
    }

    return NextResponse.json({
      success: true,
      tracked: true,
      jobId:
        job.id,
      dispatched,
    });
  } catch (error) {
    console.error(
      "[AdIntelligenceTrack] Failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to track brand.",
      },
      { status: 500 },
    );
  }
}
