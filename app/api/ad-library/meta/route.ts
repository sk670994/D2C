import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v18.0";
const META_AD_LIBRARY_FIELDS = [
  "ad_archive_id",
  "ad_id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "publisher_platforms"
].join(",");

type MetaLibraryAd = {
  ad_archive_id?: string;
  ad_id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
};

function getMetaLibraryToken() {
  if (process.env.META_AD_LIBRARY_ACCESS_TOKEN) return process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    return `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  }
  return "";
}

export async function GET(request: NextRequest) {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const country = (searchParams.get("country") || "IN").trim().toUpperCase();
  const parsedLimit = Number(searchParams.get("limit") || 20);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 50) : 20;
  const accessToken = getMetaLibraryToken();

  if (!query) {
    return NextResponse.json({ error: "Search query is required" }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Missing Meta Ad Library access token" }, { status: 500 });
  }

  const params = new URLSearchParams({
    search_terms: query,
    ad_type: "ALL",
    ad_active_status: "ACTIVE",
    ad_reached_countries: JSON.stringify([country]),
    fields: META_AD_LIBRARY_FIELDS,
    limit: String(limit),
    access_token: accessToken
  });

  try {
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/ads_archive?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    const data = await response.json();

    if (!response.ok) {
      const providerError = data?.error;
      return NextResponse.json(
        {
          error: providerError?.message || "Failed to search Meta Ad Library",
          provider: "meta",
          providerCode: providerError?.code ?? null,
          providerType: providerError?.type ?? null
        },
        { status: response.status }
      );
    }

    const ads = ((data.data || []) as MetaLibraryAd[]).map((ad) => ({
    id: ad.ad_archive_id || ad.ad_id,
    platform: "meta",
    pageId: ad.page_id,
    pageName: ad.page_name,
    body: ad.ad_creative_bodies?.[0] || "",
    title: ad.ad_creative_link_titles?.[0] || "",
    caption: ad.ad_creative_link_captions?.[0] || "",
    startedAt: ad.ad_delivery_start_time,
    stoppedAt: ad.ad_delivery_stop_time,
    snapshotUrl: ad.ad_snapshot_url,
    publisherPlatforms: ad.publisher_platforms || []
  }));

    return NextResponse.json({
      provider: "meta",
      query,
      country,
      ads,
      paging: data.paging || null
    });
  } catch (error) {
    console.error("Meta Ad Library request failed:", error);
    return NextResponse.json(
      { error: "Unable to reach Meta Ad Library. Check the token and Meta app access." },
      { status: 502 }
    );
  }
}
