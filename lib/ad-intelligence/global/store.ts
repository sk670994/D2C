import "server-only";

import type { AdPlatform, CompetitorAd } from "../types";
import { createGlobalServiceClient } from "./supabase";
import type { CollectionJob, CollectionJobStatus, GlobalAdRecord, GlobalLanguage, GlobalMarket, GlobalSearchResult, GlobalSearchSummary } from "./types";

export function normalizeCollectionQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildCollectionKey(input: { query: string; country: string; platform: AdPlatform; mode: "advertiser" | "keyword" }): string {
  return [input.platform, input.mode, input.country.trim().toUpperCase(), normalizeCollectionQuery(input.query)].join("|");
}

function mapJob(row: any): CollectionJob {
  return {
    id: row.id,
    collectionKey: row.collection_key,
    query: row.query,
    country: row.country,
    platform: row.platform,
    mode: row.mode,
    status: row.status as CollectionJobStatus,
    stage: row.stage as CollectionJobStatus,
    discoveredAds: Number(row.discovered_ads ?? 0),
    normalizedAds: Number(row.normalized_ads ?? 0),
    persistedAds: Number(row.persisted_ads ?? 0),
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    lastRequestedAt: row.last_requested_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function getCollectionJob(jobId: string): Promise<CollectionJob | null> {
  const { data, error } = await createGlobalServiceClient().from("ad_intelligence_collection_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`Failed to read collection job: ${error.message}`);
  return data ? mapJob(data) : null;
}

export async function getOrCreateCollectionJob(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
}): Promise<CollectionJob> {
  const client = createGlobalServiceClient();
  const query = input.query.trim();
  const country = input.country.trim().toUpperCase();
  const collectionKey = buildCollectionKey({ ...input, query, country });
  const now = new Date().toISOString();

  const { error: insertError } = await client.from("ad_intelligence_collection_jobs").insert({
    collection_key: collectionKey,
    query,
    country,
    platform: input.platform,
    mode: input.mode,
    status: "queued",
    stage: "queued",
    last_requested_at: now,
  });

  if (insertError && insertError.code !== "23505") {
    throw new Error(`Failed to create collection job: ${insertError.message}`);
  }

  const { data, error } = await client.from("ad_intelligence_collection_jobs").select("*").eq("collection_key", collectionKey).single();
  if (error || !data) throw new Error(`Failed to load collection job: ${error?.message ?? "missing row"}`);
  return mapJob(data);
}

/** Atomically decides whether a stale/new collection should be queued. */
export async function requestCollectionRefresh(job: CollectionJob, minIntervalMinutes = 10): Promise<{ job: CollectionJob; shouldEnqueue: boolean }> {
  const client = createGlobalServiceClient();
  const cutoff = new Date(Date.now() - minIntervalMinutes * 60_000).toISOString();
  const now = new Date().toISOString();

  if (job.status === "queued" || job.status === "scraping" || job.status === "normalizing" || job.status === "enriching" || job.status === "finalizing") {
    return { job, shouldEnqueue: false };
  }

  const { data } = await client.from("ad_intelligence_collection_jobs")
    .update({ status: "queued", stage: "queued", last_requested_at: now, error_message: null, completed_at: null, updated_at: now })
    .eq("id", job.id)
    .in("status", ["complete", "failed"])
    .lt("last_requested_at", cutoff)
    .select("*")
    .maybeSingle();

  if (data) return { job: mapJob(data), shouldEnqueue: true };

  const latest = await getCollectionJob(job.id);
  if (!latest) throw new Error("Collection job disappeared while requesting refresh.");
  return { job: latest, shouldEnqueue: false };
}


export async function claimCollectionDispatch(jobId: string): Promise<boolean> {
  const client = createGlobalServiceClient();
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() - 2 * 60_000).toISOString();

  const { data, error } = await client
    .from("ad_intelligence_collection_jobs")
    .update({ dispatch_claimed_at: now, updated_at: now })
    .eq("id", jobId)
    .eq("status", "queued")
    .or(`dispatch_claimed_at.is.null,dispatch_claimed_at.lt.${expiry}`)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to claim collection dispatch: ${error.message}`);
  return Boolean(data);
}

export async function updateCollectionJob(jobId: string, patch: Partial<{
  status: CollectionJobStatus;
  stage: CollectionJobStatus;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}>): Promise<CollectionJob> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.stage !== undefined) payload.stage = patch.stage;
  if (patch.discoveredAds !== undefined) payload.discovered_ads = patch.discoveredAds;
  if (patch.normalizedAds !== undefined) payload.normalized_ads = patch.normalizedAds;
  if (patch.persistedAds !== undefined) payload.persisted_ads = patch.persistedAds;
  if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage;
  if (patch.startedAt !== undefined) payload.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;

  const { error } = await createGlobalServiceClient().from("ad_intelligence_collection_jobs").update(payload).eq("id", jobId);
  if (error) throw new Error(`Failed to update collection job: ${error.message}`);
  const job = await getCollectionJob(jobId);
  if (!job) throw new Error("Collection job disappeared after update.");
  return job;
}

function escapeLike(value: string): string {
  return value.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

function safeDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function runningDays(row: any): number | null {
  const first = safeDateMs(row.first_seen_at);
  if (first == null) return null;
  const last = safeDateMs(row.last_seen_at) ?? Date.now();
  return Math.max(1, Math.floor((last - first) / 86_400_000) + 1);
}

function mapCreativeRow(row: any, languages: any[], markets: any[]): GlobalAdRecord {
  const attachedLanguages = languages.filter((item) => item.creative_id === row.id);
  const attachedMarkets = markets.filter((item) => item.creative_id === row.id);
  return {
    id: row.external_ad_id ?? row.external_ad_key ?? row.id,
    platform: row.platform,
    advertiserName: row.advertiser_name,
    advertiserId: row.advertiser_id ?? null,
    creatorName: row.creator_name ?? null,
    partnershipType: row.partnership_type ?? "unknown",
    country: attachedMarkets[0]?.country ?? row.metadata?.country ?? null,
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
    publisherPlatforms: row.metadata?.publisherPlatforms ?? [],
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
    languages: attachedLanguages.map((item) => ({ code: item.language_code, name: item.language_name ?? item.language_code, source: item.source === "provider" ? "provider" : "heuristic", confidence: item.confidence ?? null })),
    markets: attachedMarkets.map((item) => ({ countryCode: item.country, countryName: item.country_name ?? null, stateName: item.state_name ?? null, cityName: item.city_name ?? null, regionName: item.region ?? null, source: item.source === "provider" ? "provider" : "derived", confidence: item.confidence ?? null })),
  };
}

export async function searchGlobalAds(input: { query: string; country: string; platform: AdPlatform; page: number; limit: number }): Promise<Omit<GlobalSearchResult, "collectionJobId" | "isRefreshing">> {
  const client = createGlobalServiceClient();
  const q = escapeLike(input.query);
  const country = input.country.trim().toUpperCase();
  const { data: rollup, error: rollupError } = await client.rpc("get_ad_intelligence_rollup", { p_query: q, p_country: country, p_platform: input.platform });
  if (rollupError) throw new Error(`Global rollup failed: ${rollupError.message}`);

  const summary = rollup as {
    totalAds: number;
    activeAds: number;
    inactiveAds: number;
    videoAds: number;
    imageAds: number;
    carouselAds: number;
    creatorAds: number;
    averageRunningDays: number;
    longestRunningDays: number;
    languages: GlobalLanguage[];
    markets: GlobalMarket[];
  };

  let candidateIds: string[] | null = null;
  if (country) {
    const { data: marketMatches, error: marketError } = await client
      .from("ad_intelligence_markets")
      .select("creative_id")
      .eq("country", country)
      .limit(20000);
    if (marketError) throw new Error(`Country filter failed: ${marketError.message}`);
    candidateIds = Array.from(new Set((marketMatches ?? []).map((row: any) => row.creative_id)));
    if (candidateIds.length === 0) {
      return {
        ads: [], total: 0, totalPages: 0, page: input.page, limit: input.limit,
        languages: summary.languages ?? [], markets: summary.markets ?? [],
        summary: { totalAds: Number(summary.totalAds ?? 0), activeAds: Number(summary.activeAds ?? 0), inactiveAds: Number(summary.inactiveAds ?? 0), videoAds: Number(summary.videoAds ?? 0), imageAds: Number(summary.imageAds ?? 0), carouselAds: Number(summary.carouselAds ?? 0), creatorAds: Number(summary.creatorAds ?? 0), averageRunningDays: Number(summary.averageRunningDays ?? 0), longestRunningDays: Number(summary.longestRunningDays ?? 0) },
        lastUpdatedAt: null,
      };
    }
  }

  let query = client.from("ad_intelligence_creatives").select("*", { count: "exact" }).eq("platform", input.platform)
    .or([`advertiser_name.ilike.%${q}%`, `creator_name.ilike.%${q}%`, `headline.ilike.%${q}%`, `product_name.ilike.%${q}%`, `primary_text.ilike.%${q}%`].join(","))
    .order("is_currently_active", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false, nullsFirst: false });

  if (candidateIds) query = query.in("id", candidateIds);

  const { data: rows, count, error } = await query.range((input.page - 1) * input.limit, input.page * input.limit - 1);
  if (error) throw new Error(`Global search failed: ${error.message}`);

  const pageRows = rows ?? [];
  const ids = pageRows.map((row: any) => row.id);
  let markets: any[] = [];
  let languages: any[] = [];
  if (ids.length) {
    const [marketResult, languageResult] = await Promise.all([
      client.from("ad_intelligence_markets").select("*").in("creative_id", ids),
      client.from("ad_intelligence_languages").select("*").in("creative_id", ids),
    ]);
    if (marketResult.error) throw new Error(`Failed to load markets: ${marketResult.error.message}`);
    if (languageResult.error) throw new Error(`Failed to load languages: ${languageResult.error.message}`);
    markets = marketResult.data ?? [];
    languages = languageResult.data ?? [];
  }

  const ads = pageRows.map((row: any) => mapCreativeRow(row, languages, markets));
  const lastUpdatedAt = pageRows.reduce<string | null>((latest, row: any) => {
    const value = row.updated_at ?? row.last_seen_at ?? null;
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);

  return {
    ads,
    total: Number(count ?? summary.totalAds ?? 0),
    totalPages: Number(count ?? summary.totalAds ?? 0) === 0 ? 0 : Math.ceil(Number(count ?? summary.totalAds ?? 0) / input.limit),
    page: input.page,
    limit: input.limit,
    languages: summary.languages ?? [],
    markets: summary.markets ?? [],
    summary: {
      totalAds: Number(summary.totalAds ?? 0),
      activeAds: Number(summary.activeAds ?? 0),
      inactiveAds: Number(summary.inactiveAds ?? 0),
      videoAds: Number(summary.videoAds ?? 0),
      imageAds: Number(summary.imageAds ?? 0),
      carouselAds: Number(summary.carouselAds ?? 0),
      creatorAds: Number(summary.creatorAds ?? 0),
      averageRunningDays: Number(summary.averageRunningDays ?? 0),
      longestRunningDays: Number(summary.longestRunningDays ?? 0),
    },
    lastUpdatedAt,
  };
}

export async function autocompleteBrands(input: {
  query: string;
  limit?: number;
}) {
  const totalStartedAt = Date.now();

  const client = createGlobalServiceClient();

  const prefix = normalizeCollectionQuery(input.query);

  const limit = Math.min(
    Math.max(input.limit ?? 8, 1),
    20,
  );

  if (!prefix) {
    return [];
  }

  console.log("[AutocompleteStore] START", {
    prefix,
    limit,
  });

  const aliasStartedAt = Date.now();

  const {
    data: aliases,
    error,
  } = await client
    .from("ad_intelligence_brand_aliases")
    .select(
      "brand_id,alias,normalized_alias",
    )
    .ilike(
      "normalized_alias",
      `${prefix}%`,
    )
    .order("normalized_alias")
    .limit(limit);

  console.log("[AutocompleteStore] ALIAS QUERY", {
    durationMs:
      Date.now() - aliasStartedAt,
    rows:
      aliases?.length ?? 0,
    error:
      error?.message ?? null,
  });

  if (error) {
    throw new Error(
      `Autocomplete failed: ${error.message}`,
    );
  }

  const ids = Array.from(
    new Set(
      (aliases ?? []).map(
        (row: any) => row.brand_id,
      ),
    ),
  );

  if (!ids.length) {
    console.log(
      "[AutocompleteStore] NO BRAND IDS",
    );

    return [];
  }

  const brandStartedAt = Date.now();

  const {
    data: brands,
    error: brandError,
  } = await client
    .from("ad_intelligence_brands")
    .select(
      "id,canonical_name,domain",
    )
    .in("id", ids);

  console.log("[AutocompleteStore] BRAND QUERY", {
    durationMs:
      Date.now() - brandStartedAt,
    rows:
      brands?.length ?? 0,
    error:
      brandError?.message ?? null,
  });

  if (brandError) {
    throw new Error(
      `Brand lookup failed: ${brandError.message}`,
    );
  }

  const brandMap = new Map(
    (brands ?? []).map(
      (brand: any) => [
        brand.id,
        brand,
      ],
    ),
  );

  const suggestions = (aliases ?? [])
    .map((alias: any) => {
      const brand = brandMap.get(
        alias.brand_id,
      );

      return brand
        ? {
            id: brand.id,
            name: brand.canonical_name,
            alias: alias.alias,
            domain:
              brand.domain ?? null,
          }
        : null;
    })
    .filter(Boolean);

  console.log("[AutocompleteStore] TOTAL", {
    prefix,
    durationMs:
      Date.now() - totalStartedAt,
    suggestions:
      suggestions.length,
  });

  return suggestions;
}
export async function trackBrand(input: { userId: string; query: string; country: string; platform: AdPlatform }) {
  const client = createGlobalServiceClient();
  const normalizedQuery = normalizeCollectionQuery(input.query);
  const { data: brand } = await client.from("ad_intelligence_brands").select("id").eq("normalized_name", normalizedQuery).maybeSingle();
  const { error } = await client.from("ad_intelligence_tracked_brands").upsert({
    user_id: input.userId,
    brand_id: brand?.id ?? null,
    query: input.query.trim(),
    normalized_query: normalizedQuery,
    country: input.country.trim().toUpperCase(),
    platform: input.platform,
    active: true,
  }, { onConflict: "user_id,normalized_query,country,platform" });
  if (error) throw new Error(`Failed to track brand: ${error.message}`);
}

export async function listTrackedBrands() {
  const client = createGlobalServiceClient();
  const { data, error } = await client.from("ad_intelligence_tracked_brands").select("id,query,country,platform,refresh_hours").eq("active", true);
  if (error) throw new Error(`Failed to load tracked brands: ${error.message}`);
  return (data ?? []).map((row: any) => ({ id: row.id, query: row.query, country: row.country, platform: row.platform as AdPlatform, refreshHours: Number(row.refresh_hours ?? 24) }));
}
