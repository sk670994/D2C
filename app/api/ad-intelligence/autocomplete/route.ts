import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  discoverAdvertisers,
  type AdvertiserDiscoveryResult,
} from "@/lib/ad-intelligence/discovery/advertiser-discovery";
import {
  searchMetaPages,
  type MetaPageSearchResult,
} from "@/lib/ad-intelligence/global/meta-page-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_TTL_MS = 10_000;
const CACHE_MAX = 120;
const MAX_RESULTS = 12;

type AdvertiserSuggestion = {
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
  source: "meta_public" | "indexed";
  country: string;
};

const cache = new Map<
  string,
  {
    expiresAt: number;
    advertisers: AdvertiserSuggestion[];
    source: "meta_public" | "indexed" | "none";
  }
>();

const inflight = new Map<
  string,
  Promise<{
    advertisers: AdvertiserSuggestion[];
    source: "meta_public" | "indexed" | "none";
    metaCount: number;
    indexedCount: number;
  }>
>();

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function relevant(
  query: string,
  label: string,
  domain?: string | null,
): boolean {
  const q = normalize(query);
  const l = normalize(label);
  const d = normalize(domain ?? "");

  if (!q || !l) return false;

  if (
    l === q ||
    l.startsWith(q) ||
    l.includes(q)
  ) {
    return true;
  }

  if (
    d === q ||
    d.startsWith(q) ||
    d.includes(q)
  ) {
    return true;
  }

  const tokens = q
    .split(" ")
    .filter(Boolean);

  return (
    tokens.length > 0 &&
    tokens.every((token) =>
      l.includes(token),
    )
  );
}

function rank(
  query: string,
  item: AdvertiserSuggestion,
): number {
  const q = normalize(query);
  const label = normalize(item.label);

  if (label === q) {
    return 10000;
  }

  if (
    label.replace(
      /[^\p{L}\p{N}]/gu,
      "",
    ) ===
    q.replace(
      /[^\p{L}\p{N}]/gu,
      "",
    )
  ) {
    return 9500;
  }

  if (label.startsWith(q)) {
    return 9000;
  }

  const firstWord =
    label.split(" ")[0] ?? "";

  if (firstWord.startsWith(q)) {
    return 8200;
  }

  if (label.includes(q)) {
    return 7000;
  }

  const tokens = q
    .split(" ")
    .filter(Boolean);

  if (
    tokens.length > 0 &&
    tokens.every((token) =>
      label.includes(token),
    )
  ) {
    return 5500;
  }

  return 0;
}

function mapMeta(
  page: MetaPageSearchResult,
  country: string,
): AdvertiserSuggestion | null {
  const pageId =
    String(page.pageId ?? "").trim();

  const label =
    String(page.name ?? "")
      .replace(/\s+/g, " ")
      .trim();

  if (
    !/^\d+$/.test(pageId) ||
    !label
  ) {
    return null;
  }

  return {
    id: `meta:${pageId}`,
    pageId,
    label,
    type: "advertiser",
    domain: page.igUsername
      ? `https://instagram.com/${encodeURIComponent(page.igUsername)}`
      : null,
    profileUrl: page.pageAlias
      ? `https://www.facebook.com/${encodeURIComponent(page.pageAlias)}`
      : `https://www.facebook.com/profile.php?id=${encodeURIComponent(pageId)}`,
    profileImageUrl:
      page.imageUrl ?? null,
    category:
      page.category ?? null,
    verification:
      page.verification ?? null,
    likes: compact(page.likes),
    igFollowers:
      compact(page.igFollowers),
    source: "meta_public",
    country,
  };
}

function mapIndexed(
  item: AdvertiserDiscoveryResult,
  country: string,
): AdvertiserSuggestion {
  return {
    id: item.id,
    pageId: item.pageId,
    label: item.label,
    type: "advertiser",
    domain: item.domain,
    profileUrl: item.profileUrl,
    profileImageUrl:
      item.profileImageUrl,
    category: item.category,
    verification:
      item.verification,
    likes: compact(item.likes),
    igFollowers:
      compact(item.igFollowers),
    source: "indexed",
    country,
  };
}

function dedupeMeta(
  query: string,
  items: AdvertiserSuggestion[],
): AdvertiserSuggestion[] {
  const seenPageIds =
    new Set<string>();

  const seenLabels =
    new Set<string>();

  return items
    .filter((item) =>
      relevant(
        query,
        item.label,
        item.domain,
      ),
    )
    .filter((item) => {
      const pageId =
        item.pageId.trim();

      const label =
        normalize(item.label);

      if (
        pageId &&
        seenPageIds.has(pageId)
      ) {
        return false;
      }

      if (
        label &&
        seenLabels.has(label)
      ) {
        return false;
      }

      if (pageId) {
        seenPageIds.add(pageId);
      }

      if (label) {
        seenLabels.add(label);
      }

      return true;
    })
    .map((item) => ({
      item,
      score:
        rank(query, item) +
        500 +
        (item.verification?.toUpperCase() ===
        "VERIFIED"
          ? 250
          : 0) +
        Math.min(
          400,
          Math.log10(
            Math.max(
              item.likes ?? 0,
              0,
            ) +
              Math.max(
                item.igFollowers ?? 0,
                0,
              ) +
              1,
          ) * 50,
        ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.label.localeCompare(
          b.item.label,
        ),
    )
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}

async function liveMetaLookup(
  query: string,
  country: string,
): Promise<AdvertiserSuggestion[]> {
  const pages =
    await searchMetaPages(
      query,
      country,
    );

  return pages
    .map((page) =>
      mapMeta(
        page,
        country,
      ),
    )
    .filter(
      (
        item,
      ): item is AdvertiserSuggestion =>
        item !== null,
    );
}

async function indexedLookup(
  query: string,
  country: string,
  platform:
    | "meta"
    | "google"
    | "linkedin",
): Promise<AdvertiserSuggestion[]> {
  const items =
    await discoverAdvertisers({
      query,
      platform,
      country,
      limit: MAX_RESULTS,
    });

  return items.map((item) =>
    mapIndexed(
      item,
      country,
    ),
  );
}

async function buildResponse(
  query: string,
  country: string,
  platform:
    | "meta"
    | "google"
    | "linkedin",
) {
  /*
   * META MUST BE THE PRIMARY SOURCE.
   *
   * The indexed catalog is consulted concurrently only so that we have
   * a fallback available if Meta returns zero usable entities.
   *
   * A successful Meta result is NEVER replaced by indexed advertisers.
   */
  const [metaResult, indexedResult] =
    await Promise.allSettled([
      platform === "meta"
        ? liveMetaLookup(
            query,
            country,
          )
        : Promise.resolve(
            [] as AdvertiserSuggestion[],
          ),

      indexedLookup(
        query,
        country,
        platform,
      ),
    ]);

  const meta =
    metaResult.status === "fulfilled"
      ? dedupeMeta(
          query,
          metaResult.value,
        )
      : [];

  const indexed =
    indexedResult.status === "fulfilled"
      ? indexedResult.value
      : [];

  /*
   * For Meta searches:
   *   Meta has absolute priority.
   *   Indexed data is fallback only.
   */
  if (
    platform === "meta" &&
    meta.length > 0
  ) {
    return {
      advertisers: meta,
      source: "meta_public" as const,
      metaCount: meta.length,
      indexedCount: indexed.length,
    };
  }

  /*
   * Meta returned nothing.
   * Use local index rather than returning an empty dropdown.
   */
  const fallback =
    dedupeMeta(
      query,
      indexed,
    );

  return {
    advertisers: fallback,
    source:
      fallback.length > 0
        ? ("indexed" as const)
        : ("none" as const),
    metaCount: 0,
    indexedCount: fallback.length,
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    const auth =
      await createServerAuthClient();

    const {
      data: { user },
      error,
    } = await auth.auth.getUser();

    if (
      error ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const rate =
      checkRateLimit(
        `adspy-autocomplete:${user.id}`,
        120,
        60_000,
      );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Too many autocomplete requests.",
        },
        {
          status: 429,
          headers: {
            "Retry-After":
              String(
                rate.retryAfterSeconds,
              ),
          },
        },
      );
    }

    const params =
      request.nextUrl.searchParams;

    const query =
      (params.get("q") ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const country =
      (
        params.get("country") ??
        "IN"
      )
        .trim()
        .toUpperCase();

    const rawPlatform =
      (
        params.get("platform") ??
        "meta"
      )
        .trim()
        .toLowerCase();

    const platform =
      rawPlatform === "google"
        ? "google"
        : rawPlatform ===
            "linkedin"
          ? "linkedin"
          : "meta";

    if (
      query.length < 2 ||
      !/^[A-Z]{2}$/.test(
        country,
      )
    ) {
      return NextResponse.json({
        success: true,
        advertisers: [],
        source: "none",
      });
    }

    const key =
      `${platform}|${country}|${normalize(query)}`;

    const cached =
      cache.get(key);

    if (
      cached &&
      cached.expiresAt >
        Date.now()
    ) {
      return NextResponse.json(
        {
          success: true,
          advertisers:
            cached.advertisers,
          source:
            cached.source,
        },
        {
          headers: {
            "Cache-Control":
              "private, max-age=5, stale-while-revalidate=20",
            "X-AdSpy-Suggestion-Source":
              cached.source,
          },
        },
      );
    }

    let promise =
      inflight.get(key);

    if (!promise) {
      promise =
        buildResponse(
          query,
          country,
          platform,
        );

      inflight.set(
        key,
        promise,
      );
    }

    let result;

    try {
      result =
        await promise;
    } finally {
      if (
        inflight.get(key) ===
        promise
      ) {
        inflight.delete(key);
      }
    }

    cache.set(
      key,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL_MS,
        advertisers:
          result.advertisers,
        source:
          result.source,
      },
    );

    while (
      cache.size >
      CACHE_MAX
    ) {
      const first =
        cache.keys()
          .next()
          .value;

      if (
        first === undefined
      ) {
        break;
      }

      cache.delete(first);
    }

    return NextResponse.json(
      {
        success: true,
        advertisers:
          result.advertisers,
        source:
          result.source,
        metaCount:
          result.metaCount,
        indexedCount:
          result.indexedCount,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=5, stale-while-revalidate=20",
          "X-AdSpy-Suggestion-Source":
            result.source,
        },
      },
    );
  } catch (error) {
    console.error(
      "[ADSPY_META_AUTOCOMPLETE]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        advertisers: [],
        source: "none",
        error:
          error instanceof Error
            ? error.message
            : "Meta advertiser discovery failed.",
      },
      { status: 503 },
    );
  }
}
