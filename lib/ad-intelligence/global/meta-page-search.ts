import "server-only";

export type MetaPageSearchResult = {
  pageId: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  verification?: string | null;
  entityType?: string | null;
  igUsername?: string | null;
  pageAlias?: string | null;
  likes?: number | null;
  igFollowers?: number | null;
};

type SearchApiPageResult = {
  page_id?: string | number | null;
  name?: string | null;
  category?: string | null;
  image_uri?: string | null;
  image_url?: string | null;
  verification?: string | null;
  entity_type?: string | null;
  ig_username?: string | null;
  page_alias?: string | null;
  likes?: number | null;
  ig_followers?: number | null;
};

type SearchApiResponse = {
  page_results?: SearchApiPageResult[];
};

const ENDPOINT =
  "https://www.searchapi.io/api/v1/search";

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 45_000;
const CACHE_MAX_ENTRIES = 250;

type CacheEntry = {
  expiresAt: number;
  promise?: Promise<MetaPageSearchResult[]>;
  value?: MetaPageSearchResult[];
};

const cache = new Map<string, CacheEntry>();

function getApiKey(): string | null {
  const key = process.env.SEARCHAPI_API_KEY?.trim();
  return key || null;
}

function normalizeCountry(value: string): string {
  const result = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(result) ? result : "in";
}

function trimCache(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  const now = Date.now();

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }

    if (cache.size <= CACHE_MAX_ENTRIES) {
      break;
    }
  }

  while (cache.size > CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    cache.delete(firstKey);
  }
}

async function fetchPages(
  query: string,
  country: string,
): Promise<MetaPageSearchResult[]> {
  const apiKey = getApiKey();

  if (!apiKey || query.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    engine: "meta_ad_library_page_search",
    q: query,
    country: normalizeCountry(country),
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${ENDPOINT}?${params.toString()}`,
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const message =
        response.status === 429
          ? "rate_limited"
          : `http_${response.status}`;

      console.warn(
        "[MetaPageSearch] provider unavailable",
        {
          status: response.status,
          reason: message,
        },
      );

      return [];
    }

    const data =
      (await response.json()) as SearchApiResponse;

    const seen = new Set<string>();

    return (data.page_results ?? [])
      .map((page) => ({
        pageId: String(page.page_id ?? "").trim(),
        name: String(page.name ?? "").trim(),
        category: page.category ?? null,
        imageUrl:
          page.image_uri ??
          page.image_url ??
          null,
        verification: page.verification ?? null,
        entityType: page.entity_type ?? null,
        igUsername: page.ig_username ?? null,
        pageAlias: page.page_alias ?? null,
        likes:
          typeof page.likes === "number" &&
          Number.isFinite(page.likes)
            ? page.likes
            : null,
        igFollowers:
          typeof page.ig_followers === "number" &&
          Number.isFinite(page.ig_followers)
            ? page.ig_followers
            : null,
      }))
      .filter((page) => {
        if (
          !page.pageId ||
          !page.name ||
          seen.has(page.pageId)
        ) {
          return false;
        }

        seen.add(page.pageId);
        return true;
      });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      console.warn("[MetaPageSearch] timeout");
    } else {
      console.error(
        "[MetaPageSearch] request failed",
        error,
      );
    }

    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchMetaPages(
  query: string,
  country = "IN",
): Promise<MetaPageSearchResult[]> {
  const normalizedQuery =
    query.replace(/\s+/g, " ").trim();

  const normalizedCountry =
    normalizeCountry(country);

  if (normalizedQuery.length < 2) {
    return [];
  }

  /*
   * Autocomplete searches are prefix-oriented. Cache the normalized
   * first five characters so "foxtal", "foxtale", etc. share one
   * upstream request during active typing.
   */
  const prefixKey =
    normalizedQuery
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 5);

  const key =
    `${normalizedCountry}|${prefixKey}`;

  const now = Date.now();
  const existing = cache.get(key);

  if (
    existing &&
    existing.expiresAt > now
  ) {
    if (existing.promise) {
      return existing.promise;
    }

    return existing.value ?? [];
  }

  const promise = fetchPages(
    normalizedQuery,
    normalizedCountry,
  );

  cache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    promise,
  });

  trimCache();

  try {
    const value = await promise;

    cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });

    return value;
  } catch {
    cache.delete(key);
    return [];
  }
}

export function normalizeAdvertiserName(
  value: string,
): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferDomain(
  page: MetaPageSearchResult,
): string | null {
  const username = page.igUsername;

  if (!username) {
    return null;
  }

  return `https://instagram.com/${encodeURIComponent(username)}`;
}
