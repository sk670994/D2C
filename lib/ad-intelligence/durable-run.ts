import "server-only";

import { randomUUID } from "node:crypto";

import type { AdPlatform } from "./types";
import type { AdSearchMode } from "./provider";
import { createGlobalServiceClient } from "./global/supabase";

export type DurableRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "exhausted"
  | "failed"
  | "cancelled";

export type DurableRequestStatus =
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export type DurableRequestType = "initial" | "deep";

export type DurableRun = {
  id: string;
  userId: string;
  collectionJobId: string;
  collectionKey: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;
  advertiserPageId: string | null;
  status: DurableRunStatus;
  stage: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  queuedRequests: number;
  runningRequests: number;
  completedRequests: number;
  failedRequests: number;
  attempt: number;
  heartbeatAt: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type DurableRequest = {
  id: string;
  runId: string;
  uniqueKey: string;
  requestType: DurableRequestType;
  payload: Record<string, unknown>;
  status: DurableRequestStatus;
  attempt: number;
  maxAttempts: number;
  priority: number;
  availableAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function mapRun(row: any): DurableRun {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    collectionJobId: String(row.collection_job_id),
    collectionKey: String(row.collection_key),
    query: String(row.query),
    country: String(row.country),
    platform: row.platform,
    mode: row.mode,
    advertiserPageId: row.advertiser_page_id ?? null,
    status: row.status,
    stage: row.stage,
    discoveredAds: Number(row.discovered_ads ?? 0),
    normalizedAds: Number(row.normalized_ads ?? 0),
    persistedAds: Number(row.persisted_ads ?? 0),
    queuedRequests: Number(row.queued_requests ?? 0),
    runningRequests: Number(row.running_requests ?? 0),
    completedRequests: Number(row.completed_requests ?? 0),
    failedRequests: Number(row.failed_requests ?? 0),
    attempt: Number(row.attempt ?? 0),
    heartbeatAt: row.heartbeat_at ?? null,
    errorMessage: row.error_message ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
  };
}

function mapRequest(row: any): DurableRequest {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    uniqueKey: String(row.unique_key),
    requestType: row.request_type,
    payload: row.payload ?? {},
    status: row.status,
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    priority: Number(row.priority ?? 100),
    availableAt: row.available_at,
    lockedAt: row.locked_at ?? null,
    lockedBy: row.locked_by ?? null,
    lastError: row.last_error ?? null,
    result: row.result ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

export async function getDurableRunByCollectionJob(
  collectionJobId: string,
  userId?: string,
): Promise<DurableRun | null> {
  let query = createGlobalServiceClient()
    .from("adspy_runs")
    .select("*")
    .eq("collection_job_id", collectionJobId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load durable AdSpy run: ${error.message}`);
  }

  return data ? mapRun(data) : null;
}

export async function getOrCreateDurableRun(input: {
  userId: string;
  collectionJobId: string;
  collectionKey: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;
  advertiserPageId?: string | null;
}): Promise<DurableRun> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_get_or_create_run",
    {
      p_user_id: input.userId,
      p_collection_job_id: input.collectionJobId,
      p_collection_key: input.collectionKey,
      p_query: input.query,
      p_country: input.country,
      p_platform: input.platform,
      p_mode: input.mode,
      p_advertiser_page_id: input.advertiserPageId ?? null,
    },
  );

  if (error) {
    throw new Error(
      `Failed to create/resume durable AdSpy run: ${error.message}`,
    );
  }

  if (!data) throw new Error("Durable AdSpy run was not returned.");

  return mapRun(data);
}

export async function enqueueAdSpyRequest(input: {
  runId: string;
  uniqueKey: string;
  requestType: DurableRequestType;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
}): Promise<DurableRequest> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_enqueue_request",
    {
      p_run_id: input.runId,
      p_unique_key: input.uniqueKey,
      p_request_type: input.requestType,
      p_payload: input.payload,
      p_priority: input.priority ?? 100,
      p_max_attempts: input.maxAttempts ?? 5,
    },
  );

  if (error) {
    throw new Error(`Failed to enqueue durable AdSpy request: ${error.message}`);
  }

  if (!data) throw new Error("Durable AdSpy request was not returned.");

  return mapRequest(data);
}

export async function claimAdSpyRequest(input: {
  requestId: string;
  workerId?: string;
  leaseSeconds?: number;
}): Promise<DurableRequest | null> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_claim_request",
    {
      p_request_id: input.requestId,
      p_worker_id: input.workerId ?? `adspy:${randomUUID()}`,
      p_lease_seconds: input.leaseSeconds ?? 75,
    },
  );

  if (error) {
    throw new Error(`Failed to claim durable AdSpy request: ${error.message}`);
  }

  return data ? mapRequest(data) : null;
}

export async function heartbeatAdSpyRun(
  runId: string,
  requestId?: string,
): Promise<void> {
  const { error } = await createGlobalServiceClient().rpc(
    "adspy_heartbeat",
    {
      p_run_id: runId,
      p_request_id: requestId ?? null,
    },
  );

  if (error) {
    throw new Error(`Failed to heartbeat durable AdSpy run: ${error.message}`);
  }
}

export async function updateAdSpyRunCounts(input: {
  runId: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  stage: string;
  status?: DurableRunStatus;
}): Promise<void> {
  const now = new Date().toISOString();

  const client = createGlobalServiceClient();

  // Counters are always safe to record.
  const { error } = await client
    .from("adspy_runs")
    .update({
      discovered_ads: input.discoveredAds,
      normalized_ads: input.normalizedAds,
      persisted_ads: input.persistedAds,
      heartbeat_at: now,
      updated_at: now,
    })
    .eq("id", input.runId);

  if (error) {
    throw new Error(`Failed to update durable AdSpy run: ${error.message}`);
  }

  // Status/stage may only change while the run is still active. Writing
  // "running" onto a finished run re-opened it and violated
  // adspy_runs_one_active_collection_idx.
  const { error: statusError } = await client
    .from("adspy_runs")
    .update({
      stage: input.stage,
      ...(input.status ? { status: input.status } : {}),
    })
    .eq("id", input.runId)
    .in("status", ["queued", "running", "retrying"]);

  if (statusError) {
    throw new Error(`Failed to update durable AdSpy run status: ${statusError.message}`);
  }
}

export async function completeAdSpyRequest(input: {
  requestId: string;
  result?: Record<string, unknown>;
}): Promise<DurableRequest> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_complete_request",
    {
      p_request_id: input.requestId,
      p_result: input.result ?? {},
    },
  );

  if (error) {
    throw new Error(`Failed to complete durable AdSpy request: ${error.message}`);
  }

  if (!data) throw new Error("Completed request was not returned.");

  return mapRequest(data);
}

export async function failAdSpyRequest(input: {
  requestId: string;
  errorMessage: string;
  retryable?: boolean;
}): Promise<DurableRequest> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_fail_request",
    {
      p_request_id: input.requestId,
      p_error_message: input.errorMessage.slice(0, 4000),
      p_retryable: input.retryable ?? true,
    },
  );

  if (error) {
    throw new Error(
      `Failed to transition durable AdSpy request: ${error.message}`,
    );
  }

  if (!data) throw new Error("Failed request was not returned.");

  return mapRequest(data);
}

export async function finishAdSpyRun(input: {
  runId: string;
  status: "exhausted" | "failed" | "cancelled";
  errorMessage?: string | null;
}): Promise<DurableRun> {
  const { data, error } = await createGlobalServiceClient().rpc(
    "adspy_finish_run",
    {
      p_run_id: input.runId,
      p_status: input.status,
      p_error_message: input.errorMessage ?? null,
    },
  );

  if (error) {
    throw new Error(`Failed to finish durable AdSpy run: ${error.message}`);
  }

  if (!data) throw new Error("Finished durable AdSpy run was not returned.");

  return mapRun(data);
}

export async function reapExpiredAdSpyRequests(): Promise<number> {
  const { data, error } =
    await createGlobalServiceClient().rpc(
      "adspy_reap_expired_requests",
    );

  if (error) {
    throw new Error(
      `Failed to reap expired AdSpy requests: ${error.message}`,
    );
  }

  return Number(data ?? 0);
}
