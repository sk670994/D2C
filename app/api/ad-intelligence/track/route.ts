import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import type {
  AdPlatform,
} from "@/lib/ad-intelligence/types";

import {
  buildCollectionKey,
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  normalizeCollectionQuery,
  trackBrand,
} from "@/lib/ad-intelligence/global/store";

import type {
  CollectionDepth,
} from "@/lib/ad-intelligence/provider";

import type {
  CollectionJob,
} from "@/lib/ad-intelligence/global/types";

import { send } from "@vercel/queue";

import { checkRateLimit } from "@/lib/rate-limit";

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

function normalizeQuery(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function normalizeCountry(
  value: unknown,
) {
  return String(
    value ?? "IN",
  )
    .trim()
    .toUpperCase();
}

function validCountry(
  value: string,
) {
  return (
    value.length === 2 &&
    /^[A-Z]{2}$/.test(
      value,
    )
  );
}

async function getUser() {
  const auth =
    await createServerAuthClient();

  const {
    data: { user },
    error,
  } =
    await auth.auth.getUser();

  if (
    error ||
    !user
  ) {
    return {
      auth,
      user: null,
    };
  }

  return {
    auth,
    user,
  };
}

function mapJob(
  job: CollectionJob,
) {
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

function chooseCollectionDepth(
  platform: AdPlatform,
  job: CollectionJob,
): CollectionDepth {
  /*
   * Tracking is an explicit user action.
   *
   * For a brand that has never been collected:
   * use quick Meta discovery so the initial dataset becomes
   * available as soon as possible.
   *
   * Existing tracked data gets a deep refresh.
   */
  if (
    platform === "meta" &&
    Number(
      job.discoveredAds ?? 0,
    ) === 0
  ) {
    return "quick";
  }

  return "deep";
}

function buildDispatchIdempotencyKey(
  collectionKey: string,
) {
  /*
   * Vercel Queues provides at-least-once delivery.
   *
   * Keep the idempotency window short enough that a legitimate
   * later refresh is still allowed to enqueue another job.
   */
  const dispatchBucket =
    Math.floor(
      Date.now() / 600_000,
    );

  return `${collectionKey}:dispatch:${dispatchBucket}`;
}

async function dispatchIfQueued(
  job: CollectionJob,
  collectionDepth: CollectionDepth,
) {
  if (
    job.status !== "queued"
  ) {
    return {
      job,
      dispatched: false,
    };
  }

  const claimed =
    await claimCollectionDispatch(
      job.id,
    );

  if (!claimed) {
    const current =
      await getCollectionJob(
        job.id,
      );

    return {
      job: current ?? job,
      dispatched: false,
    };
  }

  const latest =
    await getCollectionJob(
      job.id,
    );

  if (!latest) {
    throw new Error(
      "Collection job disappeared after tracking.",
    );
  }

  const collectionKey =
    buildCollectionKey({
      query: latest.query,
      country: latest.country,
      platform: latest.platform,
      mode: latest.mode,
    });

  await send(
    "adspy-collection",
    {
      jobId: latest.id,
      query: latest.query,
      country: latest.country,
      platform: latest.platform,
      mode: latest.mode,
      collectionKey,
      collectionDepth,
    },
    {
      idempotencyKey:
        buildDispatchIdempotencyKey(
          collectionKey,
        ),
      retentionSeconds:
        24 * 60 * 60,
    },
  );

  return {
    job: latest,
    dispatched: true,
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    const {
      auth,
      user,
    } = await getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const query =
      normalizeQuery(
        request.nextUrl.searchParams.get(
          "query",
        ),
      );

    const country =
      normalizeCountry(
        request.nextUrl.searchParams.get(
          "country",
        ),
      );

    const platform =
      normalizePlatform(
        request.nextUrl.searchParams.get(
          "platform",
        ),
      );

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing query.",
        },
        { status: 400 },
      );
    }

    if (
      !validCountry(
        country,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid country code.",
        },
        { status: 400 },
      );
    }

    const normalizedQuery =
      normalizeCollectionQuery(
        query,
      );

    const {
      data,
      error,
    } =
      await auth
        .from(
          "ad_intelligence_tracked_brands",
        )
        .select(
          "id,query,country,platform,active,last_collected_at,refresh_hours",
        )
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "normalized_query",
          normalizedQuery,
        )
        .eq(
          "country",
          country,
        )
        .eq(
          "platform",
          platform,
        )
        .eq(
          "active",
          true,
        )
        .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to load tracking state: ${error.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      tracked: Boolean(data),
      id:
        data?.id ??
        null,
      lastCollectedAt:
        data?.last_collected_at ??
        null,
      refreshHours:
        data?.refresh_hours ??
        24,
    });
  } catch (error) {
    console.error(
      "[Track GET]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load tracking state.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const {
      user,
    } = await getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate =
      checkRateLimit(
        `track:${user.id}`,
        10,
        60_000,
      );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many tracking requests.",
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

    const body =
      await request.json();

    const query =
      normalizeQuery(
        body?.query,
      );

    const country =
      normalizeCountry(
        body?.country,
      );

    const platform =
      normalizePlatform(
        body?.platform,
      );

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing query.",
        },
        { status: 400 },
      );
    }

    if (
      !validCountry(
        country,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid country code.",
        },
        { status: 400 },
      );
    }

    await trackBrand({
      userId: user.id,
      query,
      country,
      platform,
    });

    let job =
      await getOrCreateCollectionJob({
        query,
        country,
        platform,
        mode: "advertiser",
        userId: user.id,
      });

    const collectionDepth =
      chooseCollectionDepth(
        platform,
        job,
      );

    const dispatchResult =
      await dispatchIfQueued(
        job,
        collectionDepth,
      );

    job =
      dispatchResult.job;

    return NextResponse.json({
      success: true,
      tracked: true,
      jobId: job.id,
      dispatched:
        dispatchResult.dispatched,
      collectionDepth,
      job: mapJob(job),
    });
  } catch (error) {
    console.error(
      "[Track POST]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to track competitor.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  try {
    const {
      auth,
      user,
    } = await getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate =
      checkRateLimit(
        `track:${user.id}`,
        10,
        60_000,
      );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many tracking requests.",
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

    const query =
      normalizeQuery(
        request.nextUrl.searchParams.get(
          "query",
        ),
      );

    const country =
      normalizeCountry(
        request.nextUrl.searchParams.get(
          "country",
        ),
      );

    const platform =
      normalizePlatform(
        request.nextUrl.searchParams.get(
          "platform",
        ),
      );

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing query.",
        },
        { status: 400 },
      );
    }

    if (
      !validCountry(
        country,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid country code.",
        },
        { status: 400 },
      );
    }

    const normalizedQuery =
      normalizeCollectionQuery(
        query,
      );

    const {
      error,
    } =
      await auth
        .from(
          "ad_intelligence_tracked_brands",
        )
        .update({
          active: false,
        })
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "normalized_query",
          normalizedQuery,
        )
        .eq(
          "country",
          country,
        )
        .eq(
          "platform",
          platform,
        );

    if (error) {
      throw new Error(
        `Failed to stop tracking: ${error.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      tracked: false,
    });
  } catch (error) {
    console.error(
      "[Track DELETE]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to stop tracking.",
      },
      { status: 500 },
    );
  }
}