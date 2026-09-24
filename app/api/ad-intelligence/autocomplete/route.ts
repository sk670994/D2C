import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";


export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

// The advertiser index changes slowly; keep hot prefixes warm per instance.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 1_000;
const MAX_RESULTS = 12;

type Row = {
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

type Suggestion = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  domain: string | null;
  profileUrl: string | null;
  profileImageUrl: string | null;
  category: string | null;
  verification: string | null;
  likes: number | null;
  igFollowers: number | null;
  source: "indexed" | "meta_public";
  country: string;
};

const cache = new Map<
  string,
  { expiresAt: number; advertisers: Suggestion[] }
>();

const inflight = new Map<string, Promise<Suggestion[]>>();

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRow(row: Row, country: string): Suggestion | null {
  const label = String(row.label ?? "").replace(/\s+/g, " ").trim();
  const pageId = String(row.page_id ?? "").trim();

  if (!label || !pageId) return null;

  return {
    id: String(row.id ?? `meta:${pageId}`),
    pageId,
    label,
    type: "advertiser",
    domain: row.domain != null ? String(row.domain) : null,
    profileUrl: row.profile_url != null ? String(row.profile_url) : null,
    profileImageUrl:
      row.profile_image_url != null ? String(row.profile_image_url) : null,
    category: row.category != null ? String(row.category) : null,
    verification: row.verification != null ? String(row.verification) : null,
    likes:
      typeof row.likes === "number" && Number.isFinite(row.likes)
        ? row.likes
        : null,
    igFollowers:
      typeof row.ig_followers === "number" &&
      Number.isFinite(row.ig_followers)
        ? row.ig_followers
        : null,
    source: "indexed",
    country,
  };
}

function dedupe(items: Suggestion[]): Suggestion[] {
  const seenPageIds = new Set<string>();
  const seenLabels = new Set<string>();

  return items.filter((item) => {
    const pid = item.pageId.trim();
    const label = normalize(item.label);

    if (pid && seenPageIds.has(pid)) return false;
    if (label && seenLabels.has(label)) return false;

    if (pid) seenPageIds.add(pid);
    if (label) seenLabels.add(label);
    return true;
  });
}

function score(query: string, item: Suggestion): number {
  const q = normalize(query);
  const label = normalize(item.label);
  const domain = normalize(item.domain ?? "");

  const username = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^instagram\.com\//, "")
    .replace(/\/+$/, "");

  let value = 0;

  if (label === q) value += 20000;
  else if (label.startsWith(q)) value += 16500;
  else if (username.startsWith(q)) value += 14800;
  else if (label.includes(q)) value += 10500;
  else if (username.includes(q)) value += 9000;

  if (item.verification?.toUpperCase() === "VERIFIED") value += 250;
  return value;
}

async function loadIndexed(
  query: string,
  platform: "meta" | "google" | "linkedin",
  country: string,
): Promise<Suggestion[]> {
  const client = createGlobalServiceClient();

  const result = await client.rpc("adspy_autocomplete_advertisers", {
    p_query: query,
    p_platform: platform,
    p_country: country,
    p_limit: MAX_RESULTS,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return dedupe(
    ((result.data ?? []) as Row[])
      .map((row) => mapRow(row, country))
      .filter((item): item is Suggestion => item !== null)
      .map((item) => ({ ...item, score: undefined }))
      .sort((a, b) => score(query, b) - score(query, a) || a.label.localeCompare(b.label)),
  ).slice(0, MAX_RESULTS);
}

function getCache(key: string): Suggestion[] | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.advertisers;
}

function setCache(key: string, advertisers: Suggestion[]) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    advertisers,
  });

  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

export async function GET(request: NextRequest) {
  const start = performance.now();

  try {
    // Local JWT verification (no round-trip to Supabase Auth on every
    // keystroke); falls back to getUser only if local verification fails.
    const userId = await getVerifiedUserId(await createServerAuthClient());

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const rate = checkRateLimit(
      `adspy-autocomplete:${userId}`,
      300,
      60_000,
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many autocomplete requests." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
          },
        },
      );
    }

    const params = request.nextUrl.searchParams;
    const query = normalize(params.get("q") ?? "");
    const country = (params.get("country") ?? "IN").trim().toUpperCase();
    const rawPlatform = (params.get("platform") ?? "meta").trim().toLowerCase();

    const platform =
      rawPlatform === "google"
        ? "google"
        : rawPlatform === "linkedin"
          ? "linkedin"
          : "meta";

    if (
      !/^[A-Z]{2}$/.test(country) ||
      query.length < 1
    ) {
      return NextResponse.json({
        success: true,
        advertisers: [],
        source: "none",
      });
    }

    const key = `${platform}|${country}|${query}`;
    const cached = getCache(key);

    if (cached) {
      return NextResponse.json(
        {
          success: true,
          advertisers: cached,
          source: "indexed",
        },
        {
          headers: {
            "Cache-Control": "private, max-age=3, stale-while-revalidate=20",
            "X-AdSpy-Suggestion-Source": "indexed",
            "Server-Timing": `cache;dur=${Math.max(0, performance.now() - start).toFixed(1)}`,
          },
        },
      );
    }

    let promise = inflight.get(key);

    if (!promise) {
      promise = loadIndexed(query, platform, country);
      inflight.set(key, promise);
    }

    let advertisers: Suggestion[];

    try {
      advertisers = await promise;
    } finally {
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
    }

    setCache(key, advertisers);

    return NextResponse.json(
      {
        success: true,
        advertisers,
        source: "indexed",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=3, stale-while-revalidate=20",
          "X-AdSpy-Suggestion-Source": "indexed",
          "Server-Timing": `db;dur=${Math.max(0, performance.now() - start).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    console.error("[ADSPY_AUTOCOMPLETE]", error);

    return NextResponse.json(
      {
        success: false,
        advertisers: [],
        source: "none",
        error: error instanceof Error ? error.message : "Autocomplete failed.",
      },
      { status: 503 },
    );
  }
}
