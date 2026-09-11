import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  createGlobalServiceClient,
} from "@/lib/ad-intelligence/global/supabase";

import {
  checkRateLimit,
} from "@/lib/rate-limit";

import {
  inferDomain,
  normalizeAdvertiserName,
  searchMetaPages,
  type MetaPageSearchResult,
} from "@/lib/ad-intelligence/global/meta-page-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

type Platform =
  | "meta"
  | "google"
  | "linkedin";

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
};

type QuerySuggestion = {
  id: string;
  label: string;
  type: "query";
};

type Suggestion =
  | AdvertiserSuggestion
  | QuerySuggestion;

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
  score?: number | null;
};

type SupabaseClient = ReturnType<
  typeof createGlobalServiceClient
>;

function normalizePlatform(
  value: string | null,
): Platform {
  if (
    value === "google" ||
    value === "linkedin"
  ) {
    return value;
  }

  return "meta";
}

function normalizeQuery(
  value: string | null,
): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(
  value: string | null,
): string {
  const normalized = (
    value ?? "IN"
  )
    .trim()
    .toUpperCase();

  return /^[A-Z]{2}$/.test(normalized)
    ? normalized
    : "IN";
}

function makeQuerySuggestion(
  query: string,
): QuerySuggestion {
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
  const label = String(
    row.label ?? "",
  ).trim();

  if (!label) {
    return null;
  }

  const pageId = String(
    row.page_id ?? "",
  ).trim();

  const fallbackId = String(
    row.id ??
      `${platform}:${label.toLocaleLowerCase()}`,
  );

  return {
    id: fallbackId,
    pageId,
    label,
    type: "advertiser",
    domain:
      row.domain != null
        ? String(row.domain)
        : null,
    profileUrl:
      row.profile_url != null
        ? String(row.profile_url)
        : null,
    profileImageUrl:
      row.profile_image_url != null
        ? String(row.profile_image_url)
        : null,
    category:
      row.category != null
        ? String(row.category)
        : null,
    verification:
      row.verification != null
        ? String(row.verification)
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
    profileUrl:
      page.pageAlias
        ? `https://facebook.com/${page.pageAlias}`
        : null,
    profileImageUrl:
      page.imageUrl ?? null,
    category:
      page.category ?? null,
    verification:
      page.verification ?? null,
  };
}

function mergeAdvertisers(
  localAdvertisers: AdvertiserSuggestion[],
  liveAdvertisers: AdvertiserSuggestion[],
): AdvertiserSuggestion[] {
  const merged: AdvertiserSuggestion[] = [];

  const seenPageIds = new Set<string>();
  const seenLabels = new Set<string>();

  const items: AdvertiserSuggestion[] = [
    ...localAdvertisers,
    ...liveAdvertisers,
  ];

  for (
    const item of items
  ) {
    const normalizedLabel =
      item.label
        .trim()
        .toLocaleLowerCase();

    const pageKey =
      item.pageId.trim();

    if (
      pageKey &&
      seenPageIds.has(pageKey)
    ) {
      continue;
    }

    if (
      normalizedLabel &&
      seenLabels.has(normalizedLabel)
    ) {
      continue;
    }

    if (pageKey) {
      seenPageIds.add(pageKey);
    }

    if (normalizedLabel) {
      seenLabels.add(normalizedLabel);
    }

    merged.push(item);

    if (
      merged.length >= MAX_RESULTS
    ) {
      break;
    }
  }

  return merged;
}

async function getLocalAdvertisers(
  client: SupabaseClient,
  query: string,
  platform: Platform,
  country: string,
): Promise<AdvertiserSuggestion[]> {
  const result =
    await client.rpc(
      "adspy_autocomplete_advertisers",
      {
        p_query: query,
        p_platform: platform,
        p_country: country,
        p_limit: MAX_RESULTS,
      },
    );

  if (result.error) {
    throw new Error(
      `Local advertiser autocomplete failed: ${result.error.message}`,
    );
  }

  const rows =
    (result.data ?? []) as AutocompleteRpcRow[];

  const advertisers: AdvertiserSuggestion[] =
    [];

  const seen = new Set<string>();

  for (
    const row of rows
  ) {
    const advertiser =
      mapRpcRowToAdvertiser(
        row,
        platform,
      );

    if (!advertiser) {
      continue;
    }

    const key =
      advertiser.pageId ||
      advertiser.label
        .toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    advertisers.push(
      advertiser,
    );

    if (
      advertisers.length >=
      MAX_RESULTS
    ) {
      break;
    }
  }

  return advertisers;
}

async function persistMetaPages(
  client: SupabaseClient,
  pages: MetaPageSearchResult[],
  country: string,
): Promise<void> {
  await Promise.all(
    pages.map(
      async (
        page: MetaPageSearchResult,
      ) => {
        const result =
          await client.rpc(
            "adspy_upsert_advertiser",
            {
              p_platform: "meta",
              p_page_id:
                page.pageId,
              p_page_name:
                page.name,
              p_normalized_name:
                normalizeAdvertiserName(
                  page.name,
                ),
              p_domain:
                inferDomain(page),
              p_profile_url:
                page.pageAlias
                  ? `https://facebook.com/${page.pageAlias}`
                  : null,
              p_profile_image_url:
                page.imageUrl ?? null,
              p_category:
                page.category ?? null,
              p_verification:
                page.verification ?? null,
              p_country: country,
              p_entity_type:
                page.entityType ??
                null,
              p_source:
                "meta_ad_library_page_search",
            },
          );

        if (result.error) {
          console.error(
            "[AdSpy] advertiser upsert failed",
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

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      success: false,
      query: {
        id: "",
        label: "",
        type: "query",
      },
      advertisers: [],
      suggestions: [],
      source: "none",
      error: message,
    } satisfies AutocompleteResponse,
    { status },
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const auth =
      await createServerAuthClient();

    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return errorResponse(
        "Unauthorized",
        401,
      );
    }

    const rate =
      checkRateLimit(
        `autocomplete:${user.id}`,
        60,
        60_000,
      );

    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          query: {
            id: "",
            label: "",
            type: "query",
          },
          advertisers: [],
          suggestions: [],
          source: "none",
          error:
            "Too many autocomplete requests.",
        } satisfies AutocompleteResponse,
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
      normalizeQuery(
        params.get("q"),
      );

    const platform =
      normalizePlatform(
        params.get("platform"),
      );

    const country =
      normalizeCountry(
        params.get("country"),
      );

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        query: {
          id: "",
          label: query,
          type: "query",
        },
        advertisers: [],
        suggestions: [],
        source: "none",
      } satisfies AutocompleteResponse);
    }

    /*
     * The exact phrase option is independent
     * of the advertiser data source.
     */
    const querySuggestion =
      makeQuerySuggestion(
        query,
      );

    const client =
      createGlobalServiceClient();

    /*
     * 1. Fast local index.
     */
    const localAdvertisers =
      await getLocalAdvertisers(
        client,
        query,
        platform,
        country,
      );

    /*
     * 2. Live Meta page discovery for
     * cold-start / missing advertisers.
     *
     * Only Meta uses this provider.
     */
    let liveAdvertisers:
      AdvertiserSuggestion[] = [];

    if (
      platform === "meta" &&
      localAdvertisers.length <
        MAX_RESULTS
    ) {
      const pages =
        await searchMetaPages(
          query,
          country,
        );

      if (pages.length > 0) {
        await persistMetaPages(
          client,
          pages,
          country,
        );

        liveAdvertisers =
          pages.map(
            (
              page: MetaPageSearchResult,
            ) =>
              mapMetaPageToAdvertiser(
                page,
              ),
          );
      }
    }

    /*
     * 3. Merge local + live results.
     */
    const advertisers =
      mergeAdvertisers(
        localAdvertisers,
        liveAdvertisers,
      );

    let source:
      | "local"
      | "meta_page_search"
      | "local+meta_page_search"
      | "none";

    if (
      localAdvertisers.length > 0 &&
      liveAdvertisers.length > 0
    ) {
      source =
        "local+meta_page_search";
    } else if (
      localAdvertisers.length > 0
    ) {
      source = "local";
    } else if (
      liveAdvertisers.length > 0
    ) {
      source =
        "meta_page_search";
    } else {
      source = "none";
    }

    /*
     * 4. Exact query always stays available.
     */
    const response: AutocompleteResponse =
      {
        success: true,
        query: querySuggestion,
        advertisers,
        suggestions: [
          querySuggestion,
          ...advertisers,
        ],
        source,
      };

    return NextResponse.json(
      response,
      {
        headers: {
          "Cache-Control":
            "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error(
      "[AdSpy autocomplete]",
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Autocomplete unavailable",
      503,
    );
  }
}