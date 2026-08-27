import "server-only";

import type {
  AdPlatform,
  CompetitorAd,
} from "../types";

import {
  createGlobalServiceClient,
} from "./supabase";

type SearchMode =
  | "advertiser"
  | "keyword";

type DataSource =
  | "provider"
  | "heuristic"
  | "derived"
  | "unavailable";

type SearchSummary = {
  totalAds: number;
  activeAds: number;
  inactiveAds: number;
  videoAds: number;
  imageAds: number;
  carouselAds: number;
  creatorAds: number;
  averageRunningDays: number;
  longestRunningDays: number;
};

type Intelligence = {
  topCreators: Array<{
    label: string;
    count: number;
  }>;
  topOffers: Array<{
    label: string;
    count: number;
  }>;
  topHooks: Array<{
    label: string;
    count: number;
  }>;
  longestRunningAd: {
    advertiserName?: string | null;
    headline?: string | null;
    runningDays?: number | null;
  } | null;
  reach: {
    status: "unavailable";
    reason: string;
  };
};

function escapeLike(
  value: string,
) {
  return value
    .replace(
      /[%_,]/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function safeDateMs(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const time =
    new Date(
      value,
    ).getTime();

  return Number.isFinite(
    time,
  )
    ? time
    : null;
}

function runningDays(
  row: any,
) {
  const first =
    safeDateMs(
      row.first_seen_at,
    );

  if (first == null) {
    return null;
  }

  const last =
    safeDateMs(
      row.last_seen_at,
    ) ??
    Date.now();

  return Math.max(
    1,
    Math.floor(
      (last - first) /
        86_400_000,
    ) + 1,
  );
}

function buildHook(
  row: any,
) {
  const text =
    String(
      row.primary_text ??
        row.headline ??
        "",
    )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (!text) {
    return null;
  }

  return (
    text
      .split(
        /[.!?।！？]/,
      )[0]
      ?.trim()
      .slice(
        0,
        90,
      ) ||
    null
  );
}

function buildTop(
  counts: Map<
    string,
    number
  >,
  limit = 5,
) {
  return Array.from(
    counts.entries(),
  )
    .sort(
      (a, b) =>
        b[1] -
        a[1],
    )
    .slice(
      0,
      limit,
    )
    .map(
      ([label, count]) => ({
        label,
        count,
      }),
    );
}

function deriveIntelligence(
  rows: any[],
): Intelligence {
  const creators =
    new Map<
      string,
      number
    >();

  const offers =
    new Map<
      string,
      number
    >();

  const hooks =
    new Map<
      string,
      number
    >();

  let longest:
    | {
        advertiserName?: string | null;
        headline?: string | null;
        runningDays?: number | null;
      }
    | null = null;

  for (const row of rows) {
    const creator =
      String(
        row.creator_name ??
          "",
      ).trim();

    if (creator) {
      creators.set(
        creator,
        (creators.get(
          creator,
        ) ?? 0) + 1,
      );
    }

    const offer =
      String(
        row.offer ??
          "",
      ).trim();

    if (offer) {
      offers.set(
        offer,
        (offers.get(
          offer,
        ) ?? 0) + 1,
      );
    }

    const hook =
      buildHook(row);

    if (hook) {
      hooks.set(
        hook,
        (hooks.get(
          hook,
        ) ?? 0) + 1,
      );
    }

    const days =
      runningDays(row);

    if (
      days != null &&
      (
        !longest ||
        days >
          Number(
            longest.runningDays ??
              0,
          )
      )
    ) {
      longest = {
        advertiserName:
          row.advertiser_name ??
          null,
        headline:
          row.headline ??
          null,
        runningDays:
          days,
      };
    }
  }

  return {
    topCreators:
      buildTop(
        creators,
      ),

    topOffers:
      buildTop(
        offers,
      ),

    topHooks:
      buildTop(
        hooks,
      ),

    longestRunningAd:
      longest,

    reach: {
      status:
        "unavailable",

      reason:
        "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
    },
  };
}

function mapCreative(
  row: any,
  markets: any[],
  languages: any[],
): CompetitorAd & {
  brandId?: string | null;
  dataProvenance?: Record<
    string,
    DataSource
  >;
  languages?: Array<{
    code: string;
    name: string;
    source: DataSource;
    confidence?: number | null;
  }>;
  markets?: Array<{
    countryCode: string;
    countryName?: string | null;
    stateName?: string | null;
    cityName?: string | null;
    regionName?: string | null;
    source: DataSource;
    confidence?: number | null;
  }>;
} {
  const creativeMarkets =
    markets.filter(
      (market) =>
        market.creative_id ===
        row.id,
    );

  const creativeLanguages =
    languages.filter(
      (language) =>
        language.creative_id ===
        row.id,
    );

  return {
    id:
      row.external_ad_id ??
      row.external_ad_key ??
      row.id,

    platform:
      row.platform,

    advertiserName:
      row.advertiser_name,

    advertiserId:
      row.advertiser_id ??
      null,

    creatorName:
      row.creator_name ??
      null,

    partnershipType:
      row.partnership_type ??
      "unknown",

    country:
      creativeMarkets[0]
        ?.country ??
      null,

    creativeType:
      row.creative_type ??
      "unknown",

    imageUrl:
      row.image_url ??
      null,

    videoUrl:
      row.video_url ??
      null,

    thumbnailUrl:
      row.thumbnail_url ??
      null,

    videoDurationSeconds:
      row.video_duration_seconds ??
      null,

    primaryText:
      row.primary_text ??
      null,

    headline:
      row.headline ??
      null,

    description:
      row.description ??
      null,

    callToAction:
      row.call_to_action ??
      null,

    firstSeen:
      row.first_seen_at ??
      null,

    lastSeen:
      row.last_seen_at ??
      null,

    isActive:
      row.is_currently_active ??
      null,

    publisherPlatforms:
      row.metadata
        ?.publisherPlatforms ??
      [],

    landingPage:
      row.landing_page_url ??
      null,

    sourceUrl:
      row.source_url ??
      null,

    productName:
      row.product_name ??
      null,

    productPrice:
      row.product_price ??
      null,

    maxPrice:
      row.max_price ??
      null,

    currency:
      row.currency ??
      null,

    offer:
      row.offer ??
      null,

    runningDays:
      runningDays(row),

    creativeScore:
      null,

    impressions:
      null,

    reach:
      null,

    clicks:
      null,

    ctr:
      null,

    transcript:
      row.transcript ??
      null,

    transcriptStatus:
      row.transcript_status ??
      "not_video",

    metricSources: {
      creativeScore:
        "unavailable",

      longevityScore:
        "derived",

      relevanceScore:
        "unavailable",

      engagementPotentialScore:
        "unavailable",

      reach:
        "unavailable",

      clicks:
        "unavailable",

      ctr:
        "unavailable",

      impressions:
        "unavailable",
    },

    longevityScore:
      undefined,

    relevanceScore:
      undefined,

    engagementPotentialScore:
      undefined,

    intelligence:
      undefined,

    metadata:
      row.metadata ??
      {},

    brandId:
      row.brand_id ??
      null,

    dataProvenance:
      row.data_provenance ??
      {},

    languages:
      creativeLanguages.map(
        (item) => ({
          code:
            item.language_code,

          name:
            item.language_name ??
            item.language_code,

          source:
            item.source ===
            "provider"
              ? "provider"
              : "heuristic",

          confidence:
            item.confidence ??
            null,
        }),
      ),

    markets:
      creativeMarkets.map(
        (item) => ({
          countryCode:
            item.country,

          countryName:
            item.country_name ??
            null,

          stateName:
            item.state_name ??
            null,

          cityName:
            item.city_name ??
            null,

          regionName:
            item.region ??
            null,

          source:
            item.source ===
            "provider"
              ? "provider"
              : "derived",

          confidence:
            item.confidence ??
            null,
        }),
      ),
  } as any;
}

export async function searchGlobalAdsAccurate(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode: SearchMode;
    page: number;
    limit: number;
  },
) {
  const client =
    createGlobalServiceClient();

  const query =
    input.query.trim();

  const country =
    input.country
      .trim()
      .toUpperCase();

  /*
   * First determine which creatives are actually
   * associated with the requested country.
   *
   * This is what the old search implementation
   * explicitly did not do. 
   */
  const {
    data: marketRows,
    error: marketError,
  } =
    await client
      .from(
        "ad_intelligence_markets",
      )
      .select(
        "creative_id",
      )
      .eq(
        "country",
        country,
      );

  if (marketError) {
    throw new Error(
      `Failed to resolve country results: ${marketError.message}`,
    );
  }

  const creativeIds =
    Array.from(
      new Set(
        (
          marketRows ??
          []
        ).map(
          (row: any) =>
            String(
              row.creative_id,
            ),
        ),
      ),
    );

  if (
    creativeIds.length ===
    0
  ) {
    return {
      ads: [],
      total: 0,
      page: input.page,
      limit: input.limit,
      totalPages: 0,
      summary: {
        totalAds: 0,
        activeAds: 0,
        inactiveAds: 0,
        videoAds: 0,
        imageAds: 0,
        carouselAds: 0,
        creatorAds: 0,
        averageRunningDays: 0,
        longestRunningDays: 0,
      } satisfies SearchSummary,
      intelligence:
        deriveIntelligence(
          [],
        ),
      languages: [],
      markets: [],
      lastUpdatedAt: null,
    };
  }

  let creativeQuery =
    client
      .from(
        "ad_intelligence_creatives",
      )
      .select("*")
      .eq(
        "platform",
        input.platform,
      )
      .in(
        "id",
        creativeIds,
      );

  const escaped =
    escapeLike(
      query,
    );

  if (
    input.mode ===
    "advertiser"
  ) {
    creativeQuery =
      creativeQuery.ilike(
        "advertiser_name",
        `%${escaped}%`,
      );
  } else {
    creativeQuery =
      creativeQuery.or(
        [
          `advertiser_name.ilike.%${escaped}%`,
          `creator_name.ilike.%${escaped}%`,
          `headline.ilike.%${escaped}%`,
          `product_name.ilike.%${escaped}%`,
          `primary_text.ilike.%${escaped}%`,
          `description.ilike.%${escaped}%`,
          `offer.ilike.%${escaped}%`,
          `landing_page_url.ilike.%${escaped}%`,
        ].join(","),
      );
  }

  const {
    data: allRows,
    error:
      creativeError,
  } =
    await creativeQuery
      .order(
        "is_currently_active",
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .order(
        "last_seen_at",
        {
          ascending: false,
          nullsFirst: false,
        },
      );

  if (creativeError) {
    throw new Error(
      `Accurate global search failed: ${creativeError.message}`,
    );
  }

  const rows =
    allRows ?? [];

  /*
   * Calculate global statistics from the entire
   * filtered dataset, not just page 1.
   */
  const activeRows =
    rows.filter(
      (row: any) =>
        row.is_currently_active !==
        false,
    );

  const videoAds =
    rows.filter(
      (row: any) =>
        row.creative_type ===
        "video",
    ).length;

  const imageAds =
    rows.filter(
      (row: any) =>
        row.creative_type ===
        "image",
    ).length;

  const carouselAds =
    rows.filter(
      (row: any) =>
        row.creative_type ===
        "carousel",
    ).length;

  const creatorAds =
    rows.filter(
      (row: any) =>
        Boolean(
          String(
            row.creator_name ??
              "",
          ).trim(),
        ),
    ).length;

  const running =
    rows
      .map(
        runningDays,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(
            value,
          ),
      );

  const averageRunningDays =
    running.length
      ? running.reduce(
          (
            sum,
            value,
          ) =>
            sum + value,
          0,
        ) /
        running.length
      : 0;

  const longestRunningDays =
    running.length
      ? Math.max(
          ...running,
        )
      : 0;

  const total =
    rows.length;

  const totalPages =
    total > 0
      ? Math.ceil(
          total /
            input.limit,
        )
      : 0;

  const from =
    Math.max(
      0,
      input.page - 1,
    ) *
    input.limit;

  const pageRows =
    rows.slice(
      from,
      from + input.limit,
    );

  const pageIds =
    pageRows.map(
      (row: any) =>
        row.id,
    );

  let markets: any[] =
    [];

  let languages: any[] =
    [];

  if (
    pageIds.length
  ) {
    const [
      marketResult,
      languageResult,
    ] =
      await Promise.all([
        client
          .from(
            "ad_intelligence_markets",
          )
          .select("*")
          .in(
            "creative_id",
            pageIds,
          ),

        client
          .from(
            "ad_intelligence_languages",
          )
          .select("*")
          .in(
            "creative_id",
            pageIds,
          ),
      ]);

    if (
      marketResult.error
    ) {
      throw new Error(
        `Failed to load markets: ${marketResult.error.message}`,
      );
    }

    if (
      languageResult.error
    ) {
      throw new Error(
        `Failed to load languages: ${languageResult.error.message}`,
      );
    }

    markets =
      marketResult.data ??
      [];

    languages =
      languageResult.data ??
      [];
  }

  const ads =
    pageRows.map(
      (row: any) =>
        mapCreative(
          row,
          markets,
          languages,
        ),
    );

  const latest =
    rows.reduce<
      string | null
    >(
      (
        latestValue,
        row: any,
      ) => {
        const value =
          row.updated_at ??
          row.last_seen_at ??
          row.first_seen_at ??
          null;

        if (!value) {
          return latestValue;
        }

        if (!latestValue) {
          return String(
            value,
          );
        }

        return new Date(
          value,
        ).getTime() >
          new Date(
            latestValue,
          ).getTime()
          ? String(value)
          : latestValue;
      },
      null,
    );

  return {
    ads,

    total,

    page:
      input.page,

    limit:
      input.limit,

    totalPages,

    lastUpdatedAt:
      latest,

    summary: {
      totalAds:
        total,

      activeAds:
        activeRows.length,

      inactiveAds:
        Math.max(
          0,
          total -
            activeRows.length,
        ),

      videoAds,

      imageAds,

      carouselAds,

      creatorAds,

      averageRunningDays:
        Math.round(
          averageRunningDays,
        ),

      longestRunningDays,
    } satisfies SearchSummary,

    intelligence:
      deriveIntelligence(
        rows,
      ),

    languages,

    markets,
  };
}