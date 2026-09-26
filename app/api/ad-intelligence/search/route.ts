import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { parseAdSort, searchGlobalAdsAccurate } from "@/lib/ad-intelligence/global/accurate-search";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import type { AdPlatform } from "@/lib/ad-intelligence/types";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function platform(value: string | null): AdPlatform {
  return value === "google" || value === "linkedin" ? value : "meta";
}
function mode(value: string | null): "advertiser" | "keyword" {
  return value === "keyword" ? "keyword" : "advertiser";
}
function country(value: string | null): string {
  const value2 = (value ?? "IN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value2) ? value2 : "IN";
}
function pageId(value: string | null): string | undefined {
  const value2 = (value ?? "").trim();
  return /^\d+$/.test(value2) ? value2 : undefined;
}
function page(value: string | null): number {
  const n = Number(value ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
function textFilter(value: string | null, maxLength = 100): string | undefined {
  const value2 = (value ?? "").trim().slice(0, maxLength);
  return value2 || undefined;
}
function creativeType(value: string | null): "video" | "image" | "carousel" | undefined {
  return value === "video" || value === "image" || value === "carousel" ? value : undefined;
}
function activeStatus(value: string | null): "active" | "inactive" | undefined {
  return value === "active" || value === "inactive" ? value : undefined;
}

export async function GET(request: NextRequest) {
  const userId = await getVerifiedUserId(await createServerAuthClient());

  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const c = country(params.get("country"));
  const p = platform(params.get("platform"));
  const m = mode(params.get("mode"));
  const pg = page(params.get("page"));
  const pid = pageId(params.get("pageId"));
  const language = textFilter(params.get("language"), 32);
  const region = textFilter(params.get("region"), 100);
  const creativeTypeValue = creativeType(params.get("creativeType"));
  const activeStatusValue = activeStatus(params.get("activeStatus"));
  // Whitelisted: relevant | newest | longest | stopped (anything else = relevant).
  const sort = parseAdSort(params.get("sort"));

  if (q.length < 2) {
    return NextResponse.json({
      success: true,
      query: q,
      country: c,
      platform: p,
      mode: m,
      pageId: pid ?? null,
      language: language ?? null,
      region: region ?? null,
      creativeType: creativeTypeValue ?? null,
      activeStatus: activeStatusValue ?? null,
      sort,
      ads: [],
      total: 0,
      page: 1,
      limit: PAGE_SIZE,
      totalPages: 0,
      dataSource: "indexed",
    });
  }

  try {
    const result = await searchGlobalAdsAccurate({
      query: q,
      country: c,
      platform: p,
      mode: m,
      page: pg,
      limit: PAGE_SIZE,
      advertiserPageId: pid,
      language,
      region,
      creativeType: creativeTypeValue,
      activeStatus: activeStatusValue,
      sort,
    });

    return NextResponse.json(
      {
        success: true,
        query: q,
        country: c,
        platform: p,
        mode: m,
        pageId: pid ?? null,
        language: language ?? null,
        region: region ?? null,
        creativeType: creativeTypeValue ?? null,
        activeStatus: activeStatusValue ?? null,
        sort,
        ...result,
        limit: PAGE_SIZE,
        dataSource: "indexed",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=2, stale-while-revalidate=10",
        },
      },
    );
  } catch (error) {
    console.error("[AdSpy search]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Search failed.",
      },
      { status: 500 },
    );
  }
}
