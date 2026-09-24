import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { getSearchFacets } from "@/lib/ad-intelligence/global/facets";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

// Facet counts only change when new ads are collected; keep hot queries warm.
const FACET_TTL_MS = 3 * 60_000;
const facetCache = new Map<string, { at: number; facets: unknown }>();

function text(value: string | null, max: number): string | undefined {
  const v = (value ?? "").trim().slice(0, max);
  return v || undefined;
}

export async function GET(request: NextRequest) {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim();
  const countryRaw = (params.get("country") ?? "IN").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "IN";
  const mode = params.get("mode") === "keyword" ? "keyword" : "advertiser";
  const pageIdRaw = (params.get("pageId") ?? "").trim();
  const pageId = mode === "advertiser" && /^\d+$/.test(pageIdRaw) ? pageIdRaw : undefined;
  const typeRaw = params.get("creativeType");
  const statusRaw = params.get("activeStatus");

  if (query.length < 2 && !pageId) {
    return NextResponse.json({ success: true, facets: null });
  }

  const cacheKey = request.nextUrl.search;
  const hit = facetCache.get(cacheKey);
  if (hit && Date.now() - hit.at < FACET_TTL_MS) {
    return NextResponse.json({ success: true, facets: hit.facets }, { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" } });
  }

  try {
    const facets = await getSearchFacets({
      query,
      country,
      platform: "meta",
      mode,
      pageId,
      language: text(params.get("language"), 32),
      region: text(params.get("region"), 100),
      creativeType:
        typeRaw === "video" || typeRaw === "image" || typeRaw === "carousel" ? typeRaw : undefined,
      activeStatus: statusRaw === "active" || statusRaw === "inactive" ? statusRaw : undefined,
    });

    facetCache.set(cacheKey, { at: Date.now(), facets });
    if (facetCache.size > 500) facetCache.delete(facetCache.keys().next().value as string);
    return NextResponse.json(
      { success: true, facets },
      { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("[AdSpy facets]", error);
    return NextResponse.json(
      { success: false, error: "Could not load filter counts." },
      { status: 500 },
    );
  }
}
