import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/**
 * "Fresh this week": the newest indexed ads across all brands for a country.
 * Powers the AdSpy start screen so there is something worth looking at
 * before the first search. Cached per instance for 10 minutes.
 */

type Row = {
  id: string;
  external_ad_id: string | null;
  advertiser_name: string | null;
  advertiser_id: string | null;
  creative_type: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  primary_text: string | null;
  headline: string | null;
  call_to_action: string | null;
  landing_page_url: string | null;
  source_url: string | null;
  offer: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
};

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; ads: unknown[] }>();

export async function GET(request: NextRequest) {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const raw = (request.nextUrl.searchParams.get("country") ?? "IN").toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : "IN";
  const hit = cache.get(country);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ success: true, ads: hit.ads });
  }

  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data, error } = await createGlobalServiceClient()
    .from("ad_intelligence_creatives")
    .select(
      "id,external_ad_id,advertiser_name,advertiser_id,creative_type,image_url,video_url,thumbnail_url,primary_text,headline,call_to_action,landing_page_url,source_url,offer,first_seen_at,last_seen_at,is_currently_active,markets:ad_intelligence_markets!inner(country)",
    )
    .eq("platform", "meta")
    .eq("markets.country", country)
    .not("advertiser_id", "is", null)
    .not("thumbnail_url", "is", null)
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false })
    .limit(120);

  if (error) {
    console.error("[AdSpy fresh]", error.message);
    return NextResponse.json({ success: false, error: "Could not load fresh ads." }, { status: 500 });
  }

  // At most 2 ads per advertiser so one brand cannot fill the whole wall.
  const perBrand = new Map<string, number>();
  const ads = ((data ?? []) as unknown as Row[])
    .filter((row) => {
      const key = String(row.advertiser_id);
      const n = perBrand.get(key) ?? 0;
      if (n >= 2) return false;
      perBrand.set(key, n + 1);
      return true;
    })
    .slice(0, 16)
    .map((row) => {
      const first = row.first_seen_at ? new Date(row.first_seen_at).getTime() : NaN;
      const last = row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now();
      return {
        id: row.external_ad_id ?? row.id,
        platform: "meta",
        advertiserName: row.advertiser_name,
        advertiserId: row.advertiser_id,
        creativeType: row.creative_type ?? "unknown",
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url,
        primaryText: row.primary_text,
        headline: row.headline,
        callToAction: row.call_to_action,
        landingPage: row.landing_page_url,
        sourceUrl: row.source_url,
        offer: row.offer,
        firstSeen: row.first_seen_at,
        lastSeen: row.last_seen_at,
        isActive: row.is_currently_active,
        runningDays: Number.isFinite(first) ? Math.max(1, Math.round((last - first) / 86_400_000)) : null,
        country,
      };
    });

  cache.set(country, { at: Date.now(), ads });
  return NextResponse.json({ success: true, ads }, { headers: { "Cache-Control": "private, max-age=120" } });
}
