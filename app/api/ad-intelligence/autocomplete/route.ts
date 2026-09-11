 import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

type Platform = "meta" | "google" | "linkedin";

type AdvertiserSuggestion = {
  id: string;
  label: string;
  type: "advertiser";
  domain?: string | null;
};

type QuerySuggestion = {
  id: string;
  label: string;
  type: "query";
};

export type Suggestion = AdvertiserSuggestion | QuerySuggestion;

type AutocompleteResponse = {
  success: boolean;
  query: {
    id: string;
    label: string;
    type: "query";
  };
  advertisers: AdvertiserSuggestion[];
  suggestions: Suggestion[];
  error?: string;
};

function normalizePlatform(value: string | null): Platform {
  if (value === "google" || value === "linkedin") {
    return value;
  }

  return "meta";
}

function normalizeQuery(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}



function makeSuccessResponse(
  query: string,
  advertisers: AdvertiserSuggestion[],
): AutocompleteResponse {
  const querySuggestion: QuerySuggestion = {
    id: `query:${query.toLocaleLowerCase()}`,
    label: query,
    type: "query",
  };

  return {
    success: true,
    query: querySuggestion,
    advertisers,
    suggestions: [querySuggestion, ...advertisers],
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();

    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          query: {
            id: "",
            label: "",
            type: "query",
          },
          advertisers: [],
          suggestions: [],
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(
      `autocomplete:${user.id}`,
      60,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          query: {
            id: "",
            label: "",
            type: "query",
          },
          advertisers: [],
          suggestions: [],
          error: "Too many autocomplete requests.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              rate.retryAfterSeconds,
            ),
          },
        },
      );
    }

    const params = request.nextUrl.searchParams;

    const query = normalizeQuery(
      params.get("q"),
    );

    const platform = normalizePlatform(
      params.get("platform"),
    );

    if (query.length < 2) {
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

    const client = createGlobalServiceClient();

    const {
      data,
      error,
    } = await client.rpc(
      "adspy_autocomplete_advertisers",
      {
        p_query: query,
        p_platform: platform,
        p_limit: MAX_RESULTS,
      },
    );

    if (error) {
      throw new Error(
        `Autocomplete query failed: ${error.message}`,
      );
    }

    const advertisers: AdvertiserSuggestion[] = [];
    const seen = new Set<string>();

    for (const row of data ?? []) {
      const label = String(
        row.label ?? "",
      ).trim();

      if (!label) {
        continue;
      }

      const key = label.toLocaleLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      advertisers.push({
        id: String(row.id),
        label,
        type: "advertiser",
        domain:
          row.domain != null
            ? String(row.domain)
            : null,
      });

      if (advertisers.length >= MAX_RESULTS) {
        break;
      }
    }

    return NextResponse.json(
      makeSuccessResponse(
        query,
        advertisers,
      ),
    );
  } catch (error) {
    console.error(
      "[AdSpy autocomplete]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        query: {
          id: "",
          label: "",
          type: "query",
        },
        advertisers: [],
        suggestions: [],
        error:
          error instanceof Error
            ? error.message
            : "Autocomplete unavailable",
      },
      { status: 503 },
    );
  }
}