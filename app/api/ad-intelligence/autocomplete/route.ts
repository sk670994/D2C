import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  checkRateLimit,
} from "@/lib/rate-limit";

import {
  discoverAdvertisers,
  type AdvertiserDiscoveryResult,
} from "@/lib/ad-intelligence/discovery/advertiser-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuerySuggestion = {
  id: string;
  label: string;
  type: "query";
};

function normalizeQuery(
  value: string | null,
): string {
  return (
    value ?? ""
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function querySuggestion(
  query: string,
): QuerySuggestion {
  return {
    id: `query:${query.toLowerCase()}`,
    label: query,
    type: "query",
  };
}

function advertiserSuggestion(
  item: AdvertiserDiscoveryResult,
) {
  return {
    id: item.id,
    pageId: item.pageId,
    label: item.label,
    type:
      "advertiser" as const,
    domain: item.domain,
    profileUrl:
      item.profileUrl,
    profileImageUrl:
      item.profileImageUrl,
    category:
      item.category,
    verification:
      item.verification,
    likes: item.likes,
    igFollowers:
      item.igFollowers,
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
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
        `adspy-autocomplete:${user.id}`,
        45,
        60_000,
      );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many autocomplete requests.",
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
      normalizeQuery(
        params.get("q"),
      );

    const platform =
      params.get(
        "platform",
      ) === "google"
        ? "google"
        : params.get(
              "platform",
            ) === "linkedin"
          ? "linkedin"
          : "meta";

    const country =
      (
        params.get(
          "country",
        ) ??
        "IN"
      )
        .trim()
        .toUpperCase();

    if (
      query.length < 2
    ) {
      return NextResponse.json({
        success: true,
        query: {
          id: "",
          label: query,
          type: "query",
        },
        advertisers: [],
        suggestions: [],
      });
    }

    /*
     * IMPORTANT:
     *
     * This route reads the local advertiser index.
     * It does NOT call SearchApi.
     *
     * The index is populated from collected Meta creatives.
     */
    const advertisers =
      await discoverAdvertisers({
        query,
        platform,
        country,
        limit: 8,
      });

    const exact =
      querySuggestion(query);

    const mapped =
      advertisers.map(
        advertiserSuggestion,
      );

    return NextResponse.json(
      {
        success: true,

        query: exact,

        advertisers:
          mapped,

        suggestions: [
          exact,
          ...mapped,
        ],
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=10, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error(
      "[AdSpy autocomplete]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Autocomplete unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}