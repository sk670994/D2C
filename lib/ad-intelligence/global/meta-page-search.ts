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

const ENDPOINT =
  "https://www.searchapi.org/api/v1/search";

const TIMEOUT_MS = 4500;

function getApiKey(): string | null {
  const key =
    process.env.SEARCHAPI_API_KEY?.trim();

  return key || null;
}

function normalizeCountry(
  value: string,
): string {
  const result =
    value
      .trim()
      .toLowerCase();

  return /^[a-z]{2}$/.test(result)
    ? result
    : "in";
}

export async function searchMetaPages(
  query: string,
  country = "IN",
): Promise<
  MetaPageSearchResult[]
> {
  const apiKey =
    getApiKey();

  const q =
    query
      .replace(/\s+/g, " ")
      .trim();

  if (
    !apiKey ||
    q.length < 2
  ) {
    return [];
  }

  const params =
    new URLSearchParams({
      engine:
        "meta_ad_library_page_search",
      q,
      country:
        normalizeCountry(
          country,
        ),
      api_key:
        apiKey,
    });

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${ENDPOINT}?${params.toString()}`,
        {
          method: "GET",
          signal:
            controller.signal,
          cache:
            "no-store",
          headers: {
            Accept:
              "application/json",
          },
        },
      );

    if (!response.ok) {
      console.error(
        "[MetaPageSearch] provider error",
        response.status,
      );

      return [];
    }

    const data =
      (await response.json()) as SearchApiResponse;

    const seen =
      new Set<string>();

    return (
      data.page_results ??
      []
    )
      .map(
        (page) => ({
          pageId:
            String(
              page.page_id ??
                "",
            ).trim(),

          name:
            String(
              page.name ??
                "",
            ).trim(),

          category:
            page.category ??
            null,

          imageUrl:
            page.image_uri ??
            null,

          verification:
            page.verification ??
            null,

          entityType:
            page.entity_type ??
            null,

          igUsername:
            page.ig_username ??
            null,

          pageAlias:
            page.page_alias ??
            null,

          likes:
            typeof page.likes ===
              "number" &&
            Number.isFinite(
              page.likes,
            )
              ? page.likes
              : null,

          igFollowers:
            typeof page.ig_followers ===
              "number" &&
            Number.isFinite(
              page.ig_followers,
            )
              ? page.ig_followers
              : null,
        }),
      )
      .filter(
        (page) => {
          if (
            !page.pageId ||
            !page.name ||
            seen.has(
              page.pageId,
            )
          ) {
            return false;
          }

          seen.add(
            page.pageId,
          );

          return true;
        },
      );
  } catch (error) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        "AbortError"
    ) {
      console.warn(
        "[MetaPageSearch] timeout",
      );
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

export function normalizeAdvertiserName(
  value: string,
): string {
  return value
    .toLocaleLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

export function inferDomain(
  page: MetaPageSearchResult,
): string | null {
  const username =
    page.igUsername;

  if (!username) {
    return null;
  }

  return `https://instagram.com/${encodeURIComponent(
    username,
  )}`;
}