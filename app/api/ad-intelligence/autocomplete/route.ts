import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

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

    const [brandsResult, aliasesResult, creatorsResult, creativesResult] =
      await Promise.all([
        client
          .from("ad_intelligence_brands")
          .select("id,canonical_name")
          .ilike("canonical_name", `%${escaped}%`)
          .limit(40),
        client
          .from("ad_intelligence_brand_aliases")
          .select("brand_id,alias")
          .ilike("alias", `%${escaped}%`)
          .limit(40),
        mode === "keyword"
          ? client
              .from("ad_intelligence_creators")
              .select("id,canonical_name")
              .ilike("canonical_name", `%${escaped}%`)
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
        client
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
          .limit(100),
      ]);

    for (const result of [
      brandsResult,
      aliasesResult,
      creatorsResult,
      creativesResult,
    ]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    const suggestions: Suggestion[] = [];

    for (const row of brandsResult.data ?? []) {
      suggestions.push({
        id: String(row.id),
        label: String(row.canonical_name ?? "").trim(),
        type: "advertiser",
      });
    }

    for (const row of aliasesResult.data ?? []) {
      suggestions.push({
        id: String(row.brand_id ?? row.alias),
        label: String(row.alias ?? "").trim(),
        type: "advertiser",
      });
    }

    if (mode === "keyword") {
      for (const row of creatorsResult.data ?? []) {
        suggestions.push({
          id: String(row.id),
          label: String(row.canonical_name ?? "").trim(),
          type: "creator",
        });
      }
    }

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
