import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
};

function escapeLike(value: string) {
  return value.replace(/[%,_]/g, " ").replace(/\s+/g, " ").trim();
}

function rankSuggestions(items: Suggestion[], query: string) {
  const q = query.toLocaleLowerCase();
  const seen = new Set<string>();

  return items
    .filter((item) => {
      const label = item.label.trim();
      if (!label) return false;

      const key = `${item.type}:${label.toLocaleLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const label = item.label.trim().toLocaleLowerCase();
      let score = 0;

      if (label === q) score += 10000;
      if (label.startsWith(q)) score += 5000;
      if (label.split(/\s+/).some((word) => word.startsWith(q))) score += 2500;
      if (label.includes(q)) score += 1000;
      if (item.type === "advertiser") score += 100;

      return { item, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.label.localeCompare(b.item.label, undefined, {
        sensitivity: "base",
      });
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
        { success: false, suggestions: [], error: "Unauthorized" },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(`autocomplete:${user.id}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, suggestions: [], error: "Too many autocomplete requests." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const mode =
      request.nextUrl.searchParams.get("mode") === "keyword"
        ? "keyword"
        : "advertiser";

    if (q.length < 2) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    const escaped = escapeLike(q);
    if (!escaped) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    const client = createGlobalServiceClient();

    const creativesResult = await client
      .from("ad_intelligence_creatives")
      .select(
        "id,advertiser_id,advertiser_name,creator_name,headline,product_name",
      )
      .eq("platform", "meta")
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
      .limit(40);

    if (creativesResult.error) {
      throw new Error(creativesResult.error.message);
    }

    const suggestions: Suggestion[] = [];

    for (const row of creativesResult.data ?? []) {
      const advertiser = String(row.advertiser_name ?? "").trim();
      if (advertiser) {
        suggestions.push({
          id: String(row.advertiser_id ?? `${row.id}:advertiser`),
          label: advertiser,
          type: "advertiser",
        });
      }

      if (mode === "keyword") {
        const creator = String(row.creator_name ?? "").trim();
        if (creator) {
          suggestions.push({
            id: `${row.id}:creator`,
            label: creator,
            type: "creator",
          });
        }

        for (const [field, value] of [
          ["headline", row.headline],
          ["product", row.product_name],
        ] as const) {
          const label = String(value ?? "").trim();
          if (label) {
            suggestions.push({
              id: `${row.id}:${field}`,
              label,
              type: "keyword",
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      suggestions: rankSuggestions(suggestions, q),
    });
  } catch (error) {
    console.error("[AdSpy autocomplete]", error);

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
