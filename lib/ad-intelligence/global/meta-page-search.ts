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
  verification?: string | null;
  entity_type?: string | null;
  ig_username?: string | null;
  page_alias?: string | null;
  likes?: number | null;
  ig_followers?: number | null;
};

type SearchApiResponse = {
  page_results?: SearchApiPageResult[];
  keyword_results?: string[];
};

const SEARCH_API_ENDPOINT = "https://www.searchapi.org/api/v1/search";
const REQUEST_TIMEOUT_MS = 4500;

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getApiKey(): string | null {
  const value = process.env.SEARCHAPI_API_KEY?.trim();
  return value || null;
}

export async function searchMetaPages(
  query: string,
  country = "IN",
): Promise<MetaPageSearchResult[]> {
  const apiKey = getApiKey();
  const trimmedQuery = query.trim();

  if (!apiKey || trimmedQuery.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    engine: "meta_ad_library_page_search",
    q: trimmedQuery,
    country: country.trim().toLowerCase() || "in",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${SEARCH_API_ENDPOINT}?${params.toString()}`,
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Meta page search provider returned ${response.status}`,
      );
    }

    const data = (await response.json()) as SearchApiResponse;
    const seen = new Set<string>();

    return (data.page_results ?? [])
      .map((page) => ({
        pageId: String(page.page_id ?? "").trim(),
        name: String(page.name ?? "").trim(),
        category: page.category ?? null,
        imageUrl: page.image_uri ?? null,
        verification: page.verification ?? null,
        entityType: page.entity_type ?? null,
        igUsername: page.ig_username ?? null,
        pageAlias: page.page_alias ?? null,
        likes:
          typeof page.likes === "number" && Number.isFinite(page.likes)
            ? page.likes
            : null,
        igFollowers:
          typeof page.ig_followers === "number" &&
          Number.isFinite(page.ig_followers)
            ? page.ig_followers
            : null,
      }))
      .filter((page) => {
        if (!page.pageId || !page.name || seen.has(page.pageId)) {
          return false;
        }

        seen.add(page.pageId);
        return true;
      });
  } catch (error) {
    console.error("[Meta page search]", error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeAdvertiserName(value: string): string {
  return normalizeName(value);
}

export function inferDomain(page: MetaPageSearchResult): string | null {
  const username = page.igUsername || page.pageAlias;

  if (!username) return null;

  return `https://instagram.com/${encodeURIComponent(username)}`;
}
