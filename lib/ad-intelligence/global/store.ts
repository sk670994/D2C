import "server-only";

import type { AdPlatform, CompetitorAd } from "../types";
import { createGlobalServiceClient } from "./supabase";
import type { CollectionJob, CollectionJobStatus, GlobalAdRecord, GlobalLanguage, GlobalMarket, GlobalSearchResult, GlobalSearchSummary } from "./types";

const COLLECTION_JOB_SELECT =
  [
    "id",
    "collection_key",
    "query",
    "country",
    "platform",
    "mode",
    "status",
    "stage",
    "discovered_ads",
    "normalized_ads",
    "persisted_ads",
    "error_message",
    "started_at",
    "completed_at",
    "last_requested_at",
    "updated_at",
    "created_at",
  ].join(",");

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
  const { data, error } = await createGlobalServiceClient().from("ad_intelligence_collection_jobs").select(COLLECTION_JOB_SELECT).eq("id", jobId).maybeSingle();
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

  const { data, error } = await client.from("ad_intelligence_collection_jobs").select(COLLECTION_JOB_SELECT).eq("collection_key", collectionKey).single();
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
    .select(COLLECTION_JOB_SELECT)
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
  const text = String(
    row.primary_text ??
      row.headline ??
      "",
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  const first =
    text
      .split(
        /[.!?。！？]/,
      )[0]
      ?.trim() ?? text;

  return first.slice(0, 90);
}

function buildDerivedIntelligence(
  rows: any[],
) {
  const creatorCounts =
    new Map<string, number>();

  const offerCounts =
    new Map<string, number>();

  const hookCounts =
    new Map<string, number>();

  for (const row of rows) {
    const creator =
      String(
        row.creator_name ?? "",
      ).trim();

    if (creator) {
      creatorCounts.set(
        creator,
        (creatorCounts.get(
          creator,
        ) ?? 0) + 1,
      );
    }

    const offer =
      String(
        row.offer ?? "",
      ).trim();

    if (offer) {
      offerCounts.set(
        offer,
        (offerCounts.get(
          offer,
        ) ?? 0) + 1,
      );
    }

    const hook =
      buildHookLabel(row);

    if (hook) {
      hookCounts.set(
        hook,
        (hookCounts.get(
          hook,
        ) ?? 0) + 1,
      );
    }
  }

  const top = (
    counts: Map<string, number>,
    limit = 5,
  ) =>
    Array.from(
      counts.entries(),
    )
      .sort(
        (a, b) =>
          b[1] - a[1],
      )
      .slice(0, limit)
      .map(
        ([label, count]) => ({
          label,
          count,
        }),
      );

  const longest =
    [...rows]
      .map((row) => ({
        id:
          row.external_ad_id ??
          row.external_ad_key ??
          row.id,

        advertiserName:
          row.advertiser_name ??
          null,

        headline:
          row.headline ??
          null,

        primaryText:
          row.primary_text ??
          null,

        runningDays:
          runningDays(row),

        creativeType:
          row.creative_type ??
          "unknown",

        creatorName:
          row.creator_name ??
          null,
      }))
      .filter(
        (row) =>
          Number.isFinite(
            row.runningDays,
          ),
      )
      .sort(
        (a, b) =>
          Number(
            b.runningDays ?? 0,
          ) -
          Number(
            a.runningDays ?? 0,
          ),
      )[0] ?? null;

  return {
    topCreators:
      top(creatorCounts),

    topOffers:
      top(offerCounts),

    topHooks:
      top(hookCounts),

    longestRunningAd:
      longest,

    reach: {
      status:
        "unavailable" as const,

      reason:
        "The current public source does not expose a reliable per-ad reach figure to Zooptrack.",
    },
  };
}

export async function searchGlobalAds(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode:
      | "advertiser"
      | "keyword";
    page: number;
    limit: number;
  },
): Promise<
  GlobalSearchResult & {
    intelligence: ReturnType<typeof buildDerivedIntelligence>;
  }
> {
  const client =
    createGlobalServiceClient();

  const q =
    input.query.trim();

  const country =
    input.country
      .trim()
      .toUpperCase();

  if (!q) {
    return {
      ads: [],
      total: 0,
      page: input.page,
      limit: input.limit,
      totalPages: 0,
      lastUpdatedAt: null,
      isRefreshing: false,
      collectionJobId: null,

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
      },

      intelligence:
        buildDerivedIntelligence([]),

      languages: [],
      markets: [],
    };
  }

  const from =
    Math.max(
      0,
      input.page - 1,
    ) * input.limit;

  const to =
    from +
    input.limit -
    1;

  /*
   * Start with the global creatives dataset.
   */
  let baseQuery =
    client
      .from(
        "ad_intelligence_creatives",
      )
      .select("*", {
        count: "exact",
      })
      .eq(
        "platform",
        input.platform,
      );

  /*
   * ADVERTISER MODE
   *
   * Match the advertiser anywhere inside the stored
   * advertiser name.
   *
   * Example:
   *   beardo
   *
   * matches:
   *   BEARDO
   *   BEARDO for Men
   *   Beardo Official
   */
  if (
    input.mode ===
    "advertiser"
  ) {
    const advertiser =
      escapeLike(q);

    baseQuery =
      baseQuery.ilike(
        "advertiser_name",
        `%${advertiser}%`,
      );
  }

  /*
   * KEYWORD MODE
   *
   * Search across advertiser identity and creative
   * text/metadata fields.
   */
  else {
    const keyword =
      escapeLike(q);

    baseQuery =
      baseQuery.or(
        [
          `advertiser_name.ilike.%${keyword}%`,
          `creator_name.ilike.%${keyword}%`,
          `headline.ilike.%${keyword}%`,
          `product_name.ilike.%${keyword}%`,
          `primary_text.ilike.%${keyword}%`,
          `description.ilike.%${keyword}%`,
          `offer.ilike.%${keyword}%`,
          `landing_page_url.ilike.%${keyword}%`,
        ].join(","),
      );
  }

  /*
   * IMPORTANT:
   *
   * Do not filter the creative itself by metadata.country.
   *
   * Many public Meta records do not expose reliable
   * geographic data at creative level.
   *
   * Country is enriched below from market observations.
   */
  const {
    data: pageRows,
    count,
    error,
  } =
    await baseQuery
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
      )
      .range(
        from,
        to,
      );

  if (error) {
    throw new Error(
      `Global search failed: ${error.message}`,
    );
  }

  const rows =
    pageRows ?? [];

  /*
   * Enrich only the creatives on the current page.
   */
  const ids =
    rows.map(
      (row: any) =>
        row.id,
    );

  let markets: any[] = [];
  let languages: any[] = [];

  if (ids.length) {
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
            ids,
          ),

        client
          .from(
            "ad_intelligence_languages",
          )
          .select("*")
          .in(
            "creative_id",
            ids,
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

  /*
   * Convert database rows into the shape expected by
   * the AdSpy frontend.
   */
  const ads =
    rows.map(
      (row: any) =>
        mapCreativeRow(
          row,
          languages,
          markets,
        ),
    );

  /*
   * Page-level source metrics.
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
      .map(runningDays)
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
    Number(count ?? 0);

  const totalPages =
    total > 0
      ? Math.ceil(
          total /
            input.limit,
        )
      : 0;

  return {
    ads,

    total,

    page:
      input.page,

    limit:
      input.limit,

    totalPages,

    lastUpdatedAt:
      rows.reduce<string | null>(
        (latest, row: any) => {
          const value =
            row.updated_at ??
            row.last_seen_at ??
            row.first_seen_at ??
            null;

          if (!value) {
            return latest;
          }

          if (!latest) {
            return String(value);
          }

          return new Date(value).getTime() >
            new Date(latest).getTime()
            ? String(value)
            : latest;
        },
        null,
      ),

    isRefreshing: false,
    collectionJobId: null,

    summary: {
      totalAds:
        total,

      activeAds:
        activeRows.length,

      inactiveAds:
        Math.max(
          0,
          rows.length -
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
    },

    intelligence:
      buildDerivedIntelligence(
        rows,
      ),

    languages,

    markets,
  };
}
export async function autocompleteBrands(input: {
  query: string;
  limit?: number;
  mode?: "advertiser" | "keyword";
}) {
  const client = createGlobalServiceClient();

  const query = input.query.trim();

  if (query.length < 2) {
    return [];
  }

  const limit = Math.min(
    Math.max(input.limit ?? 8, 1),
    20,
  );

  const mode =
    input.mode === "keyword"
      ? "keyword"
      : "advertiser";

  const escaped =
    query.replace(/[%_,]/g, " ").trim();

  if (!escaped) {
    return [];
  }

  /*
   * Advertiser mode:
   * Return advertiser/brand identities first.
   *
   * Keyword mode:
   * Return advertiser identities plus creative
   * text signals.
   */

  if (mode === "advertiser") {
    const { data, error } =
      await client
        .from("ad_intelligence_creatives")
        .select(
          "advertiser_id,advertiser_name",
        )
        .ilike(
          "advertiser_name",
          `%${escaped}%`,
        )
        .not(
          "advertiser_name",
          "is",
          null,
        )
        .limit(200);

    if (error) {
      throw new Error(
        `Autocomplete advertiser lookup failed: ${error.message}`,
      );
    }

    const seen = new Set<string>();

    return (data ?? [])
      .map((row: any) => ({
        type: "advertiser" as const,
        id:
          row.advertiser_id ??
          row.advertiser_name,
        label:
          String(
            row.advertiser_name ?? "",
          ).trim(),
      }))
      .filter((item) => {
        if (!item.label) return false;

        const key =
          item.label.toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  const { data, error } =
    await client
      .from("ad_intelligence_creatives")
      .select(
        "advertiser_id,advertiser_name,creator_name,headline,product_name",
      )
      .or(
        [
          `advertiser_name.ilike.%${escaped}%`,
          `creator_name.ilike.%${escaped}%`,
          `headline.ilike.%${escaped}%`,
          `product_name.ilike.%${escaped}%`,
        ].join(","),
      )
      .limit(250);

  if (error) {
    throw new Error(
      `Autocomplete keyword lookup failed: ${error.message}`,
    );
  }

  const suggestions: Array<{
    type:
      | "advertiser"
      | "creator"
      | "keyword";
    id: string;
    label: string;
  }> = [];

  const seen = new Set<string>();

  for (const row of data ?? []) {
    const advertiser =
      String(
        row.advertiser_name ?? "",
      ).trim();

    const creator =
      String(
        row.creator_name ?? "",
      ).trim();

    const headline =
      String(
        row.headline ?? "",
      ).trim();

    const product =
      String(
        row.product_name ?? "",
      ).trim();

    const candidates = [
      advertiser
        ? {
            type: "advertiser" as const,
            id:
              row.advertiser_id ??
              advertiser,
            label: advertiser,
          }
        : null,

      creator
        ? {
            type: "creator" as const,
            id: creator,
            label: creator,
          }
        : null,

      headline
        ? {
            type: "keyword" as const,
            id: headline,
            label: headline,
          }
        : null,

      product
        ? {
            type: "keyword" as const,
            id: product,
            label: product,
          }
        : null,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const key =
        `${candidate.type}:${candidate.label.toLowerCase()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      suggestions.push(candidate);

      if (
        suggestions.length >=
        limit
      ) {
        break;
      }
    }

    if (
      suggestions.length >=
      limit
    ) {
      break;
    }
  }

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

export async function listTrackedBrands(): Promise<
  Array<{
    id: string;
    country: string;
    platform: AdPlatform;
    query: string;
    refreshHours: number;
    lastCollectedAt: string | null;
  }>
> {
  const client =
    createGlobalServiceClient();

  const { data, error } =
    await client
      .from(
        "ad_intelligence_tracked_brands",
      )
      .select(
        [
          "id",
          "country",
          "platform",
          "query",
          "refresh_hours",
          "last_collected_at",
        ].join(","),
      )
      .eq("active", true)
      .order("last_collected_at", {
        ascending: true,
        nullsFirst: true,
      });

  if (error) {
    throw new Error(
      `Failed to list tracked brands: ${error.message}`,
    );
  }

  return (data ?? []).map(
    (row: any) => ({
      id: String(row.id),

      country:
        String(
          row.country ?? "IN",
        ).toUpperCase(),

      platform:
        row.platform as AdPlatform,

      query:
        String(row.query ?? "").trim(),

      refreshHours: Math.max(
        1,
        Number(
          row.refresh_hours ?? 24,
        ),
      ),

      lastCollectedAt:
        row.last_collected_at
          ? String(
              row.last_collected_at,
            )
          : null,
    }),
  );
}
export async function markTrackedBrandCollected(input: {
  query: string;
  country: string;
  platform: AdPlatform;
}): Promise<void> {
  const client =
    createGlobalServiceClient();

  const query =
    input.query.trim();

  const country =
    input.country.trim().toUpperCase();

  if (!query) {
    return;
  }

  const { error } =
    await client
      .from("ad_intelligence_tracked_brands")
      .update({
        last_collected_at:
          new Date().toISOString(),
      })
      .eq("query", query)
      .eq("country", country)
      .eq("platform", input.platform)
      .eq("active", true);

  if (error) {
    throw new Error(
      `Failed to mark tracked brand collected: ${error.message}`,
    );
  }
}