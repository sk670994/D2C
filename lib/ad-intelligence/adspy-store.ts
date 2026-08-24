import "server-only";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  createClient as createServiceClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/* =========================================================
 * TYPES
 * ======================================================= */

export type AdSpyPlatform =
  | "meta"
  | "google"
  | "linkedin";

export type AdSpySearchMode =
  | "advertiser"
  | "keyword";

export type SaveAdSpySnapshotInput = {
  userId: string;
  query: string;
  country: string;
  platform: AdSpyPlatform;
  ads: unknown[];
  intelligence: unknown;
};

export type AdSpySnapshot = {
  id: string;
  userId: string;
  query: string;
  country: string;
  platform: string;
  ads: unknown[];
  intelligence: unknown;
  createdAt: string;
};

type AdSpySnapshotRow = {
  id: string;
  user_id: string;
  query: string;
  country: string;
  platform: string;
  ads: unknown;
  intelligence: unknown;
  created_at: string;
};

/* =========================================================
 * SHARED CACHE TYPES
 * ======================================================= */

export type SharedAdSpyCacheStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed";

export type SharedAdSpyCache = {
  id: string;

  cacheKey: string;

  query: string;

  country: string;

  platform: AdSpyPlatform;

  mode: AdSpySearchMode;

  status: SharedAdSpyCacheStatus;

  ads: unknown[];

  intelligence: unknown;

  errorMessage: string | null;

  leaseUntil: string | null;

  createdAt: string;

  updatedAt: string;
};

type SharedAdSpyCacheRow = {
  id: string;

  cache_key: string;

  query: string;

  country: string;

  platform: string;

  mode: string;

  status: string;

  ads: unknown;

  intelligence: unknown;

  error_message: string | null;

  lease_until: string | null;

  created_at: string;

  updated_at: string;
};

/* =========================================================
 * SHARED CACHE INPUT
 * ======================================================= */

export type SharedAdSpyCacheLookupInput = {
  query: string;
  country: string;
  platform: AdSpyPlatform;
  mode?: AdSpySearchMode;
};

export type ClaimSharedAdSpyJobResult = {
  claimed: boolean;

  cache: SharedAdSpyCache;

  leaseUntil: string | null;
};

/* =========================================================
 * CONSTANTS
 * ======================================================= */

const DEFAULT_SHARED_CACHE_MAX_AGE_MINUTES = 5;

/*
 * A running scrape owns its cache key for 2 minutes.
 *
 * We can later increase this when the async worker is introduced
 * for larger 600+ ad collection jobs.
 */
const DEFAULT_SHARED_CACHE_LEASE_MS =
  2 * 60 * 1000;

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

export function normalizeAdSpyQuery(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeAdSpyCountry(
  value: string,
): string {
  return (
    value
      .trim()
      .toUpperCase() || "IN"
  );
}

export function normalizeAdSpyMode(
  value?: string,
): AdSpySearchMode {
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

/* =========================================================
 * SHARED CACHE KEY
 * ======================================================= */

/**
 * One canonical key for one globally reusable search.
 *
 * Example:
 *
 * meta|advertiser|IN|beardo
 *
 * This key is intentionally NOT tied to userId.
 */
export function buildAdSpyCacheKey(
  input: SharedAdSpyCacheLookupInput,
): string {
  const query =
    normalizeAdSpyQuery(
      input.query,
    );

  const country =
    normalizeAdSpyCountry(
      input.country,
    );

  const mode =
    normalizeAdSpyMode(
      input.mode,
    );

  return [
    input.platform,
    mode,
    country,
    query,
  ]
    .map((value) =>
      encodeURIComponent(value),
    )
    .join("|");
}

/* =========================================================
 * USER SNAPSHOT MAPPING
 * ======================================================= */

function mapSnapshotRow(
  row: AdSpySnapshotRow,
): AdSpySnapshot {
  return {
    id: row.id,

    userId:
      row.user_id,

    query:
      row.query,

    country:
      row.country,

    platform:
      row.platform,

    ads:
      Array.isArray(row.ads)
        ? row.ads
        : [],

    intelligence:
      row.intelligence ?? {},

    createdAt:
      row.created_at,
  };
}

/* =========================================================
 * SHARED CACHE MAPPING
 * ======================================================= */

function mapSharedCacheRow(
  row: SharedAdSpyCacheRow,
): SharedAdSpyCache {
  const platform =
    row.platform === "google" ||
    row.platform === "linkedin"
      ? row.platform
      : "meta";

  const mode =
    row.mode === "keyword"
      ? "keyword"
      : "advertiser";

  const status =
    row.status === "queued" ||
    row.status === "running" ||
    row.status === "failed"
      ? row.status
      : "ready";

  return {
    id:
      row.id,

    cacheKey:
      row.cache_key,

    query:
      row.query,

    country:
      row.country,

    platform,

    mode,

    status,

    ads:
      Array.isArray(row.ads)
        ? row.ads
        : [],

    intelligence:
      row.intelligence ?? {},

    errorMessage:
      row.error_message ?? null,

    leaseUntil:
      row.lease_until ?? null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/* =========================================================
 * SUPABASE SERVICE CLIENT
 *
 * IMPORTANT:
 * This is SERVER-ONLY.
 *
 * It is used only for the global shared cache.
 *
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 * ======================================================= */

function createSharedCacheClient(): SupabaseClient {
  const url =
    (
      process.env
        .NEXT_PUBLIC_SUPABASE_URL ??
      ""
    ).trim();

  const serviceRoleKey =
    (
      process.env
        .SUPABASE_SERVICE_ROLE_KEY ??
      ""
    ).trim();

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL for shared AdSpy cache.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY for shared AdSpy cache.",
    );
  }

  return createServiceClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/* =========================================================
 * DATE HELPERS
 * ======================================================= */

function isFreshTimestamp(
  timestamp: string,
  maxAgeMinutes: number,
): boolean {
  const createdAt =
    new Date(
      timestamp,
    ).getTime();

  if (
    !Number.isFinite(
      createdAt,
    )
  ) {
    return false;
  }

  const ageMs =
    Date.now() -
    createdAt;

  if (ageMs < 0) {
    return false;
  }

  return (
    ageMs <=
    maxAgeMinutes *
      60 *
      1000
  );
}

function calculateLeaseUntil(
  leaseMs: number,
): string {
  return new Date(
    Date.now() +
      leaseMs,
  ).toISOString();
}

/* =========================================================
 * SAVE USER SNAPSHOT
 * ======================================================= */

/**
 * Persist one user-specific historical AdSpy result.
 *
 * IMPORTANT:
 * This remains user-specific.
 *
 * It is NOT the shared cache.
 */
export async function saveAdSpySnapshot(
  input: SaveAdSpySnapshotInput,
): Promise<AdSpySnapshot> {
  const supabase =
    await createServerAuthClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "adspy_snapshots",
      )
      .insert({
        user_id:
          input.userId,

        query:
          input.query
            .trim(),

        country:
          input.country
            .trim()
            .toUpperCase(),

        platform:
          input.platform,

        ads:
          input.ads,

        intelligence:
          input.intelligence,
      })
      .select(
        "id,user_id,query,country,platform,ads,intelligence,created_at",
      )
      .single();

  if (error) {
    throw new Error(
      `Failed to save AdSpy snapshot: ${error.message}`,
    );
  }

  return mapSnapshotRow(
    data as AdSpySnapshotRow,
  );
}

/* =========================================================
 * GET LATEST USER SNAPSHOT
 * ======================================================= */

export async function getLatestAdSpySnapshot(
  input: {
    userId: string;

    query?: string;

    country?: string;

    platform?: AdSpyPlatform;
  },
): Promise<AdSpySnapshot | null> {
  const supabase =
    await createServerAuthClient();

  let request =
    supabase
      .from(
        "adspy_snapshots",
      )
      .select(
        "id,user_id,query,country,platform,ads,intelligence,created_at",
      )
      .eq(
        "user_id",
        input.userId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(1);

  if (
    input.query?.trim()
  ) {
    request =
      request.eq(
        "query",
        input.query.trim(),
      );
  }

  if (
    input.country?.trim()
  ) {
    request =
      request.eq(
        "country",
        input.country
          .trim()
          .toUpperCase(),
      );
  }

  if (input.platform) {
    request =
      request.eq(
        "platform",
        input.platform,
      );
  }

  const {
    data,
    error,
  } =
    await request.maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get latest AdSpy snapshot: ${error.message}`,
    );
  }

  if (!data) {
    console.info(
      "[AdSpyStore] No user snapshot found:",
      {
        userId:
          input.userId,

        query:
          input.query,

        country:
          input.country,

        platform:
          input.platform,
      },
    );

    return null;
  }

  console.info(
    "[AdSpyStore] User snapshot found:",
    {
      id:
        data.id,

      userId:
        data.user_id,

      query:
        data.query,

      country:
        data.country,

      platform:
        data.platform,

      createdAt:
        data.created_at,

      adCount:
        Array.isArray(
          data.ads,
        )
          ? data.ads.length
          : 0,
    },
  );

  return mapSnapshotRow(
    data as AdSpySnapshotRow,
  );
}

/* =========================================================
 * USER FRESH SNAPSHOT
 * ======================================================= */

export async function getFreshAdSpySnapshot(
  input: {
    userId: string;

    query: string;

    country: string;

    platform: AdSpyPlatform;

    maxAgeMinutes?: number;
  },
): Promise<AdSpySnapshot | null> {
  const snapshot =
    await getLatestAdSpySnapshot({
      userId:
        input.userId,

      query:
        input.query,

      country:
        input.country,

      platform:
        input.platform,
    });

  if (!snapshot) {
    return null;
  }

  const maxAgeMinutes =
    Number.isFinite(
      input.maxAgeMinutes,
    ) &&
    (
      input.maxAgeMinutes ??
      0
    ) > 0
      ? input.maxAgeMinutes!
      : DEFAULT_SHARED_CACHE_MAX_AGE_MINUTES;

  if (
    !isFreshTimestamp(
      snapshot.createdAt,
      maxAgeMinutes,
    )
  ) {
    return null;
  }

  return snapshot;
}

/* =========================================================
 * ENSURE SHARED CACHE RECORD
 * ======================================================= */

/**
 * Makes sure one shared cache row exists.
 *
 * Multiple users can call this simultaneously.
 *
 * The cache_key UNIQUE constraint prevents duplicate rows.
 */
export async function ensureSharedAdSpyCache(
  input: SharedAdSpyCacheLookupInput,
): Promise<SharedAdSpyCache> {
  const client =
    createSharedCacheClient();

  const normalizedQuery =
    normalizeAdSpyQuery(
      input.query,
    );

  const normalizedCountry =
    normalizeAdSpyCountry(
      input.country,
    );

  const mode =
    normalizeAdSpyMode(
      input.mode,
    );

  const cacheKey =
    buildAdSpyCacheKey({
      query:
        normalizedQuery,

      country:
        normalizedCountry,

      platform:
        input.platform,

      mode,
    });

  const {
    error:
      insertError,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .insert({
        cache_key:
          cacheKey,

        query:
          normalizedQuery,

        country:
          normalizedCountry,

        platform:
          input.platform,

        mode,

        status:
          "queued",

        ads: [],

        intelligence: {},

        error_message:
          null,

        lease_until:
          null,
      });

  /*
   * A duplicate-key error is expected when two users
   * create the same search simultaneously.
   *
   * Do NOT treat that as a fatal error.
   */
  if (
    insertError &&
    insertError.code !==
      "23505"
  ) {
    throw new Error(
      `Failed to create shared AdSpy cache record: ${insertError.message}`,
    );
  }

  const {
    data,
    error,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .select(
        "id,cache_key,query,country,platform,mode,status,ads,intelligence,error_message,lease_until,created_at,updated_at",
      )
      .eq(
        "cache_key",
        cacheKey,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load shared AdSpy cache record: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Shared AdSpy cache record was not created or found.",
    );
  }

  return mapSharedCacheRow(
    data as SharedAdSpyCacheRow,
  );
}

/* =========================================================
 * GET SHARED CACHE
 * ======================================================= */

export async function getSharedAdSpyCache(
  input: SharedAdSpyCacheLookupInput,
): Promise<SharedAdSpyCache | null> {
  const client =
    createSharedCacheClient();

  const cacheKey =
    buildAdSpyCacheKey(
      input,
    );

  const {
    data,
    error,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .select(
        "id,cache_key,query,country,platform,mode,status,ads,intelligence,error_message,lease_until,created_at,updated_at",
      )
      .eq(
        "cache_key",
        cacheKey,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read shared AdSpy cache: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return mapSharedCacheRow(
    data as SharedAdSpyCacheRow,
  );
}

/* =========================================================
 * GET FRESH SHARED CACHE
 * ======================================================= */

/**
 * This is the fast path for ALL users.
 *
 * User A can populate this.
 * User B can consume it.
 * User C can consume it.
 *
 * No userId is involved.
 */
export async function getFreshSharedAdSpyCache(
  input: SharedAdSpyCacheLookupInput & {
    maxAgeMinutes?: number;
  },
): Promise<SharedAdSpyCache | null> {
  const cache =
    await getSharedAdSpyCache(
      input,
    );

  if (!cache) {
    return null;
  }

  if (
    cache.status !==
    "ready"
  ) {
    return null;
  }

  const maxAgeMinutes =
    Number.isFinite(
      input.maxAgeMinutes,
    ) &&
    (
      input.maxAgeMinutes ??
      0
    ) > 0
      ? input.maxAgeMinutes!
      : DEFAULT_SHARED_CACHE_MAX_AGE_MINUTES;

  if (
    !isFreshTimestamp(
      cache.updatedAt,
      maxAgeMinutes,
    )
  ) {
    return null;
  }

  if (
    cache.ads.length ===
    0
  ) {
    return null;
  }

  return cache;
}

/* =========================================================
 * CLAIM SHARED SEARCH JOB
 * ======================================================= */

/**
 * Try to become the ONE worker responsible for scraping
 * this cache key.
 *
 * Important:
 *
 * 100 users can call this simultaneously.
 *
 * Only one should receive claimed=true.
 */
export async function claimSharedAdSpyJob(
  input: SharedAdSpyCacheLookupInput & {
    leaseMs?: number;
  },
): Promise<ClaimSharedAdSpyJobResult> {
  const cache =
    await ensureSharedAdSpyCache(
      input,
    );

  const client =
    createSharedCacheClient();

  const leaseMs =
    Number.isFinite(
      input.leaseMs,
    ) &&
    (
      input.leaseMs ??
      0
    ) > 0
      ? input.leaseMs!
      : DEFAULT_SHARED_CACHE_LEASE_MS;

  /*
   * Already fresh — nothing to claim.
   */
  if (
    cache.status ===
      "ready" &&
    isFreshTimestamp(
      cache.updatedAt,
      DEFAULT_SHARED_CACHE_MAX_AGE_MINUTES,
    ) &&
    cache.ads.length > 0
  ) {
    return {
      claimed: false,

      cache,

      leaseUntil:
        null,
    };
  }

  const newLeaseUntil =
    calculateLeaseUntil(
      leaseMs,
    );

  const nowIso =
    new Date().toISOString();

  /*
   * FIRST CASE:
   *
   * Claim queued / failed work.
   *
   * This UPDATE is atomic at the database level.
   *
   * If 100 requests execute this:
   *
   * request #1 updates the row
   * requests #2–100 no longer match status=queued/failed
   */
  const {
    data:
      claimedQueued,
    error:
      queuedError,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .update({
        status:
          "running",

        lease_until:
          newLeaseUntil,

        error_message:
          null,

        updated_at:
          nowIso,
      })
      .eq(
        "cache_key",
        cache.cacheKey,
      )
      .in(
        "status",
        [
          "queued",
          "failed",
        ],
      )
      .select(
        "id,cache_key,query,country,platform,mode,status,ads,intelligence,error_message,lease_until,created_at,updated_at",
      )
      .maybeSingle();

  if (queuedError) {
    throw new Error(
      `Failed to claim shared AdSpy job: ${queuedError.message}`,
    );
  }

  if (claimedQueued) {
    const claimedCache =
      mapSharedCacheRow(
        claimedQueued as SharedAdSpyCacheRow,
      );

    console.info(
      "[AdSpyStore] Shared job claimed:",
      {
        cacheKey:
          claimedCache.cacheKey,

        query:
          claimedCache.query,

        country:
          claimedCache.country,

        platform:
          claimedCache.platform,

        leaseUntil:
          claimedCache.leaseUntil,
      },
    );

    return {
      claimed:
        true,

      cache:
        claimedCache,

      leaseUntil:
        claimedCache.leaseUntil,
    };
  }

  /*
   * SECOND CASE:
   *
   * A previous worker may have expired.
   *
   * Reclaim only when the lease has expired.
   */
  const {
    data:
      reclaimedRunning,
    error:
      reclaimError,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .update({
        status:
          "running",

        lease_until:
          newLeaseUntil,

        error_message:
          null,

        updated_at:
          nowIso,
      })
      .eq(
        "cache_key",
        cache.cacheKey,
      )
      .eq(
        "status",
        "running",
      )
      .lte(
        "lease_until",
        nowIso,
      )
      .select(
        "id,cache_key,query,country,platform,mode,status,ads,intelligence,error_message,lease_until,created_at,updated_at",
      )
      .maybeSingle();

  if (reclaimError) {
    throw new Error(
      `Failed to reclaim shared AdSpy job: ${reclaimError.message}`,
    );
  }

  if (reclaimedRunning) {
    const reclaimedCache =
      mapSharedCacheRow(
        reclaimedRunning as SharedAdSpyCacheRow,
      );

    console.warn(
      "[AdSpyStore] Reclaimed expired shared job:",
      reclaimedCache.cacheKey,
    );

    return {
      claimed:
        true,

      cache:
        reclaimedCache,

      leaseUntil:
        reclaimedCache.leaseUntil,
    };
  }

  /*
   * Someone else owns the job.
   */
  const latest =
    await getSharedAdSpyCache(
      input,
    );

  if (!latest) {
    throw new Error(
      "Shared AdSpy cache disappeared while claiming job.",
    );
  }

  return {
    claimed:
      false,

    cache:
      latest,

    leaseUntil:
      null,
  };
}

/* =========================================================
 * COMPLETE SHARED SEARCH JOB
 * ======================================================= */

export async function completeSharedAdSpyJob(
  input: {
    cacheKey: string;

    leaseUntil: string;

    ads: unknown[];

    intelligence: unknown;
  },
): Promise<SharedAdSpyCache> {
  const client =
    createSharedCacheClient();

  /*
   * The lease timestamp acts as a lightweight fencing token.
   *
   * A stale worker cannot overwrite the result after another
   * worker has reclaimed the job, because its old leaseUntil
   * no longer matches.
   */
  const {
    data,
    error,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .update({
        status:
          "ready",

        ads:
          input.ads,

        intelligence:
          input.intelligence,

        error_message:
          null,

        lease_until:
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "cache_key",
        input.cacheKey,
      )
      .eq(
        "status",
        "running",
      )
      .eq(
        "lease_until",
        input.leaseUntil,
      )
      .select(
        "id,cache_key,query,country,platform,mode,status,ads,intelligence,error_message,lease_until,created_at,updated_at",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to complete shared AdSpy job: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Shared AdSpy job lease was lost before completion.",
    );
  }

  console.info(
    "[AdSpyStore] Shared job completed:",
    {
      cacheKey:
        input.cacheKey,

      adCount:
        Array.isArray(
          input.ads,
        )
          ? input.ads.length
          : 0,
    },
  );

  return mapSharedCacheRow(
    data as SharedAdSpyCacheRow,
  );
}

/* =========================================================
 * FAIL SHARED SEARCH JOB
 * ======================================================= */

export async function failSharedAdSpyJob(
  input: {
    cacheKey: string;

    leaseUntil: string;

    errorMessage: string;
  },
): Promise<void> {
  const client =
    createSharedCacheClient();

  const {
    error,
  } =
    await client
      .from(
        "adspy_shared_cache",
      )
      .update({
        status:
          "failed",

        error_message:
          input.errorMessage,

        lease_until:
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "cache_key",
        input.cacheKey,
      )
      .eq(
        "status",
        "running",
      )
      .eq(
        "lease_until",
        input.leaseUntil,
      );

  if (error) {
    throw new Error(
      `Failed to mark shared AdSpy job as failed: ${error.message}`,
    );
  }

  console.error(
    "[AdSpyStore] Shared job failed:",
    {
      cacheKey:
        input.cacheKey,

      error:
        input.errorMessage,
    },
  );
}

/* =========================================================
 * USER SNAPSHOT HISTORY
 * ======================================================= */

export async function getAdSpySnapshotHistory(
  input: {
    userId: string;

    query?: string;

    country?: string;

    platform?: AdSpyPlatform;

    limit?: number;
  },
): Promise<AdSpySnapshot[]> {
  const supabase =
    await createServerAuthClient();

  const safeLimit =
    Math.min(
      Math.max(
        input.limit ??
          10,
        1,
      ),
      100,
    );

  let request =
    supabase
      .from(
        "adspy_snapshots",
      )
      .select(
        "id,user_id,query,country,platform,ads,intelligence,created_at",
      )
      .eq(
        "user_id",
        input.userId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        safeLimit,
      );

  if (
    input.query?.trim()
  ) {
    request =
      request.eq(
        "query",
        input.query.trim(),
      );
  }

  if (
    input.country?.trim()
  ) {
    request =
      request.eq(
        "country",
        input.country
          .trim()
          .toUpperCase(),
      );
  }

  if (input.platform) {
    request =
      request.eq(
        "platform",
        input.platform,
      );
  }

  const {
    data,
    error,
  } =
    await request;

  if (error) {
    throw new Error(
      `Failed to get AdSpy snapshot history: ${error.message}`,
    );
  }

  return (
    (data ?? []) as AdSpySnapshotRow[]
  ).map(
    mapSnapshotRow,
  );
}