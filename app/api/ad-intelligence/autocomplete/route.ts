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
type SearchMode = "advertiser" | "keyword";

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
  domain?: string | null;
};

function normalizePlatform(value: string | null): Platform {
  if (value === "google" || value === "linkedin") {
    return value;
  }

  return "meta";
}

function normalizeMode(value: string | null): SearchMode {
  return value === "keyword" ? "keyword" : "advertiser";
}

function escapeLike(value: string): string {
  return value
    .replace(/\\/g, " ")
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankSuggestions(
  items: Suggestion[],
  query: string,
): Suggestion[] {
  const q = query.toLocaleLowerCase().trim();
  const seen = new Set<string>();

  return items
    .filter((item) => item.label.trim().length > 0)
    .filter((item) => {
      const key = `${item.type}:${item.label
        .trim()
        .toLocaleLowerCase()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((item) => {
      const label = item.label.trim().toLocaleLowerCase();
      let score = 0;

      if (label === q) score += 10_000;
      if (label.startsWith(q)) score += 5_000;

      const wordStartsWithQuery = label
        .split(/\s+/)
        .some((word) => word.startsWith(q));

      if (wordStartsWithQuery) score += 2_500;
      if (label.includes(q)) score += 1_000;

      if (item.type === "advertiser") {
        score += 100;
      }

      return {
        item,
        score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.item.label.localeCompare(
        b.item.label,
        undefined,
        { sensitivity: "base" },
      );
    })
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
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
          suggestions: [],
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(
      `autocomplete:${user.id}`,
      30,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
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

    const query = (
      params.get("q") ?? ""
    ).trim();

    const platform = normalizePlatform(
      params.get("platform"),
    );

    const mode = normalizeMode(
      params.get("mode"),
    );

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const escaped = escapeLike(query);

    if (!escaped) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const client = createGlobalServiceClient();

    const normalizedQuery = escaped
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const [brandResult, creativeResult] =
  await Promise.all([
    client
      .from("ad_intelligence_brands")
      .select(
        "id,canonical_name,normalized_name,domain",
      )
      .ilike(
        "normalized_name",
        `%${normalizedQuery}%`,
      )
      .limit(12),

    client
      .from("ad_intelligence_creatives")
      .select(
        "id,advertiser_id,advertiser_name,creator_name,headline,product_name",
      )
      .eq("platform", platform)
      .or(
        mode === "advertiser"
          ? `advertiser_name.ilike.%${escaped}%`
          : [
              `advertiser_name.ilike.%${escaped}%`,
              `creator_name.ilike.%${escaped}%`,
              `headline.ilike.%${escaped}%`,
              `product_name.ilike.%${escaped}%`,
            ].join(","),
      )
      .limit(50),
  ]);

    if (brandResult.error) {
      throw new Error(
        `Brand autocomplete failed: ${brandResult.error.message}`,
      );
    }

    if (creativeResult.error) {
      throw new Error(
        `Creative autocomplete failed: ${creativeResult.error.message}`,
      );
    }

    const suggestions: Suggestion[] = [];

    for (const brand of brandResult.data ?? []) {
      const label = String(
        brand.canonical_name ?? "",
      ).trim();

      if (!label) {
        continue;
      }

      suggestions.push({
        id: String(brand.id),
        label,
        type: "advertiser",
        domain: brand.domain ?? null,
      });
    }

    for (const row of creativeResult.data ?? []) {
      const advertiser = String(
        row.advertiser_name ?? "",
      ).trim();

      if (advertiser) {
        suggestions.push({
          id: String(
            row.advertiser_id ??
              `${row.id}:advertiser`,
          ),
          label: advertiser,
          type: "advertiser",
        });
      }

      if (mode !== "keyword") {
        continue;
      }

      const creator = String(
        row.creator_name ?? "",
      ).trim();

      if (creator) {
        suggestions.push({
          id: `${row.id}:creator`,
          label: creator,
          type: "creator",
        });
      }

      const headline = String(
        row.headline ?? "",
      ).trim();

      if (headline) {
        suggestions.push({
          id: `${row.id}:headline`,
          label: headline,
          type: "keyword",
        });
      }

      const productName = String(
        row.product_name ?? "",
      ).trim();

      if (productName) {
        suggestions.push({
          id: `${row.id}:product`,
          label: productName,
          type: "keyword",
        });
      }
    }

    return NextResponse.json({
      success: true,
      suggestions: rankSuggestions(
        suggestions,
        query,
      ),
    });
  } catch (error) {
    console.error(
      "[AdSpy autocomplete]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
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