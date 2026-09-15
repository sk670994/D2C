import "server-only";

import type { AdPlatform } from "../types";
import type { CollectionJob, CollectionJobStatus } from "./types";
import { getCollectionJob } from "./store";
import { createGlobalServiceClient } from "./supabase";

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildAdvertiserCollectionKey(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  pageId?: string | null;
}): string {
  const base = [
    input.platform,
    input.mode,
    input.country.trim().toUpperCase(),
    normalizeQuery(input.query),
  ].join("|");
  const pageId = input.pageId?.trim();
  return pageId && /^\d+$/.test(pageId) ? `${base}|page:${pageId}` : base;
}

type CollectionJobRow = {
  id: string;
  user_id: string | null;
  collection_key: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  status: CollectionJobStatus;
  stage: CollectionJobStatus;
  discovered_ads: number | null;
  normalized_ads: number | null;
  persisted_ads: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_requested_at: string | null;
  updated_at: string;
  created_at: string;
};

function mapJob(row: CollectionJobRow): CollectionJob {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    collectionKey: row.collection_key,
    query: row.query,
    country: row.country,
    platform: row.platform,
    mode: row.mode,
    status: row.status,
    stage: row.stage,
    discoveredAds: Number(row.discovered_ads ?? 0),
    normalizedAds: Number(row.normalized_ads ?? 0),
    persistedAds: Number(row.persisted_ads ?? 0),
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    lastRequestedAt: row.last_requested_at ?? row.created_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

const SELECT = [
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

export async function getOrCreateAdvertiserCollectionJob(input: {
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  userId: string;
  advertiserPageId?: string | null;
}): Promise<CollectionJob> {
  const client = createGlobalServiceClient();
  const query = input.query.trim().replace(/\s+/g, " ");
  const country = input.country.trim().toUpperCase();
  const pageId = input.advertiserPageId?.trim();
  const collectionKey = buildAdvertiserCollectionKey({
    query,
    country,
    platform: input.platform,
    mode: input.mode,
    pageId,
  });
  const now = new Date().toISOString();

  const { error: insertError } = await client
    .from("ad_intelligence_collection_jobs")
    .insert({
      collection_key: collectionKey,
      user_id: input.userId,
      query,
      country,
      platform: input.platform,
      mode: input.mode,
      status: "queued",
      stage: "queued",
      last_requested_at: now,
      updated_at: now,
    });

  if (insertError && insertError.code !== "23505") {
    throw new Error(`Failed to create collection job: ${insertError.message}`);
  }

  const { data, error } = await client
    .from("ad_intelligence_collection_jobs")
    .select(SELECT)
    .eq("collection_key", collectionKey)
    .eq("user_id", input.userId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load collection job: ${error?.message ?? "missing row"}`);
  }

  return mapJob(data as unknown as CollectionJobRow);
}

export async function touchQueuedJob(jobId: string, userId: string): Promise<CollectionJob | null> {
  return getCollectionJob(jobId, userId);
}



