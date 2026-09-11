import "server-only";

import type { AdPlatform, CompetitorAd } from "../types";
import { createGlobalServiceClient } from "./supabase";

type SearchMode = "advertiser" | "keyword";
type DataSource = "provider" | "heuristic" | "derived" | "unavailable";

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
  topCreators: Array<{ label: string; count: number }>;
  topOffers: Array<{ label: string; count: number }>;
  topHooks: Array<{ label: string; count: number }>;
  longestRunningAd: {
    advertiserName: string | null;
    headline: string | null;
    creativeType: string | null;
    creatorName: string | null;
    callToAction: string | null;
    offer: string | null;
    firstSeen: string | null;
    lastSeen: string | null;
    runningDays: number | null;
  } | null;
  reach: { status: "unavailable"; reason: string };
};

type MetricsRow = {
  total_ads: number | null;
  active_ads: number | null;
  inactive_ads: number | null;
  unknown_ads: number | null;
  video_ads: number | null;
  image_ads: number | null;
  carousel_ads: number | null;
  creator_ads: number | null;
  average_running_days: number | string | null;
  longest_running_days: number | null;
  last_observed_at: string | null;
  top_creators: Array<{ label: string; count: number }> | null;
  top_offers: Array<{ label: string; count: number }> | null;
  top_hooks: Array<{ label: string; count: number }> | null;
};

type JsonObject = Record<string, unknown>;

type CreativeRow = {
  id: string;
  external_ad_id?: string | null;
  external_ad_key?: string | null;
  platform?: string | null;
  advertiser_name?: string | null;
  advertiser_id?: string | null;
  creator_name?: string | null;
  partnership_type?: string | null;
  creative_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  video_duration_seconds?: number | null;
  primary_text?: string | null;
  headline?: string | null;
  description?: string | null;
  call_to_action?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_currently_active?: boolean | null;
  landing_page_url?: string | null;
  source_url?: string | null;
  product_name?: string | null;
  product_price?: number | null;
  max_price?: number | null;
  currency?: string | null;
  offer?: string | null;
  transcript?: string | null;
  transcript_status?: string | null;
  metadata?: JsonObject | null;
  brand_id?: string | null;
  data_provenance?: JsonObject | null;
  updated_at?: string | null;
};

type MarketRow = {
  creative_id: string;
  country?: string | null;
  country_name?: string | null;
  state_name?: string | null;
  city_name?: string | null;
  region?: string | null;
  source?: string | null;
  confidence?: number | null;
};

type LanguageRow = {
  creative_id: string;
  language_code: string;
  language_name?: string | null;
  source?: string | null;
  confidence?: number | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeDateMs(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function runningDays(row: CreativeRow) {
  const first = safeDateMs(row.first_seen_at);
  if (first === null) return null;
  const last = safeDateMs(row.last_seen_at) ?? Date.now();
  return Math.max(1, Math.floor((last - first) / 86_400_000) + 1);
}

function mapCreative(
  row: CreativeRow,
  markets: MarketRow[],
  languages: LanguageRow[],
) {
  const attachedMarkets = markets.filter((item) => item.creative_id === row.id);
  const attachedLanguages = languages.filter((item) => item.creative_id === row.id);

  return {
    id: row.external_ad_id ?? row.external_ad_key ?? row.id,
    platform: row.platform,
    advertiserName: row.advertiser_name,
    advertiserId: row.advertiser_id ?? null,
    creatorName: row.creator_name ?? null,
    partnershipType: row.partnership_type ?? "unknown",
    country: attachedMarkets[0]?.country ?? null,
    creativeType: row.creative_type ?? "unknown",
    imageUrl: row.image_url ?? null,
    videoUrl: row.video_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    videoDurationSeconds: row.video_duration_seconds ?? null,
    primaryText: row.primary_text ?? null,
    headline: row.headline ?? null,
    description: row.description ?? null,
    callToAction: row.call_to_action ?? null,
    firstSeen: row.first_seen_at ?? null,
    lastSeen: row.last_seen_at ?? null,
    isActive: row.is_currently_active ?? null,
    publisherPlatforms: stringArray(row.metadata?.publisherPlatforms),
    landingPage: row.landing_page_url ?? null,
    sourceUrl: row.source_url ?? null,
    productName: row.product_name ?? null,
    productPrice: row.product_price ?? null,
    maxPrice: row.max_price ?? null,
    currency: row.currency ?? null,
    offer: row.offer ?? null,
    runningDays: runningDays(row),
    creativeScore: null,
    impressions: null,
    reach: null,
    clicks: null,
    ctr: null,
    transcript: row.transcript ?? null,
    transcriptStatus: row.transcript_status ?? "not_video",
    longevityScore: undefined,
    relevanceScore: undefined,
    engagementPotentialScore: undefined,
    metricSources: {
      creativeScore: "unavailable",
      longevityScore: "derived",
      relevanceScore: "unavailable",
      engagementPotentialScore: "unavailable",
      reach: "unavailable",
      clicks: "unavailable",
      ctr: "unavailable",
      impressions: "unavailable",
    },
    intelligence: undefined,
    metadata: row.metadata ?? {},
    brandId: row.brand_id ?? null,
    dataProvenance: row.data_provenance ?? {},
    languages: attachedLanguages.map((item) => ({
      code: item.language_code,
      name: item.language_name ?? item.language_code,
      source: item.source === "provider" ? "provider" : "heuristic",
      confidence: item.confidence ?? null,
    })),
    markets: attachedMarkets.map((item) => ({
      countryCode: item.country,
      countryName: item.country_name ?? null,
      stateName: item.state_name ?? null,
      cityName: item.city_name ?? null,
      regionName: item.region ?? null,
      source: item.source === "provider" ? "provider" : "derived",
      confidence: item.confidence ?? null,
    })),
  } as CompetitorAd & {
    brandId?: string | null;
    dataProvenance?: Record<string, unknown>;
    languages?: Array<{ code: string; name: string; source: DataSource; confidence?: number | null }>;
    markets?: Array<{
      countryCode: string;
      countryName?: string | null;
      stateName?: string | null;
      cityName?: string | null;
      regionName?: string | null;
      source: DataSource;
      confidence?: number | null;
    }>;
  };
}

function emptyResult(page: number, limit: number) {
  return {
    ads: [] as CompetitorAd[],
    total: 0,
    page,
    limit,
    totalPages: 0,
    languages: [],
    markets: [],
    lastUpdatedAt: null,
    summary: {
      totalAds: 0,
      activeAds: 0,
      inactiveAds: 0,
      unknownAds: 0,
      videoAds: 0,
      imageAds: 0,
      carouselAds: 0,
      creatorAds: 0,
      averageRunningDays: 0,
      longestRunningDays: 0,
    } satisfies SearchSummary,
    intelligence: {
      topCreators: [],
      topOffers: [],
      topHooks: [],
      longestRunningAd: null,
      reach: {
        status: "unavailable" as const,
        reason: "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
      },
    },
  };
}

export async function searchGlobalAdsAccurate(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: SearchMode;
  page: number;
  limit: number;
  advertiserPageId?: string;
}) {
  const client = createGlobalServiceClient();
  const query = normalizeText(input.query);
  const country = normalizeText(input.country || "IN").toUpperCase();
  const advertiserPageId = normalizeText(input.advertiserPageId);

  if (query.length < 2) return emptyResult(input.page, input.limit);

  const [metricsResult, pageIdsResult] = await Promise.all([
    advertiserPageId
      ? client.rpc("adspy_search_metrics_by_advertiser", {
          p_page_id: advertiserPageId,
          p_country: country,
          p_platform: input.platform,
        })
      : client.rpc("adspy_search_metrics", {
          p_query: query,
          p_country: country,
          p_platform: input.platform,
          p_mode: input.mode,
        }),
    advertiserPageId
      ? client.rpc("adspy_search_page_ids_by_advertiser", {
          p_page_id: advertiserPageId,
          p_country: country,
          p_platform: input.platform,
          p_page: input.page,
          p_limit: input.limit,
        })
      : client.rpc("adspy_search_page_ids", {
          p_query: query,
          p_country: country,
          p_platform: input.platform,
          p_mode: input.mode,
          p_page: input.page,
          p_limit: input.limit,
        }),
  ]);

  const { data: metricsData, error: metricsError } = metricsResult;
  if (metricsError) {
    throw new Error(`AdSpy metrics failed: ${metricsError.message}`);
  }

  const metrics = (
    Array.isArray(metricsData) ? metricsData[0] : metricsData
  ) as MetricsRow | null;

  if (!metrics || Number(metrics.total_ads ?? 0) === 0) {
    return emptyResult(input.page, input.limit);
  }

  const { data: pageIdRows, error: pageIdError } = pageIdsResult;
  if (pageIdError) {
    throw new Error(`AdSpy page lookup failed: ${pageIdError.message}`);
  }

  const fetchedPageIds = Array.from(
    new Set(
      ((pageIdRows ?? []) as Array<{ creative_id: string }>).map((row) =>
        String(row.creative_id),
      ),
    ),
  );

  if (fetchedPageIds.length === 0) {
    return emptyResult(input.page, input.limit);
  }

  let creativeQuery = client
    .from("ad_intelligence_creatives")
    .select("*")
    .in("id", fetchedPageIds);

  // When a concrete advertiser Page ID was selected, the Page ID is authoritative.
  // Do not apply a second fuzzy advertiser-name filter.
  if (input.mode === "advertiser" && !advertiserPageId) {
    creativeQuery = creativeQuery.ilike(
      "advertiser_name",
      `%${query.replace(/[%_,]/g, " ")}%`,
    );
  } else if (input.mode === "keyword") {
    const safe = query.replace(/[%_,]/g, " ");
    creativeQuery = creativeQuery.or(
      [
        `advertiser_name.ilike.%${safe}%`,
        `creator_name.ilike.%${safe}%`,
        `headline.ilike.%${safe}%`,
        `product_name.ilike.%${safe}%`,
        `primary_text.ilike.%${safe}%`,
        `description.ilike.%${safe}%`,
        `offer.ilike.%${safe}%`,
        `landing_page_url.ilike.%${safe}%`,
      ].join(","),
    );
  }

  const { data: pageRows, error: pageError } = await creativeQuery
    .order("is_currently_active", {
      ascending: false,
      nullsFirst: false,
    })
    .order("last_seen_at", {
      ascending: false,
      nullsFirst: false,
    });

  if (pageError) {
    throw new Error(`AdSpy page query failed: ${pageError.message}`);
  }

  const rows = (pageRows ?? []) as CreativeRow[];
  const pageIds = rows.map((row) => row.id);
  let markets: MarketRow[] = [];
  let languages: LanguageRow[] = [];

  if (pageIds.length) {
    const [marketsResult, languagesResult] = await Promise.all([
      client
        .from("ad_intelligence_markets")
        .select("*")
        .in("creative_id", pageIds)
        .eq("country", country),
      client
        .from("ad_intelligence_languages")
        .select("*")
        .in("creative_id", pageIds),
    ]);

    if (marketsResult.error) {
      throw new Error(
        `AdSpy market enrichment failed: ${marketsResult.error.message}`,
      );
    }
    if (languagesResult.error) {
      throw new Error(
        `AdSpy language enrichment failed: ${languagesResult.error.message}`,
      );
    }

    markets = marketsResult.data ?? [];
    languages = languagesResult.data ?? [];
  }

  const ads = rows.map((row) => mapCreative(row, markets, languages));
  const total = Number(metrics.total_ads ?? 0);
  const totalPages = total > 0 ? Math.ceil(total / input.limit) : 0;

  const { data: longestRows, error: longestError } = advertiserPageId
    ? await client.rpc("adspy_search_longest_creative_by_advertiser", {
        p_page_id: advertiserPageId,
        p_country: country,
        p_platform: input.platform,
      })
    : await client.rpc("adspy_search_longest_creative", {
        p_query: query,
        p_country: country,
        p_platform: input.platform,
        p_mode: input.mode,
      });

  if (longestError) {
    throw new Error(
      `AdSpy longest creative lookup failed: ${longestError.message}`,
    );
  }

  const longestRow = Array.isArray(longestRows)
    ? longestRows[0] ?? null
    : longestRows ?? null;

  const longest = longestRow
    ? {
        advertiserName: longestRow.advertiser_name ?? null,
        headline: longestRow.headline ?? null,
        creativeType: longestRow.creative_type ?? null,
        creatorName: longestRow.creator_name ?? null,
        callToAction: longestRow.call_to_action ?? null,
        offer: longestRow.offer ?? null,
        firstSeen: longestRow.first_seen_at ?? null,
        lastSeen: longestRow.last_seen_at ?? null,
        runningDays: Number(longestRow.running_days ?? 0) || null,
      }
    : null;

  const intelligence: Intelligence = {
    topCreators: metrics.top_creators ?? [],
    topOffers: metrics.top_offers ?? [],
    topHooks: metrics.top_hooks ?? [],
    longestRunningAd:
      longest ?? {
        advertiserName: null,
        headline: null,
        creativeType: null,
        creatorName: null,
        callToAction: null,
        offer: null,
        firstSeen: null,
        lastSeen: null,
        runningDays: Number(metrics.longest_running_days ?? 0) || null,
      },
    reach: {
      status: "unavailable",
      reason:
        "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
    },
  };

  return {
    ads,
    total,
    page: input.page,
    limit: input.limit,
    totalPages,
    languages,
    markets,
    lastUpdatedAt: metrics.last_observed_at ?? null,
    summary: {
      totalAds: total,
      activeAds: Number(metrics.active_ads ?? 0),
      inactiveAds: Number(metrics.inactive_ads ?? 0),
      unknownAds: Number(metrics.unknown_ads ?? 0),
      videoAds: Number(metrics.video_ads ?? 0),
      imageAds: Number(metrics.image_ads ?? 0),
      carouselAds: Number(metrics.carousel_ads ?? 0),
      creatorAds: Number(metrics.creator_ads ?? 0),
      averageRunningDays: Math.round(
        Number(metrics.average_running_days ?? 0),
      ),
      longestRunningDays: Number(metrics.longest_running_days ?? 0),
    } satisfies SearchSummary,
    intelligence,
  };
}
