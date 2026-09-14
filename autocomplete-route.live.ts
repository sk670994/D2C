import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  discoverAdvertisers,
  type AdvertiserDiscoveryResult,
} from "@/lib/ad-intelligence/discovery/advertiser-discovery";
import { searchMetaPages, type MetaPageSearchResult } from "@/lib/ad-intelligence/global/meta-page-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuerySuggestion = {
  id: string;
  label: string;
  type: "query";
};

function normalizeQuery(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compact(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function querySuggestion(query: string): QuerySuggestion {
  return {
    id: `query:${query.toLowerCase()}`,
    label: query,
    type: "query",
  };
}

function mapLocal(item: AdvertiserDiscoveryResult) {
  return {
    id: item.id,
    pageId: item.pageId,
    label: item.label,
    type: "advertiser" as const,
    domain: item.domain,
    profileUrl: item.profileUrl,
    profileImageUrl: item.profileImageUrl,
    category: item.category,
    verification: item.verification,
    likes: compact(item.likes),
    igFollowers: compact(item.igFollowers),
    source: "local" as const,
  };
}

function mapLive(page: MetaPageSearchResult, country: string) {
  return {
    id: `meta:${page.pageId}`,
    pageId: page.pageId,
    label: page.name,
    type: "advertiser" as const,
    domain: page.igUsername ? `https://instagram.com/${encodeURIComponent(page.igUsername)}` : null,
    profileUrl: page.pageAlias ? `https://www.facebook.com/${page.pageAlias}` : null,
    profileImageUrl: page.imageUrl ?? null,
    category: page.category ?? null,
    verification: page.verification ?? null,
    likes: compact(page.likes),
    igFollowers: compact(page.igFollowers),
    source: "live" as const,
    country,
  };
}

function rank(q: string, label: string): number {
  const query = q.toLowerCase().trim();
  const name = label.toLowerCase().trim();

  if (name === query) return 10000;
  if (name.startsWith(query)) return 9000;
  if (name.split(/[\s'’._-]+/).some((word) => word.startsWith(query))) return 8000;
  if (name.includes(query)) return 6500;

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every((token) => name.includes(token))) return 5000;
  return 0;
}

function dedupeAndRank(
  query: string,
  candidates: Array<ReturnType<typeof mapLocal> | ReturnType<typeof mapLive>>,
  limit: number,
) {
  const byPage = new Map<string, (typeof candidates)[number]>();
  const byLabel = new Map<string, (typeof candidates)[number]>();

  for (const candidate of candidates) {
    const pageId = candidate.pageId?.trim();
    const labelKey = candidate.label.trim().toLowerCase();

    if (pageId) {
      const current = byPage.get(pageId);
      if (!current || candidate.source === "live") byPage.set(pageId, candidate);
    } else if (!byLabel.has(labelKey)) {
      byLabel.set(labelKey, candidate);
    }
  }

  const merged = [...byPage.values(), ...byLabel.values()];

  return merged
    .map((item) => ({
      ...item,
      score:
        rank(query, item.label) +
        (item.source === "live" ? 300 : 0) +
        (item.verification?.toUpperCase() === "VERIFIED" ? 100 : 0) +
        Math.min(
          100,
          Math.log10(
            Math.max(item.likes ?? 0, 0) +
              Math.max(item.igFollowers ?? 0, 0) +
              1,
          ) * 10,
        ),
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const {
      data: { user },
      error,
    } = await auth.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit(`adspy-autocomplete:${user.id}`, 60, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many autocomplete requests." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
    const platform =
      request.nextUrl.searchParams.get("platform") === "google"
        ? "google"
        : request.nextUrl.searchParams.get("platform") === "linkedin"
          ? "linkedin"
          : "meta";

    const country = (request.nextUrl.searchParams.get("country") ?? "IN").trim().toUpperCase();

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        query: querySuggestion(query),
        advertisers: [],
        suggestions: [],
      });
    }

    /*
     * Live Meta page search is deliberately started at the same time as the
     * local index. The live result is used for current advertiser discovery;
     * the local index remains a low-latency fallback.
     */
    const [liveResult, localResult] = await Promise.allSettled([
      platform === "meta" ? searchMetaPages(query, country) : Promise.resolve([] as MetaPageSearchResult[]),
      discoverAdvertisers({ query, platform, country, limit: 12 }),
    ]);

    const livePages =
      liveResult.status === "fulfilled" ? liveResult.value : [];
    const localAdvertisers =
      localResult.status === "fulfilled" ? localResult.value : [];

    const candidates = [
      ...livePages.map((page) => mapLive(page, country)),
      ...localAdvertisers.map(mapLocal),
    ];

    const advertisers = dedupeAndRank(query, candidates, 12);

    return NextResponse.json(
      {
        success: true,
        query: querySuggestion(query),
        advertisers,
        suggestions: [querySuggestion(query), ...advertisers],
        source: livePages.length ? "live+local" : "local-fallback",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=3, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("[AdSpy autocomplete]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Autocomplete unavailable.",
      },
      { status: 503 },
    );
  }
}
