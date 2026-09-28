import { NextRequest, NextResponse } from "next/server";

import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { containmentFilter, hasFilters, parseFinderQuery } from "@/lib/decode/finder";
import { normalizeDecoded } from "@/lib/decode/taxonomy";
import { cached } from "@/lib/today/cache";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60_000;

type AdRow = {
  id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  creative_type: string | null;
  headline: string | null;
  primary_text: string | null;
  offer: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  first_seen_at: string | null;
};

/**
 * Live ads matching AI labels, e.g. ?hookType=offer&language=hinglish&offer=1
 * (&pageId=… for one brand, &scope=watched for your rivals). Reads only our
 * own index: no paid API is called on a user search.
 */
export async function GET(request: NextRequest) {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const q = parseFinderQuery(request.nextUrl.searchParams);
  if (!hasFilters(q)) return NextResponse.json({ success: false, error: "Pick at least one label." }, { status: 400 });
  const client = createGlobalServiceClient();

  let scopeIds: string[] | null = q.pageId ? [q.pageId] : null;
  if (!scopeIds && q.watchedOnly) {
    const { data } = await client.from("adspy_advertiser_watchlists").select("advertiser_id").eq("user_id", userId).eq("platform", "meta").limit(100);
    scopeIds = Array.from(new Set((data ?? []).map((r) => String((r as { advertiser_id: unknown }).advertiser_id)).filter((id) => /^\d+$/.test(id))));
    if (!scopeIds.length) return NextResponse.json({ success: true, ads: [], note: "Watch a few rivals first." });
  }

  const filter = containmentFilter(q);
  const cacheKey = `find:${JSON.stringify(filter)}:${(scopeIds ?? []).join(",")}:${q.limit}`;
  try {
    const ads = await cached(cacheKey, TTL_MS, async () => {
      let decodes = client.from("ad_creative_decodes").select("creative_id,elements").eq("status", "done").contains("elements", filter);
      if (scopeIds) decodes = decodes.in("advertiser_id", scopeIds);
      const { data: matched, error } = await decodes.order("decoded_at", { ascending: false }).limit(400);
      if (error) throw new Error(error.message);
      const labels = new Map(((matched ?? []) as Array<{ creative_id: string; elements: unknown }>).map((r) => [String(r.creative_id), normalizeDecoded(r.elements)]));
      if (!labels.size) return [];
      const ids = Array.from(labels.keys());
      const rows: AdRow[] = [];
      for (let i = 0; i < ids.length && rows.length < q.limit * 2; i += 150) {
        const { data, error: adError } = await client
          .from("ad_intelligence_creatives")
          .select("id,advertiser_id,advertiser_name,creative_type,headline,primary_text,offer,thumbnail_url,image_url,first_seen_at")
          .in("id", ids.slice(i, i + 150))
          .eq("is_currently_active", true);
        if (adError) throw new Error(adError.message);
        rows.push(...((data ?? []) as AdRow[]));
      }
      return rows
        .sort((a, b) => Date.parse(b.first_seen_at ?? "") - Date.parse(a.first_seen_at ?? "") || 0)
        .slice(0, q.limit)
        .map((row) => ({ ...row, labels: labels.get(row.id) ?? null }));
    });
    return NextResponse.json({ success: true, ads });
  } catch (error) {
    console.error("[finder]", error);
    return NextResponse.json({ success: false, error: "Search failed. Try fewer labels." }, { status: 500 });
  }
}
