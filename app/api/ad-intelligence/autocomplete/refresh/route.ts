import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import {
  searchMetaPages,
  type MetaPageSearchResult,
} from "@/lib/ad-intelligence/global/meta-page-search";
import { normalizeAdvertiserName } from "@/lib/ad-intelligence/global/meta-page-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const CACHE_TTL_MS = 10_000;
const MAX_RESULTS = 12;
const inflight = new Map<string, Promise<MetaPageSearchResult[]>>();

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapPage(page: MetaPageSearchResult, country: string) {
  return {
    id: `meta:${page.pageId}`,
    pageId: page.pageId,
    label: page.name,
    type: "advertiser" as const,
    domain: page.igUsername
      ? `https://instagram.com/${encodeURIComponent(page.igUsername)}`
      : null,
    profileUrl: page.pageAlias
      ? `https://www.facebook.com/${encodeURIComponent(page.pageAlias)}`
      : `https://www.facebook.com/profile.php?id=${encodeURIComponent(page.pageId)}`,
    profileImageUrl: page.imageUrl ?? null,
    category: page.category ?? null,
    verification: page.verification ?? null,
    likes: page.likes ?? null,
    igFollowers: page.igFollowers ?? null,
    source: "meta_public" as const,
    country,
  };
}

async function discover(query: string, country: string) {
  const key = `${country}|${normalize(query)}`;
  let promise = inflight.get(key);

  if (!promise) {
    promise = searchMetaPages(query, country);
    inflight.set(key, promise);
  }

  let pages: MetaPageSearchResult[];

  try {
    pages = await promise;
  } finally {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  }

  const rows = pages
    .filter((page) => /^\d+$/.test(String(page.pageId ?? "").trim()))
    .filter((page) => String(page.name ?? "").trim())
    .slice(0, MAX_RESULTS);

  if (rows.length === 0) return [];

  const client = createGlobalServiceClient();

  await Promise.allSettled(
    rows.map((page) =>
      client.rpc("adspy_upsert_advertiser_v2", {
        p_platform: "meta",
        p_page_id: page.pageId,
        p_page_name: page.name,
        p_normalized_name: normalizeAdvertiserName(page.name),
        p_domain: page.igUsername
          ? `https://instagram.com/${encodeURIComponent(page.igUsername)}`
          : null,
        p_profile_url: page.pageAlias
          ? `https://www.facebook.com/${page.pageAlias}`
          : `https://www.facebook.com/profile.php?id=${encodeURIComponent(page.pageId)}`,
        p_profile_image_url: page.imageUrl ?? null,
        p_category: page.category ?? null,
        p_verification: page.verification ?? null,
        p_country: country,
        p_entity_type: page.entityType ?? null,
        p_source: "meta_ad_library_page_search",
        p_likes: page.likes ?? null,
        p_ig_followers: page.igFollowers ?? null,
      }),
    ),
  );

  return rows;
}

const responseCache = new Map<
  string,
  { expiresAt: number; pages: MetaPageSearchResult[] }
>();

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
      `adspy-autocomplete-refresh:${user.id}`,
      60,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many refresh requests." },
        { status: 429 },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = normalize(params.get("q") ?? "");
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    const platform = (params.get("platform") ?? "meta").trim().toLowerCase();

    if (
      platform !== "meta" ||
      query.length < 2 ||
      !/^[A-Z]{2}$/.test(country)
    ) {
      return NextResponse.json({
        success: true,
        advertisers: [],
        source: "none",
      });
    }

    const key = `${country}|${query}`;
    const cached = responseCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        success: true,
        advertisers: cached.pages.map((page) => mapPage(page, country)),
        source: "meta_public",
      });
    }

    const pages = await discover(query, country);

    responseCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      pages,
    });

    return NextResponse.json({
      success: true,
      advertisers: pages.map((page) => mapPage(page, country)),
      source: "meta_public",
    });
  } catch (error) {
    console.error("[ADSPY_AUTOCOMPLETE_REFRESH]", error);

    return NextResponse.json(
      {
        success: false,
        advertisers: [],
        source: "none",
        error: error instanceof Error ? error.message : "Meta refresh failed.",
      },
      { status: 503 },
    );
  }
}
