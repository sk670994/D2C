import "server-only";

import type { AdPlatform } from "../types";
import { createGlobalServiceClient } from "./supabase";
import type { CollectionJob, CollectionJobStatus, GlobalAdRecord } from "./types";

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

function buildHookLabel(row: any): string | null {
  const text = String(row.primary_text ?? row.headline ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const first = text.split(/[.!?。！？]/)[0]?.trim() ?? text;
  return first.slice(0, 90);
}

function buildDerivedIntelligence(rows: any[]) {
  const creatorCounts = new Map<string, number>();
  const offerCounts = new Map<string, number>();
  const hookCounts = new Map<string, number>();

  for (const row of rows) {
    const creator = String(row.creator_name ?? '').trim();
    if (creator) creatorCounts.set(creator, (creatorCounts.get(creator) ?? 0) + 1);

    const offer = String(row.offer ?? '').trim();
    if (offer) offerCounts.set(offer, (offerCounts.get(offer) ?? 0) + 1);

    const hook = buildHookLabel(row);
    if (hook) hookCounts.set(hook, (hookCounts.get(hook) ?? 0) + 1);
  }

  const top = (counts: Map<string, number>, limit = 5) =>
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));

  const longest = [...rows]
    .map((row) => ({
      id: row.external_ad_id ?? row.external_ad_key ?? row.id,
      advertiserName: row.advertiser_name ?? null,
      headline: row.headline ?? null,
      primaryText: row.primary_text ?? null,
      runningDays: runningDays(row),
      creativeType: row.creative_type ?? "unknown",
      creatorName: row.creator_name ?? null,
    }))
    .filter((row) => Number.isFinite(row.runningDays))
    .sort((a, b) => Number(b.runningDays ?? 0) - Number(a.runningDays ?? 0))[0] ?? null;

  return {
    topCreators: top(creatorCounts),
    topOffers: top(offerCounts),
    topHooks: top(hookCounts),
    longestRunningAd: longest,
    reach: {
      status: "unavailable" as const,
      reason: "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
    },
  };
}

export async function searchGlobalAds(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  page: number;
  limit: number;
}): Promise<any> {
  const client = createGlobalServiceClient();
  const q = escapeLike(input.query);
  const country = input.country.trim().toUpperCase();

  const advertiserFilter = `advertiser_name.ilike.%${q}%`;
  const keywordFilter = [
    `advertiser_name.ilike.%${q}%`,
    `creator_name.ilike.%${q}%`,
    `headline.ilike.%${q}%`,
    `product_name.ilike.%${q}%`,
    `primary_text.ilike.%${q}%`,
    `description.ilike.%${q}%`,
    `offer.ilike.%${q}%`,
    `landing_page_url.ilike.%${q}%`,
  ].join(",");

  let query = client
    .from("ad_intelligence_creatives")
    .select("*", { count: "exact" })
    .eq("platform", input.platform)
    .order("is_currently_active", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false, nullsFirst: false });

  query = query.or(input.mode === "advertiser" ? advertiserFilter : keywordFilter);
  if (country) query = query.or(`metadata->>country.eq.${country},metadata->>country.is.null`);

  const { data: rows, count, error } = await query.range((input.page - 1) * input.limit, input.page * input.limit - 1);
  if (error) throw new Error(`Global search failed: ${error.message}`);

  const pageRows = rows ?? [];
  const total = Number(count ?? 0);

  // A bounded scan powers the intelligence panel without mounting thousands of records in the UI.
  let intelligenceRows: any[] = [];
  if (total > 0) {
    let intelligenceQuery = client
      .from("ad_intelligence_creatives")
      .select("id,external_ad_id,external_ad_key,advertiser_name,creator_name,creative_type,primary_text,headline,offer,first_seen_at,last_seen_at,is_currently_active")
      .eq("platform", input.platform);
    intelligenceQuery = intelligenceQuery.or(input.mode === "advertiser" ? advertiserFilter : keywordFilter);
    if (country) intelligenceQuery = intelligenceQuery.or(`metadata->>country.eq.${country},metadata->>country.is.null`);
    const intelligenceResult = await intelligenceQuery.limit(10000);
    if (!intelligenceResult.error) intelligenceRows = intelligenceResult.data ?? [];
  }

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
  const activeRows = intelligenceRows.filter((row) => row.is_currently_active !== false);
  const videoAds = intelligenceRows.filter((row) => row.creative_type === "video").length;
  const imageAds = intelligenceRows.filter((row) => row.creative_type === "image").length;
  const carouselAds = intelligenceRows.filter((row) => row.creative_type === "carousel").length;
  const creatorAds = intelligenceRows.filter((row) => Boolean(row.creator_name)).length;
  const running = intelligenceRows.map(runningDays).filter((v): v is number => typeof v === "number");
  const averageRunningDays = running.length ? running.reduce((a, b) => a + b, 0) / running.length : 0;
  const longestRunningDays = running.length ? Math.max(...running) : 0;

  const lastUpdatedAt = pageRows.reduce<string | null>((latest, row: any) => {
    const value = row.updated_at ?? row.last_seen_at ?? null;
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);

  const totalPages = total === 0 ? 0 : Math.ceil(total / input.limit);

  return {
    ads,
    total,
    totalPages,
    page: input.page,
    limit: input.limit,
    languages,
    markets,
    summary: {
      totalAds: total,
      activeAds: activeRows.length,
      inactiveAds: Math.max(0, intelligenceRows.length - activeRows.length),
      videoAds,
      imageAds,
      carouselAds,
      creatorAds,
      averageRunningDays: Math.round(averageRunningDays),
      longestRunningDays,
    },
    intelligence: buildDerivedIntelligence(intelligenceRows),
    lastUpdatedAt,
  };
}

export async function autocompleteBrands(input: { query: string; limit?: number }) {
  const client = createGlobalServiceClient();
  const prefix = normalizeCollectionQuery(input.query);
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  if (!prefix) return [];

  const [{ data: brands }, { data: creatives }] = await Promise.all([
    client.from("ad_intelligence_brands")
      .select("id,canonical_name,domain")
      .ilike("normalized_name", `${prefix}%`)
      .order("normalized_name")
      .limit(limit),
    client.from("ad_intelligence_creatives")
      .select("advertiser_name,creator_name")
      .or(`advertiser_name.ilike.%${prefix}%,creator_name.ilike.%${prefix}%`)
      .limit(100),
  ]);

  const suggestions: Array<{ id: string; name: string; type: "brand" | "creator" | "keyword"; alias?: string | null; domain?: string | null }> = [];
  const seen = new Set<string>();

  for (const brand of brands ?? []) {
    const key = `brand:${brand.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ id: brand.id, name: brand.canonical_name, type: "brand", alias: brand.canonical_name, domain: brand.domain ?? null });
  }

  for (const row of creatives ?? []) {
    for (const [type, value] of [["brand", row.advertiser_name], ["creator", row.creator_name]] as const) {
      const name = String(value ?? "").trim();
      if (!name || !name.toLowerCase().startsWith(prefix)) continue;
      const key = `${type}:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ id: key, name, type });
      if (suggestions.length >= limit) break;
    }
    if (suggestions.length >= limit) break;
  }

  suggestions.unshift({ id: `keyword:${prefix}`, name: input.query.trim(), type: "keyword" });
  return suggestions.slice(0, limit + 1);
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
