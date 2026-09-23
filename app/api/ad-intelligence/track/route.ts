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
  normalizeCollectionQuery,
  trackBrand,
} from "@/lib/ad-intelligence/global/store";

import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";

import type {
  CollectionJob,
} from "@/lib/ad-intelligence/global/types";

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

    // Tracking is saved for every platform, but only Meta can be collected.
    if (platform !== "meta") {
      return NextResponse.json({
        success: true,
        tracked: true,
        jobId: null,
        dispatched: false,
        collectionDepth: null,
        job: null,
        message: "Tracked. Collection for this platform is not available yet.",
      });
    }

    const result = await startAdSpyCollection({
      userId: user.id,
      query,
      country,
      platform,
      mode: "advertiser",
      minIntervalMs: 10 * 60_000,
      reason: "track",
    });

    return NextResponse.json({
      success: true,
      tracked: true,
      jobId: result.job.id,
      dispatched: result.dispatched,
      outcome: result.outcome,
      collectionDepth: "quick",
      job: mapJob(result.job),
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
