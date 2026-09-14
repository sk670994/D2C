import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import {
  discoverAdvertisers,
  type AdvertiserDiscoveryResult,
} from "@/lib/ad-intelligence/discovery/advertiser-discovery";
import {
  searchMetaPages,
  inferDomain,
} from "@/lib/ad-intelligence/global/meta-page-search";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relevant(query: string, label: string, domain?: string | null): boolean {
  const q = normalize(query);
  const l = normalize(label);
  const d = normalize(domain ?? "");

  if (!q || !l) return false;
  if (l === q || l.startsWith(q) || l.includes(q)) return true;
  if (d === q || d.startsWith(q) || d.includes(q)) return true;

  const terms = q.split(" ").filter(Boolean);
  return terms.length > 0 && terms.every((term) => l.includes(term));
}

function localItem(item: AdvertiserDiscoveryResult) {
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
    likes: item.likes,
    igFollowers: item.igFollowers,
    source: "indexed" as const,
    country: item.country,
  };
}

function metaItem(
  page: Awaited<ReturnType<typeof searchMetaPages>>[number],
  country: string,
) {
  return {
    id: `meta:${page.pageId}`,
    pageId: page.pageId,
    label: page.name,
    type: "advertiser" as const,
    domain: inferDomain(page),
    profileUrl: page.pageAlias
      ? `https://www.facebook.com/${page.pageAlias}`
      : null,
    profileImageUrl: page.imageUrl ?? null,
    category: page.category ?? null,
    verification: page.verification ?? null,
    likes: page.likes ?? null,
    igFollowers: page.igFollowers ?? null,
    source: "meta_public" as const,
    country,
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
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(
      `adspy-autocomplete:${user.id}`,
      120,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many autocomplete requests." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").replace(/\s+/g, " ").trim();
    const country = (params.get("country") ?? "IN").trim().toUpperCase();

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        advertisers: [],
        source: "none",
      });
    }

    const [metaSettled, localSettled] = await Promise.allSettled([
      searchMetaPages(query, country),
      discoverAdvertisers({
        query,
        platform: "meta",
        country,
        limit: 12,
      }),
    ]);

    const meta =
      metaSettled.status === "fulfilled"
        ? metaSettled.value
            .map((page) => metaItem(page, country))
            .filter((item) => relevant(query, item.label, item.domain))
        : [];

    const local =
      localSettled.status === "fulfilled"
        ? localSettled.value
            .map(localItem)
            .filter((item) => relevant(query, item.label, item.domain))
        : [];

    const seen = new Set<string>();
    const advertisers = [...meta, ...local]
      .filter((item) => {
        const key = item.pageId || normalize(item.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return NextResponse.json(
      {
        success: true,
        advertisers,
        source: meta.length ? "meta_public" : local.length ? "indexed" : "none",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=8, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("[AdSpy autocomplete]", error);
    return NextResponse.json(
      {
        success: false,
        advertisers: [],
        source: "none",
        error: error instanceof Error ? error.message : "Autocomplete unavailable.",
      },
      { status: 503 },
    );
  }
}
