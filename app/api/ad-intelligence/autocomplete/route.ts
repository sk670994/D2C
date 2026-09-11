import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  inferDomain,
  normalizeAdvertiserName,
  searchMetaPages,
  type MetaPageSearchResult,
} from "@/lib/ad-intelligence/global/meta-page-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

type Platform = "meta" | "google" | "linkedin";

type AdvertiserSuggestion = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  domain?: string | null;
  profileUrl?: string | null;
  profileImageUrl?: string | null;
  category?: string | null;
  verification?: string | null;
  likes?: number | null;
  igFollowers?: number | null;
};

type QuerySuggestion = {
  id: string;
  label: string;
  type: "query";
};

type Suggestion = AdvertiserSuggestion | QuerySuggestion;

type AutocompleteResponse = {
  success: boolean;
  query: QuerySuggestion;
  advertisers: AdvertiserSuggestion[];
  suggestions: Suggestion[];
  source:
    | "local"
    | "meta_page_search"
    | "local+meta_page_search"
    | "none";
  error?: string;
};

type AutocompleteRpcRow = {
  id?: string | number | null;
  page_id?: string | number | null;
  label?: string | null;
  domain?: string | null;
  profile_url?: string | null;
  profile_image_url?: string | null;
  category?: string | null;
  verification?: string | null;
  likes?: number | null;
  ig_followers?: number | null;
  score?: number | null;
};

type SupabaseClient = ReturnType<typeof createGlobalServiceClient>;

function normalizePlatform(value: string | null): Platform {
  if (value === "google" || value === "linkedin") {
    return value;
  }

  return "meta";
}

function normalizeQuery(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCountry(value: string | null): string {
  const normalized = (value ?? "IN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "IN";
}

function makeQuerySuggestion(query: string): QuerySuggestion {
  return {
    id: `query:${query.toLocaleLowerCase()}`,
    label: query,
    type: "query",
  };
}

function mapRpcRowToAdvertiser(
  row: AutocompleteRpcRow,
  platform: Platform,
): AdvertiserSuggestion | null {
  const label = String(row.label ?? "").trim();
  if (!label) return null;

  const pageId = String(row.page_id ?? "").trim();
  const fallbackId = String(
    row.id ?? `${platform}:${label.toLocaleLowerCase()}`,
  );

  return {
    id: fallbackId,
    pageId,
    label,
    type: "advertiser",
    domain: row.domain != null ? String(row.domain) : null,
    profileUrl: row.profile_url != null ? String(row.profile_url) : null,
    profileImageUrl:
      row.profile_image_url != null ? String(row.profile_image_url) : null,
    category: row.category != null ? String(row.category) : null,
    verification:
      row.verification != null ? String(row.verification) : null,
    likes:
      typeof row.likes === "number" && Number.isFinite(row.likes)
        ? row.likes
        : null,
    igFollowers:
      typeof row.ig_followers === "number" &&
      Number.isFinite(row.ig_followers)
        ? row.ig_followers
        : null,
  };
}

function mapMetaPageToAdvertiser(
  page: MetaPageSearchResult,
): AdvertiserSuggestion {
  return {
    id: `meta:${page.pageId}`,
    pageId: page.pageId,
    label: page.name,
    type: "advertiser",
    domain: inferDomain(page),
    profileUrl: page.pageAlias
      ? `https://www.facebook.com/${page.pageAlias}`
      : null,
    profileImageUrl: page.imageUrl ?? null,
    category: page.category ?? null,
    verification: page.verification ?? null,
    likes: page.likes ?? null,
    igFollowers: page.igFollowers ?? null,
  };
}

function advertiserKey(item: AdvertiserSuggestion): string {
  const pageId = item.pageId.trim();
  if (pageId) return `page:${pageId}`;
  return `label:${item.label.trim().toLocaleLowerCase()}`;
}

function relevanceScore(
  item: AdvertiserSuggestion,
  query: string,
): number {
  const q = query.toLocaleLowerCase();
  const name = item.label.trim().toLocaleLowerCase();
  const username = item.domain
    ?.replace(/^https?:\/\//, "")
    .replace(/^instagram\.com\//, "")
    .replace(/\/$/, "")
    .toLocaleLowerCase();

  let score = 0;

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 8000;
  else if (
    name
      .split(/[\s'’._-]+/)
      .some((token) => token.startsWith(q))
  ) {
    score += 6500;
  } else if (name.includes(q)) score += 4500;

  if (username?.startsWith(q)) score += 3500;
  else if (username?.includes(q)) score += 2000;

  if (item.verification === "VERIFIED") score += 250;

  const popularity =
    Math.max(item.likes ?? 0, 0) +
    Math.max(item.igFollowers ?? 0, 0);
  score += Math.min(Math.log10(popularity + 1) * 50, 400);

  return score;
}

function mergeAdvertisers(
  localAdvertisers: AdvertiserSuggestion[],
  liveAdvertisers: AdvertiserSuggestion[],
  query: string,
): AdvertiserSuggestion[] {
  const mergedByKey = new Map<string, AdvertiserSuggestion>();

  for (const item of [...localAdvertisers, ...liveAdvertisers]) {
    const key = advertiserKey(item);
    const previous = mergedByKey.get(key);

    if (!previous) {
      mergedByKey.set(key, item);
      continue;
    }

    mergedByKey.set(key, {
      ...previous,
      domain: previous.domain ?? item.domain,
      profileUrl: previous.profileUrl ?? item.profileUrl,
      profileImageUrl:
        previous.profileImageUrl ?? item.profileImageUrl,
      category: previous.category ?? item.category,
      verification: previous.verification ?? item.verification,
      likes: previous.likes ?? item.likes,
      igFollowers: previous.igFollowers ?? item.igFollowers,
    });
  }

  return Array.from(mergedByKey.values())
    .sort(
      (a, b) =>
        relevanceScore(b, query) - relevanceScore(a, query) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, MAX_RESULTS);
}

async function getLocalAdvertisers(
  client: SupabaseClient,
  query: string,
  platform: Platform,
  country: string,
): Promise<AdvertiserSuggestion[]> {
  const result = await client.rpc("adspy_autocomplete_advertisers", {
    p_query: query,
    p_platform: platform,
    p_country: country,
    p_limit: MAX_RESULTS,
  });

  if (result.error) {
    console.error("[AdSpy] local autocomplete failed", result.error);
    return [];
  }

  const rows = (result.data ?? []) as AutocompleteRpcRow[];
  const advertisers: AdvertiserSuggestion[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const advertiser = mapRpcRowToAdvertiser(row, platform);
    if (!advertiser) continue;

    const key = advertiserKey(advertiser);
    if (seen.has(key)) continue;

    seen.add(key);
    advertisers.push(advertiser);
  }

  return advertisers;
}

async function persistMetaPages(
  client: SupabaseClient,
  pages: MetaPageSearchResult[],
  country: string,
): Promise<void> {
  await Promise.all(
    pages.map(async (page) => {
      const result = await client.rpc("adspy_upsert_advertiser_v2", {
        p_platform: "meta",
        p_page_id: page.pageId,
        p_page_name: page.name,
        p_normalized_name: normalizeAdvertiserName(page.name),
        p_domain: inferDomain(page),
        p_profile_url: page.pageAlias
          ? `https://www.facebook.com/${page.pageAlias}`
          : null,
        p_profile_image_url: page.imageUrl ?? null,
        p_category: page.category ?? null,
        p_verification: page.verification ?? null,
        p_country: country,
        p_entity_type: page.entityType ?? null,
        p_source: "meta_ad_library_page_search",
        p_likes: page.likes ?? null,
        p_ig_followers: page.igFollowers ?? null,
      });

      if (result.error) {
        console.error("[AdSpy] advertiser upsert failed", {
          pageId: page.pageId,
          error: result.error.message,
        });
      }
    }),
  );
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      query: { id: "", label: "", type: "query" },
      advertisers: [],
      suggestions: [],
      source: "none",
      error: message,
    } satisfies AutocompleteResponse,
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    const rate = checkRateLimit(`autocomplete:${user.id}`, 60, 60_000);

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          query: { id: "", label: "", type: "query" },
          advertisers: [],
          suggestions: [],
          source: "none",
          error: "Too many autocomplete requests.",
        } satisfies AutocompleteResponse,
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
          },
        },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = normalizeQuery(params.get("q"));
    const platform = normalizePlatform(params.get("platform"));
    const country = normalizeCountry(params.get("country"));

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        query: { id: "", label: query, type: "query" },
        advertisers: [],
        suggestions: [],
        source: "none",
      } satisfies AutocompleteResponse);
    }

    const querySuggestion = makeQuerySuggestion(query);
    const client = createGlobalServiceClient();

    /*
     * Local lookup and live Meta page discovery run independently.
     * A provider failure must never break the dropdown.
     */
    const [localAdvertisers, livePages] = await Promise.all([
      getLocalAdvertisers(client, query, platform, country),
      platform === "meta" ? searchMetaPages(query, country) : Promise.resolve([]),
    ]);

    const liveAdvertisers = livePages.map(mapMetaPageToAdvertiser);

    /*
     * Cache discovered page identities in Supabase without making
     * autocomplete wait for every database write.
     */
    if (livePages.length > 0) {
      void persistMetaPages(client, livePages, country).catch((error) => {
        console.error("[AdSpy] async advertiser cache failed", error);
      });
    }

    const advertisers = mergeAdvertisers(
      localAdvertisers,
      liveAdvertisers,
      query,
    );

    const source =
      localAdvertisers.length > 0 && liveAdvertisers.length > 0
        ? "local+meta_page_search"
        : localAdvertisers.length > 0
          ? "local"
          : liveAdvertisers.length > 0
            ? "meta_page_search"
            : "none";

    const response: AutocompleteResponse = {
      success: true,
      query: querySuggestion,
      advertisers,
      suggestions: [querySuggestion, ...advertisers],
      source,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control":
          "private, max-age=15, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("[AdSpy autocomplete]", error);

    return errorResponse(
      error instanceof Error ? error.message : "Autocomplete unavailable",
      503,
    );
  }
}
