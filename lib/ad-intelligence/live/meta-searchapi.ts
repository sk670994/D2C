import "server-only";

import type { CompetitorAd } from "@/lib/ad-intelligence/types";

const ENDPOINT = "https://www.searchapi.io/api/v1/search";
const DEFAULT_COUNTRY = "IN";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 25;
const REQUEST_TIMEOUT_MS = 12_000;

type SearchApiImage = {
  url?: string | null;
  image_url?: string | null;
  resized_image_url?: string | null;
  width?: number | null;
  height?: number | null;
};

type SearchApiVideo = {
  hd_url?: string | null;
  sd_url?: string | null;
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  preview_image_url?: string | null;
  duration?: number | null;
};

type SearchApiSnapshot = {
  body?: { text?: string | null } | null;
  title?: string | null;
  link_description?: string | null;
  link_url?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  display_format?: string | null;
  images?: SearchApiImage[];
  videos?: SearchApiVideo[];
  page_name?: string | null;
  page_id?: string | null;
  page_profile_uri?: string | null;
  page_categories?: string[];
  page_like_count?: number | null;
};

type SearchApiAd = {
  ad_archive_id?: string | number | null;
  ad_details_token?: string | null;
  is_active?: boolean | null;
  page_id?: string | number | null;
  page_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  publisher_platform?: string[];
  snapshot?: SearchApiSnapshot | null;
  impressions_with_index?: {
    impressions_index?: number | null;
  } | null;
};

type SearchApiResponse = {
  search_information?: {
    total_results?: number | null;
    ads_count?: number | null;
  } | null;
  ads?: SearchApiAd[];
  pagination?: {
    next_page_token?: string | null;
  } | null;
};

export type LiveMetaSearchResult = {
  ads: CompetitorAd[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextPageToken: string | null;
  source: "searchapi_meta_ad_library";
};

function apiKey(): string | null {
  const value = process.env.SEARCHAPI_API_KEY?.trim();
  return value || null;
}

function positiveLimit(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value as number)));
}

function normalizeCountry(value?: string): string {
  const country = (value ?? DEFAULT_COUNTRY).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : DEFAULT_COUNTRY;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function safeDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function runningDays(start?: string | null, end?: string | null): number | null {
  const first = safeDate(start);
  if (!first) return null;

  const startMs = new Date(first).getTime();
  const candidateEnd = safeDate(end);
  const endMs = candidateEnd ? new Date(candidateEnd).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;

  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function firstImage(snapshot?: SearchApiSnapshot | null): string | null {
  const image = snapshot?.images?.find(Boolean);
  return cleanText(image?.resized_image_url ?? image?.image_url ?? image?.url);
}

function firstVideo(snapshot?: SearchApiSnapshot | null): string | null {
  const video = snapshot?.videos?.find(Boolean);
  return cleanText(video?.video_hd_url ?? video?.hd_url ?? video?.video_sd_url ?? video?.sd_url ?? video?.url);
}

function firstThumbnail(snapshot?: SearchApiSnapshot | null): string | null {
  const video = snapshot?.videos?.find(Boolean);
  return cleanText(
    video?.preview_image_url ??
      video?.thumbnail_url ??
      firstImage(snapshot),
  );
}

function detectCreativeType(snapshot?: SearchApiSnapshot | null): CompetitorAd["creativeType"] {
  const format = cleanText(snapshot?.display_format)?.toLowerCase();
  if (format?.includes("carousel") || (snapshot?.images?.length ?? 0) > 1) return "carousel";
  if ((snapshot?.videos?.length ?? 0) > 0) return "video";
  if ((snapshot?.images?.length ?? 0) > 0) return "image";
  return "unknown";
}

function normalizePublisherPlatforms(values?: string[]): string[] {
  return (values ?? [])
    .map((value) => value.replace(/_/g, " ").toLowerCase())
    .map((value) => value.replace(/\b\w/g, (char) => char.toUpperCase()))
    .filter(Boolean);
}

function sourceUrl(adId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;
}

function mapAd(ad: SearchApiAd, query: string, country: string): CompetitorAd | null {
  const id = String(ad.ad_archive_id ?? "").trim();
  if (!id) return null;

  const snapshot = ad.snapshot ?? null;
  const advertiserName =
    cleanText(ad.page_name) ??
    cleanText(snapshot?.page_name) ??
    query;

  const pageId = String(ad.page_id ?? snapshot?.page_id ?? "").trim() || null;
  const imageUrl = firstImage(snapshot);
  const videoUrl = firstVideo(snapshot);
  const thumbnailUrl = firstThumbnail(snapshot);
  const creativeType = detectCreativeType(snapshot);
  const primaryText = cleanText(snapshot?.body?.text);
  const headline = cleanText(snapshot?.title);
  const description = cleanText(snapshot?.link_description);
  const cta = cleanText(snapshot?.cta_text) ?? cleanText(snapshot?.cta_type);
  const firstSeen = safeDate(ad.start_date);
  const lastSeen = safeDate(ad.end_date);
  const publishers = normalizePublisherPlatforms(ad.publisher_platform);

  const duration = snapshot?.videos?.find((video) => Number.isFinite(video.duration ?? NaN))?.duration;
  const videoDurationSeconds =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? Math.round(duration)
      : null;

  return {
    id,
    platform: "meta",
    advertiserName,
    advertiserId: pageId,
    creatorName: null,
    partnershipType: "direct",
    country,
    creativeType,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    videoDurationSeconds,
    primaryText,
    headline,
    description,
    callToAction: cta,
    firstSeen,
    lastSeen,
    isActive: ad.is_active ?? null,
    publisherPlatforms: publishers,
    landingPage: cleanText(snapshot?.link_url),
    sourceUrl: sourceUrl(id),
    productName: null,
    productPrice: null,
    maxPrice: null,
    currency: null,
    offer: null,
    runningDays: runningDays(ad.start_date, ad.end_date),
    creativeScore: null,
    impressions: null,
    impressionsMin: null,
    impressionsMax: null,
    reach: null,
    reachMin: null,
    reachMax: null,
    clicks: null,
    ctr: null,
    transcript: null,
    transcriptStatus: creativeType === "video" ? "unavailable" : "not_video",
    longevityScore: 0,
    relevanceScore: 0,
    engagementPotentialScore: 0,
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
    intelligence: {
      rankingReasons: ["Live Meta Ad Library result"],
      badges: ["LIVE"],
    },
    metadata: {
      providerSource: "searchapi_meta_ad_library",
      live: true,
      query,
      adArchiveId: id,
      adDetailsToken: ad.ad_details_token ?? null,
      impressionsIndex: ad.impressions_with_index?.impressions_index ?? null,
    },
  };
}

async function request(
  input: {
    query: string;
    pageId?: string | null;
    country?: string;
    nextPageToken?: string | null;
  },
): Promise<SearchApiResponse> {
  const key = apiKey();
  if (!key) {
    throw new Error("SEARCHAPI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const isNextPage = Boolean(input.nextPageToken);
    const params = new URLSearchParams({
      engine: "meta_ad_library",
    });

    if (!isNextPage) {
      params.set("active_status", "all");
      params.set("ad_type", "all");
      params.set("country", normalizeCountry(input.country));
      params.set("media_type", "all");
      params.set("is_targeted_country", "false");
      if (input.pageId) {
        params.set("page_id", input.pageId);
      } else {
        params.set("q", input.query);
      }
      params.set("sort_by", "most_recent");
    }

    const response = await fetch(
      `${ENDPOINT}${params.toString() ? `?${params.toString()}` : ""}`,
      {
        method: isNextPage ? "POST" : "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
          ...(isNextPage ? { "Content-Type": "application/json" } : {}),
        },
        ...(isNextPage
          ? {
              body: JSON.stringify({
                engine: "meta_ad_library",
                next_page_token: input.nextPageToken,
              }),
            }
          : {}),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`SearchAPI Meta Ad Library ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    return (await response.json()) as SearchApiResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchMetaAdsLive(input: {
  query: string;
  pageId?: string | null;
  country?: string;
  page?: number;
  limit?: number;
  nextPageToken?: string | null;
}): Promise<LiveMetaSearchResult> {
  const query = input.query.trim();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = positiveLimit(input.limit);
  const country = normalizeCountry(input.country);

  if (query.length < 2) {
    return {
      ads: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      nextPageToken: null,
      source: "searchapi_meta_ad_library",
    };
  }

  const data = await request({
    query,
    pageId: input.pageId ?? null,
    country,
    nextPageToken: input.nextPageToken ?? null,
  });

  const mapped = (data.ads ?? [])
    .map((ad) => mapAd(ad, query, country))
    .filter((ad): ad is CompetitorAd => Boolean(ad));

  const total = Number(
    data.search_information?.total_results ??
      data.search_information?.ads_count ??
      0,
  );

  return {
    ads: mapped.slice(0, limit),
    total: Number.isFinite(total) ? Math.max(0, Math.floor(total)) : mapped.length,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : mapped.length ? page : 0,
    nextPageToken: cleanText(data.pagination?.next_page_token),
    source: "searchapi_meta_ad_library",
  };
}
