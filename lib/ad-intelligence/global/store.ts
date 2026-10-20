import "server-only";

import type { AdPlatform } from "../types";
import { createGlobalServiceClient } from "./supabase";
import type { CollectionJob, CollectionJobStatus } from "./types";

const COLLECTION_JOB_SELECT =
  [
    "id",
    "user_id",
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
    userId: row.user_id ?? null,
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

export async function getCollectionJob(jobId: string, userId?: string): Promise<CollectionJob | null> {
  let query = createGlobalServiceClient().from("ad_intelligence_collection_jobs").select(COLLECTION_JOB_SELECT).eq("id", jobId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to read collection job: ${error.message}`);
  return data ? mapJob(data) : null;
}

export async function getOrCreateCollectionJob(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  userId?: string | null;
}): Promise<CollectionJob> {
  const client = createGlobalServiceClient();
  const query = input.query.trim();
  const country = input.country.trim().toUpperCase();
  const collectionKey = buildCollectionKey({ ...input, query, country });
  const now = new Date().toISOString();

  const { error: insertError } = await client.from("ad_intelligence_collection_jobs").insert({
    collection_key: collectionKey,
    user_id: input.userId ?? null,
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

  let lookup = client.from("ad_intelligence_collection_jobs").select(COLLECTION_JOB_SELECT).eq("collection_key", collectionKey);
  lookup = input.userId ? lookup.eq("user_id", input.userId) : lookup.is("user_id", null);
  const { data, error } = await lookup.single();
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
  lastRequestedAt: string;
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
  if (patch.lastRequestedAt !== undefined) payload.last_requested_at = patch.lastRequestedAt;

  // UPDATE ... RETURNING: one round trip instead of an update plus a re-read.
  const { data, error } = await createGlobalServiceClient()
    .from("ad_intelligence_collection_jobs")
    .update(payload)
    .eq("id", jobId)
    .select(COLLECTION_JOB_SELECT)
    .maybeSingle();
  if (error) throw new Error(`Failed to update collection job: ${error.message}`);
  if (!data) throw new Error("Collection job disappeared after update.");
  return mapJob(data);
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
    userId: string;
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
          "user_id",
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

      userId: String(row.user_id),

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

  // Match the unique key (user_id, normalized_query, country, platform):
  // "Mamaearth " / "mamaearth" are the same tracked brand.
  const normalizedQuery =
    normalizeCollectionQuery(input.query);

  const country =
    input.country.trim().toUpperCase();

  if (!normalizedQuery) {
    return;
  }

  const { error } =
    await client
      .from("ad_intelligence_tracked_brands")
      .update({
        last_collected_at:
          new Date().toISOString(),
      })
      .eq("normalized_query", normalizedQuery)
      .eq("country", country)
      .eq("platform", input.platform)
      .eq("active", true);

  if (error) {
    throw new Error(
      `Failed to mark tracked brand collected: ${error.message}`,
    );
  }
}
