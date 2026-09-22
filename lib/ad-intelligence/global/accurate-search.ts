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
  unknownAds: number;
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
    advertiserName:
      | string
      | null;

    headline:
      | string
      | null;

    creativeType:
      | string
      | null;

    creatorName:
      | string
      | null;

    callToAction:
      | string
      | null;

    offer:
      | string
      | null;

    firstSeen:
      | string
      | null;

    lastSeen:
      | string
      | null;

    runningDays:
      | number
      | null;
  } | null;

  reach: {
    status:
      "unavailable";

    reason:
      string;
  };
};

type MetricsRow = {
  total_ads:
    | number
    | null;

  active_ads:
    | number
    | null;

  inactive_ads:
    | number
    | null;

  unknown_ads:
    | number
    | null;

  video_ads:
    | number
    | null;

  image_ads:
    | number
    | null;

  carousel_ads:
    | number
    | null;

  creator_ads:
    | number
    | null;

  average_running_days:
    | number
    | string
    | null;

  longest_running_days:
    | number
    | null;

  last_observed_at:
    | string
    | null;

  top_creators:
    | Array<{
        label: string;
        count: number;
      }>
    | null;

  top_offers:
    | Array<{
        label: string;
        count: number;
      }>
    | null;

  top_hooks:
    | Array<{
        label: string;
        count: number;
      }>
    | null;
};

type JsonObject =
  Record<string, unknown>;

type CreativeRow = {
  id: string;

  external_ad_id?:
    | string
    | null;

  external_ad_key?:
    | string
    | null;

  platform?:
    | string
    | null;

  advertiser_name?:
    | string
    | null;

  advertiser_id?:
    | string
    | null;

  creator_name?:
    | string
    | null;

  partnership_type?:
    | string
    | null;

  creative_type?:
    | string
    | null;

  image_url?:
    | string
    | null;

  video_url?:
    | string
    | null;

  thumbnail_url?:
    | string
    | null;

  video_duration_seconds?:
    | number
    | null;

  primary_text?:
    | string
    | null;

  headline?:
    | string
    | null;

  description?:
    | string
    | null;

  call_to_action?:
    | string
    | null;

  first_seen_at?:
    | string
    | null;

  last_seen_at?:
    | string
    | null;

  is_currently_active?:
    | boolean
    | null;

  landing_page_url?:
    | string
    | null;

  source_url?:
    | string
    | null;

  product_name?:
    | string
    | null;

  product_price?:
    | number
    | null;

  max_price?:
    | number
    | null;

  currency?:
    | string
    | null;

  offer?:
    | string
    | null;

  transcript?:
    | string
    | null;

  transcript_status?:
    | string
    | null;

  metadata?:
    | JsonObject
    | null;

  brand_id?:
    | string
    | null;

  data_provenance?:
    | JsonObject
    | null;

  updated_at?:
    | string
    | null;
};

type MarketRow = {
  creative_id: string;

  country?:
    | string
    | null;

  country_name?:
    | string
    | null;

  state_name?:
    | string
    | null;

  city_name?:
    | string
    | null;

  region?:
    | string
    | null;

  source?:
    | string
    | null;

  confidence?:
    | number
    | null;
};

type LanguageRow = {
  creative_id: string;

  language_code: string;

  language_name?:
    | string
    | null;

  source?:
    | string
    | null;

  confidence?:
    | number
    | null;
};

type CreativeSearchRow = {
  total_count:
    | number
    | string
    | null;

  creative:
    | CreativeRow
    | null;

  markets:
    | MarketRow[]
    | null;

  languages:
    | LanguageRow[]
    | null;
};

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is string =>
      typeof item ===
      "string",
  );
}

function jsonArray<T>(
  value: unknown,
): T[] {
  return Array.isArray(value)
    ? (value as T[])
    : [];
}

function normalizeText(
  value: unknown,
): string {
  return String(
    value ?? "",
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
): number | null {
  if (!value) {
    return null;
  }

  const timestamp =
    new Date(
      value,
    ).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null;
}

function runningDays(
  row: CreativeRow,
): number | null {
  const first =
    safeDateMs(
      row.first_seen_at,
    );

  if (
    first === null
  ) {
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

function mapCreative(
  row: CreativeRow,
  markets: MarketRow[],
  languages: LanguageRow[],
) {
  const attachedMarkets =
    markets.filter(
      (
        item,
      ) =>
        item.creative_id ===
        row.id,
    );

  const attachedLanguages =
    languages.filter(
      (
        item,
      ) =>
        item.creative_id ===
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
      attachedMarkets[0]
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
      stringArray(
        row.metadata
          ?.publisherPlatforms,
      ),

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

    longevityScore:
      undefined,

    relevanceScore:
      undefined,

    engagementPotentialScore:
      undefined,

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
      attachedLanguages.map(
        (
          item,
        ) => ({
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
      attachedMarkets.map(
        (
          item,
        ) => ({
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
  } as CompetitorAd & {
    brandId?:
      | string
      | null;

    dataProvenance?:
      Record<
        string,
        unknown
      >;

    languages?: Array<{
      code: string;
      name: string;
      source: DataSource;
      confidence?:
        | number
        | null;
    }>;

    markets?: Array<{
      countryCode:
        string;

      countryName?:
        | string
        | null;

      stateName?:
        | string
        | null;

      cityName?:
        | string
        | null;

      regionName?:
        | string
        | null;

      source: DataSource;

      confidence?:
        | number
        | null;
    }>;
  };
}

function emptyResult(
  page: number,
  limit: number,
) {
  return {
    ads:
      [] as CompetitorAd[],

    total:
      0,

    page,

    limit,

    totalPages:
      0,

    languages:
      [],

    markets:
      [],

    lastUpdatedAt:
      null,

    summary: {
      totalAds:
        0,

      activeAds:
        0,

      inactiveAds:
        0,

      unknownAds:
        0,

      videoAds:
        0,

      imageAds:
        0,

      carouselAds:
        0,

      creatorAds:
        0,

      averageRunningDays:
        0,

      longestRunningDays:
        0,
    } satisfies SearchSummary,

    intelligence: {
      topCreators:
        [],

      topOffers:
        [],

      topHooks:
        [],

      longestRunningAd:
        null,

      reach: {
        status:
          "unavailable" as const,

        reason:
          "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
      },
    },
  };
}

export async function searchGlobalAdsAccurate(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode: SearchMode;
    page: number;
    limit: number;
    advertiserPageId?:
      | string
      | undefined;
    language?:
      | string
      | undefined;
    region?:
      | string
      | undefined;
    creativeType?:
      | "video"
      | "image"
      | "carousel"
      | undefined;
    activeStatus?:
      | "active"
      | "inactive"
      | undefined;
  },
) {
  const client =
    createGlobalServiceClient();

  const query =
    normalizeText(
      input.query,
    );

  const country =
    normalizeText(
      input.country ||
        "IN",
    ).toUpperCase();

  const advertiserPageId =
    normalizeText(
      input.advertiserPageId,
    );

  if (
    query.length <
    2
  ) {
    return emptyResult(
      input.page,
      input.limit,
    );
  }

  /*
   * Metrics and creative page are fetched concurrently.
   *
   * Both RPCs use the same indexed predicate set so
   * totals and creative rows stay consistent.
   *
   * A selected Page ID is authoritative. There is no
   * JavaScript fallback to fuzzy advertiser-name matching.
   */
  const language =
    normalizeText(
      input.language,
    ).toLowerCase();

  const region =
    normalizeText(
      input.region,
    );

  const creativeType =
    input.creativeType ??
    "";

  const activeStatus =
    input.activeStatus ??
    "";

  const [
    metricsResult,
    creativeResult,
  ] =
    await Promise.all([
      client.rpc(
        "adspy_search_metrics_v2",
        {
          p_query:
            query,

          p_country:
            country,

          p_platform:
            input.platform,

          p_mode:
            input.mode,

          p_advertiser_page_id:
            advertiserPageId ||
            null,

          p_language:
            language ||
            null,

          p_region:
            region ||
            null,

          p_creative_type:
            creativeType ||
            null,

          p_active_status:
            activeStatus ||
            null,
        },
      ),

      client.rpc(
        "adspy_search_creatives_v4",
        {
          p_query:
            query,

          p_country:
            country,

          p_platform:
            input.platform,

          p_mode:
            input.mode,

          p_page:
            input.page,

          p_limit:
            input.limit,

          p_advertiser_page_id:
            advertiserPageId ||
            null,

          p_language:
            language ||
            null,

          p_region:
            region ||
            null,

          p_creative_type:
            creativeType ||
            null,

          p_active_status:
            activeStatus ||
            null,
        },
      ),
    ]);

  /*
   * IMPORTANT:
   * Keep the original Supabase payload constant.
   * The previous implementation attempted to reassign
   * metricsData, which produced TS2588.
   */
  const {
    data: initialMetricsData,
    error: initialMetricsError,
  } =
    metricsResult;

  if (
    initialMetricsError
  ) {
    throw new Error(
      `AdSpy metrics failed: ${initialMetricsError.message}`,
    );
  }

  let metrics =
    (
      Array.isArray(
        initialMetricsData,
      )
        ? initialMetricsData[0]
        : initialMetricsData
    ) as MetricsRow | null;

  const {
    data: initialCreativeRows,
    error: initialCreativeError,
  } =
    creativeResult;

  if (
    initialCreativeError
  ) {
    throw new Error(
      `AdSpy creative search failed: ${initialCreativeError.message}`,
    );
  }

  let normalizedRows =
    (
      initialCreativeRows ??
      []
    ) as unknown as CreativeSearchRow[];

  /*
   * COUNT(*) OVER() is present on every non-empty page.
   */
  const rpcTotal =
    Number(
      normalizedRows[0]
        ?.total_count ??
        0,
    );

  const metricsTotal =
    Number(
      metrics?.total_ads ??
        0,
    );

  const total =
    rpcTotal >
    0
      ? rpcTotal
      : metricsTotal;

  if (
    total === 0 &&
    normalizedRows.length === 0
  ) {
    return emptyResult(
      input.page,
      input.limit,
    );
  }

  const ads =
    normalizedRows
      .filter(
        (
          row,
        ) =>
          Boolean(
            row.creative,
          ),
      )
      .map(
        (
          row,
        ) =>
          mapCreative(
            row.creative as CreativeRow,
            jsonArray<MarketRow>(
              row.markets,
            ),
            jsonArray<LanguageRow>(
              row.languages,
            ),
          ),
      );

  const totalPages =
    total > 0
      ? Math.ceil(
          total /
            input.limit,
        )
      : 0;

  /*
   * Longest-running creative is deliberately NOT on the
   * first-search critical path.
   *
   * We use the metrics RPC for the summary number and let
   * the dedicated analysis layer handle detailed persistence.
   */
  const intelligence:
    Intelligence = {
    topCreators:
      metrics?.top_creators ??
      [],

    topOffers:
      metrics?.top_offers ??
      [],

    topHooks:
      metrics?.top_hooks ??
      [],

    longestRunningAd:
      metrics
        ? {
            advertiserName:
              null,

            headline:
              null,

            creativeType:
              null,

            creatorName:
              null,

            callToAction:
              null,

            offer:
              null,

            firstSeen:
              null,

            lastSeen:
              null,

            runningDays:
              Number(
                metrics.longest_running_days ??
                  0,
              ) ||
              null,
          }
        : null,

    reach: {
      status:
        "unavailable",

      reason:
        "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
    },
  };

  return {
    ads,

    total,

    page:
      input.page,

    limit:
      input.limit,

    totalPages,

    languages:
      normalizedRows.flatMap(
        (
          row,
        ) =>
          jsonArray<LanguageRow>(
            row.languages,
          ),
      ),

    markets:
      normalizedRows.flatMap(
        (
          row,
        ) =>
          jsonArray<MarketRow>(
            row.markets,
          ),
      ),

    lastUpdatedAt:
      metrics?.last_observed_at ??
      null,

    summary: {
      totalAds:
        total,

      activeAds:
        Number(
          metrics?.active_ads ??
            0,
        ),

      inactiveAds:
        Number(
          metrics?.inactive_ads ??
            0,
        ),

      unknownAds:
        Number(
          metrics?.unknown_ads ??
            0,
        ),

      videoAds:
        Number(
          metrics?.video_ads ??
            0,
        ),

      imageAds:
        Number(
          metrics?.image_ads ??
            0,
        ),

      carouselAds:
        Number(
          metrics?.carousel_ads ??
            0,
        ),

      creatorAds:
        Number(
          metrics?.creator_ads ??
            0,
        ),

      averageRunningDays:
        Math.round(
          Number(
            metrics?.average_running_days ??
              0,
          ),
        ),

      longestRunningDays:
        Number(
          metrics?.longest_running_days ??
            0,
        ),
    } satisfies SearchSummary,

    intelligence,
  };
}