import "server-only";

import { pickExactPage } from "./pick-page";

import {
  inferDomain,
  normalizeAdvertiserName,
  searchMetaPages,
  type MetaPageSearchResult,
} from "@/lib/ad-intelligence/global/meta-page-search";

import {
  createGlobalServiceClient,
} from "@/lib/ad-intelligence/global/supabase";

export type AdvertiserDiscoveryResult = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  platform:
    | "meta"
    | "google"
    | "linkedin";
  country: string;
  domain: string | null;
  profileUrl: string | null;
  profileImageUrl: string | null;
  category: string | null;
  verification: string | null;
  likes: number | null;
  igFollowers: number | null;
  score: number;
  source:
    | "local"
    | "meta_page_search";
};

type AdvertiserRpcRow = {
  id?:
    | string
    | number
    | null;

  page_id?:
    | string
    | number
    | null;

  label?:
    | string
    | null;

  domain?:
    | string
    | null;

  profile_url?:
    | string
    | null;

  profile_image_url?:
    | string
    | null;

  category?:
    | string
    | null;

  verification?:
    | string
    | null;

  likes?:
    | number
    | null;

  ig_followers?:
    | number
    | null;

  score?:
    | number
    | null;
};

type DiscoveryOptions = {
  query: string;
  platform?:
    | "meta"
    | "google"
    | "linkedin";
  country?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 8;

const CACHE_TTL_MS =
  15_000;

const MAX_CACHE_ENTRIES =
  100;

/*
 * IMPORTANT:
 *
 * Live Meta page enrichment is deliberately OFF for interactive
 * autocomplete.
 *
 * The SearchApi provider has been returning 401 in your current
 * environment. There is no reason to make autocomplete wait for
 * an unavailable provider when the local advertiser index works.
 *
 * Turn it on explicitly later with:
 *
 * ADSPY_AUTOCOMPLETE_LIVE_ENRICHMENT=true
 */
const LIVE_ENRICHMENT_ENABLED =
  process.env.ADSPY_AUTOCOMPLETE_LIVE_ENRICHMENT ===
  "true";

const discoveryCache =
  new Map<
    string,
    {
      expiresAt: number;
      results: AdvertiserDiscoveryResult[];
    }
  >();

function normalizeQuery(
  value: string,
): string {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizeCountry(
  value?: string,
): string {
  const country =
    (
      value ??
      "IN"
    )
      .trim()
      .toUpperCase();

  return /^[A-Z]{2}$/.test(
    country,
  )
    ? country
    : "IN";
}

function normalizePlatform(
  value?: string,
):
  | "meta"
  | "google"
  | "linkedin" {
  if (
    value === "google" ||
    value === "linkedin"
  ) {
    return value;
  }

  return "meta";
}

function cacheKey(
  query: string,
  platform:
    | "meta"
    | "google"
    | "linkedin",
  country: string,
): string {
  return [
    platform,
    country,
    query
      .trim()
      .toLowerCase(),
  ].join("|");
}

function readCache(
  key: string,
): AdvertiserDiscoveryResult[] | null {
  const cached =
    discoveryCache.get(
      key,
    );

  if (!cached) {
    return null;
  }

  if (
    cached.expiresAt <=
    Date.now()
  ) {
    discoveryCache.delete(
      key,
    );

    return null;
  }

  return cached.results;
}

function writeCache(
  key: string,
  results: AdvertiserDiscoveryResult[],
): void {
  discoveryCache.set(
    key,
    {
      expiresAt:
        Date.now() +
        CACHE_TTL_MS,

      results,
    },
  );

  while (
    discoveryCache.size >
    MAX_CACHE_ENTRIES
  ) {
    const oldestKey =
      discoveryCache.keys()
        .next()
        .value as
        | string
        | undefined;

    if (!oldestKey) {
      break;
    }

    discoveryCache.delete(
      oldestKey,
    );
  }
}

function toFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function mapRpcRow(
  row: AdvertiserRpcRow,
  platform:
    | "meta"
    | "google"
    | "linkedin",
  country: string,
): AdvertiserDiscoveryResult | null {
  const label =
    String(
      row.label ??
        "",
    ).trim();

  if (!label) {
    return null;
  }

  const pageId =
    String(
      row.page_id ??
        "",
    ).trim();

  return {
    id: String(
      row.id ??
        `${platform}:${pageId || label.toLowerCase()}`,
    ),

    pageId,

    label,

    type:
      "advertiser",

    platform,

    country,

    domain:
      row.domain !=
      null
        ? String(
            row.domain,
          )
        : null,

    profileUrl:
      row.profile_url !=
      null
        ? String(
            row.profile_url,
          )
        : null,

    profileImageUrl:
      row.profile_image_url !=
      null
        ? String(
            row.profile_image_url,
          )
        : null,

    category:
      row.category !=
      null
        ? String(
            row.category,
          )
        : null,

    verification:
      row.verification !=
      null
        ? String(
            row.verification,
          )
        : null,

    likes:
      toFiniteNumber(
        row.likes,
      ),

    igFollowers:
      toFiniteNumber(
        row.ig_followers,
      ),

    score:
      typeof row.score ===
        "number" &&
      Number.isFinite(
        row.score,
      )
        ? row.score
        : 0,

    source:
      "local",
  };
}

function mapMetaPage(
  page: MetaPageSearchResult,
  country: string,
): AdvertiserDiscoveryResult {
  return {
    id:
      `meta:${page.pageId}`,

    pageId:
      page.pageId,

    label:
      page.name,

    type:
      "advertiser",

    platform:
      "meta",

    country,

    domain:
      inferDomain(
        page,
      ),

    profileUrl:
      page.pageAlias
        ? `https://www.facebook.com/${page.pageAlias}`
        : null,

    profileImageUrl:
      page.imageUrl ??
      null,

    category:
      page.category ??
      null,

    verification:
      page.verification ??
      null,

    likes:
      page.likes ??
      null,

    igFollowers:
      page.igFollowers ??
      null,

    score:
      0,

    source:
      "meta_page_search",
  };
}

function usernameFromDomain(
  domain: string | null,
): string | null {
  if (!domain) {
    return null;
  }

  return domain
    .replace(
      /^https?:\/\//,
      "",
    )
    .replace(
      /^www\./,
      "",
    )
    .replace(
      /^instagram\.com\//,
      "",
    )
    .replace(
      /\/+$/,
      "",
    )
    .trim()
    .toLowerCase();
}

function scoreAdvertiser(
  advertiser: AdvertiserDiscoveryResult,
  query: string,
): number {
  const q =
    query
      .toLowerCase()
      .trim();

  const name =
    advertiser.label
      .toLowerCase()
      .trim();

  const normalizedName =
    normalizeAdvertiserName(
      advertiser.label,
    );

  const username =
    usernameFromDomain(
      advertiser.domain,
    );

  let score = 0;

  if (
    name === q
  ) {
    score += 10000;
  }

  if (
    normalizedName === q
  ) {
    score += 9500;
  }

  if (
    name.startsWith(q)
  ) {
    score += 8500;
  }

  const wordPrefix =
    name
      .split(
        /[\s'’._-]+/,
      )
      .some(
        (
          word,
        ) =>
          word.startsWith(q),
      );

  if (wordPrefix) {
    score += 7500;
  }

  if (
    normalizedName.includes(
      q,
    )
  ) {
    score += 5000;
  }

  if (
    name.includes(q)
  ) {
    score += 4500;
  }

  if (
    username?.startsWith(q)
  ) {
    score += 4200;
  } else if (
    username?.includes(q)
  ) {
    score += 2500;
  }

  if (
    advertiser.verification
      ?.toUpperCase() ===
    "VERIFIED"
  ) {
    score += 250;
  }

  const popularity =
    Math.max(
      advertiser.likes ??
        0,
      0,
    ) +
    Math.max(
      advertiser.igFollowers ??
        0,
      0,
    );

  if (
    popularity >
    0
  ) {
    score += Math.min(
      Math.log10(
        popularity +
          1,
      ) * 50,
      400,
    );
  }

  if (
    advertiser.source ===
    "meta_page_search"
  ) {
    score += 75;
  }

  return score;
}

function dedupe(
  results: AdvertiserDiscoveryResult[],
): AdvertiserDiscoveryResult[] {
  const seenPageIds =
    new Set<string>();

  const seenLabels =
    new Set<string>();

  const output: AdvertiserDiscoveryResult[] =
    [];

  for (
    const item of results
  ) {
    const pageId =
      item.pageId.trim();

    const label =
      item.label
        .trim()
        .toLowerCase();

    if (
      pageId &&
      seenPageIds.has(
        pageId,
      )
    ) {
      continue;
    }

    if (
      label &&
      seenLabels.has(
        label,
      )
    ) {
      continue;
    }

    if (pageId) {
      seenPageIds.add(
        pageId,
      );
    }

    if (label) {
      seenLabels.add(
        label,
      );
    }

    output.push(
      item,
    );
  }

  return output;
}

async function localAdvertisers(
  query: string,
  platform:
    | "meta"
    | "google"
    | "linkedin",
  country: string,
  limit: number,
): Promise<
  AdvertiserDiscoveryResult[]
> {
  const client =
    createGlobalServiceClient();

  const result =
    await client.rpc(
      "adspy_autocomplete_advertisers",
      {
        p_query:
          query,

        p_platform:
          platform,

        p_country:
          country,

        p_limit:
          Math.min(
            Math.max(
              limit * 2,
              8,
            ),
            24,
          ),
      },
    );

  if (
    result.error
  ) {
    console.error(
      "[AdvertiserDiscovery] local lookup failed",
      result.error,
    );

    return [];
  }

  const rows =
    (result.data ??
      []) as AdvertiserRpcRow[];

  return rows
    .map(
      (
        row,
      ) =>
        mapRpcRow(
          row,
          platform,
          country,
        ),
    )
    .filter(
      (
        item,
      ): item is AdvertiserDiscoveryResult =>
        item !== null,
    );
}

async function persistPages(
  pages: MetaPageSearchResult[],
  country: string,
): Promise<void> {
  if (
    pages.length === 0
  ) {
    return;
  }

  const client =
    createGlobalServiceClient();

  await Promise.all(
    pages.map(
      async (
        page,
      ) => {
        const result =
          await client.rpc(
            "adspy_upsert_advertiser_v2",
            {
              p_platform:
                "meta",

              p_page_id:
                page.pageId,

              p_page_name:
                page.name,

              p_normalized_name:
                normalizeAdvertiserName(
                  page.name,
                ),

              p_domain:
                inferDomain(
                  page,
                ),

              p_profile_url:
                page.pageAlias
                  ? `https://www.facebook.com/${page.pageAlias}`
                  : null,

              p_profile_image_url:
                page.imageUrl ??
                null,

              p_category:
                page.category ??
                null,

              p_verification:
                page.verification ??
                null,

              p_country:
                country,

              p_entity_type:
                page.entityType ??
                null,

              p_source:
                "meta_ad_library_page_search",

              p_likes:
                page.likes ??
                null,

              p_ig_followers:
                page.igFollowers ??
                null,
            },
          );

        if (
          result.error
        ) {
          console.error(
            "[AdvertiserDiscovery] cache write failed",
            {
              pageId:
                page.pageId,

              error:
                result.error.message,
            },
          );
        }
      },
    ),
  );
}

export async function discoverAdvertisers({
  query,
  platform:
    requestedPlatform,
  country:
    requestedCountry,
  limit:
    requestedLimit,
}: DiscoveryOptions): Promise<
  AdvertiserDiscoveryResult[]
> {
  const normalizedQuery =
    normalizeQuery(
      query,
    );

  if (
    normalizedQuery.length <
    2
  ) {
    return [];
  }

  const platform =
    normalizePlatform(
      requestedPlatform,
    );

  const country =
    normalizeCountry(
      requestedCountry,
    );

  const limit =
    Math.min(
      Math.max(
        requestedLimit ??
          DEFAULT_LIMIT,
        1,
      ),
      12,
    );

  const key =
    cacheKey(
      normalizedQuery,
      platform,
      country,
    );

  const cached =
    readCache(key);

  if (cached) {
    return cached;
  }

  /*
   * FAST PATH:
   *
   * Interactive autocomplete only needs the local advertiser
   * index.
   */
  const local =
    await localAdvertisers(
      normalizedQuery,
      platform,
      country,
      limit,
    );

  let merged =
    dedupe(local);

  /*
   * Optional enrichment is completely independent from the
   * primary autocomplete path.
   *
   * It is OFF by default.
   */
  if (
    LIVE_ENRICHMENT_ENABLED &&
    platform ===
      "meta"
  ) {
    try {
      const livePages =
        await searchMetaPages(
          normalizedQuery,
          country,
        );

      if (
        livePages.length >
        0
      ) {
        void persistPages(
          livePages,
          country,
        ).catch(
          (
            error,
          ) => {
            console.error(
              "[AdvertiserDiscovery] async persist failed",
              error,
            );
          },
        );

        merged =
          dedupe([
            ...merged,
            ...livePages.map(
              (
                page,
              ) =>
                mapMetaPage(
                  page,
                  country,
                ),
            ),
          ]);
      }
    } catch (
      error
    ) {
      /*
       * Live enrichment is never allowed to break autocomplete.
       */
      console.warn(
        "[AdvertiserDiscovery] live enrichment skipped",
        error,
      );
    }
  }

  const results =
    merged
      .map(
        (
          item,
        ) => ({
          ...item,
          score:
            scoreAdvertiser(
              item,
              normalizedQuery,
            ),
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.score -
            a.score ||
          a.label.localeCompare(
            b.label,
          ),
      )
      .slice(
        0,
        limit,
      );

  writeCache(
    key,
    results,
  );

  return results;
}
/**
 * Resolve a typed brand name to ONE Meta page, or null (never a guess).
 * Local index first; then Meta's own Ad Library page search (headless browser,
 * so only call this from the background worker, not from a Vercel request).
 * Pages found live are saved to the advertiser index so autocomplete can offer
 * them next time.
 */
export async function resolveExactMetaPage(
  query: string,
  country: string,
): Promise<{ pageId: string; name: string; source: "index" | "meta_page_search" } | null> {
  const normalizedQuery = normalizeQuery(query);
  const normalizedCountry = normalizeCountry(country);
  if (normalizedQuery.length < 2) return null;

  const local = await localAdvertisers(normalizedQuery, "meta", normalizedCountry, 12);
  const fromIndex = pickExactPage(query, local.map((item) => ({ pageId: item.pageId, label: item.label, verification: item.verification })));
  if (fromIndex) return { pageId: String(fromIndex.pageId), name: String(fromIndex.label), source: "index" };

  const live = await searchMetaPages(normalizedQuery, normalizedCountry).catch(() => [] as MetaPageSearchResult[]);
  if (!live.length) return null;
  await persistPages(live, normalizedCountry).catch((error) => {
    console.warn("[AdvertiserDiscovery] persist failed", error instanceof Error ? error.message : error);
  });
  const fromMeta = pickExactPage(query, live.map((page) => ({ pageId: page.pageId, label: page.name, verification: page.verification ?? null })));
  return fromMeta ? { pageId: String(fromMeta.pageId), name: String(fromMeta.label), source: "meta_page_search" } : null;
}
