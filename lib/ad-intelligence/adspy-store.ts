import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export type AdSpyPlatform = "meta" | "google" | "linkedin";

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

function mapSnapshotRow(
  row: AdSpySnapshotRow
): AdSpySnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    country: row.country,
    platform: row.platform,
    ads: Array.isArray(row.ads) ? row.ads : [],
    intelligence: row.intelligence ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Persist one complete AdSpy search result.
 *
 * We intentionally save the full ranked result set, not only the
 * paginated 20 ads shown in the UI.
 */
export async function saveAdSpySnapshot(
  input: SaveAdSpySnapshotInput
): Promise<AdSpySnapshot> {
  const supabase =
    await createServerAuthClient();

  const {
    data,
    error,
  } = await supabase
    .from("adspy_snapshots")
    .insert({
      user_id: input.userId,
      query: input.query.trim(),
      country: input.country.trim().toUpperCase(),
      platform: input.platform,
      ads: input.ads,
      intelligence: input.intelligence,
    })
    .select(
      "id,user_id,query,country,platform,ads,intelligence,created_at"
    )
    .single();

  if (error) {
    throw new Error(
      `Failed to save AdSpy snapshot: ${error.message}`
    );
  }

  return mapSnapshotRow(
    data as AdSpySnapshotRow
  );
}

/**
 * Get the newest snapshot for a user.
 */
export async function getLatestAdSpySnapshot(
  input: {
    userId: string;
    query?: string;
    country?: string;
    platform?: AdSpyPlatform;
  }
): Promise<AdSpySnapshot | null> {
  const supabase =
    await createServerAuthClient();

  let request = supabase
    .from("adspy_snapshots")
    .select(
      "id,user_id,query,country,platform,ads,intelligence,created_at"
    )
    .eq("user_id", input.userId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1);

  if (input.query?.trim()) {
    request = request.eq(
      "query",
      input.query.trim()
    );
  }

  if (input.country?.trim()) {
    request = request.eq(
      "country",
      input.country.trim().toUpperCase()
    );
  }

  if (input.platform) {
    request = request.eq(
      "platform",
      input.platform
    );
  }

  const {
    data,
    error,
  } = await request.maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get latest AdSpy snapshot: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return mapSnapshotRow(
    data as AdSpySnapshotRow
  );
}

/**
 * Get historical AdSpy snapshots.
 *
 * This will later let ZWIRK answer questions such as:
 * - "What changed since last week?"
 * - "Which offers are appearing more often?"
 * - "Are competitors using more video now?"
 */
export async function getAdSpySnapshotHistory(
  input: {
    userId: string;
    query?: string;
    country?: string;
    platform?: AdSpyPlatform;
    limit?: number;
  }
): Promise<AdSpySnapshot[]> {
  const supabase =
    await createServerAuthClient();

  const safeLimit = Math.min(
    Math.max(input.limit ?? 10, 1),
    100
  );

  let request = supabase
    .from("adspy_snapshots")
    .select(
      "id,user_id,query,country,platform,ads,intelligence,created_at"
    )
    .eq("user_id", input.userId)
    .order("created_at", {
      ascending: false,
    })
    .limit(safeLimit);

  if (input.query?.trim()) {
    request = request.eq(
      "query",
      input.query.trim()
    );
  }

  if (input.country?.trim()) {
    request = request.eq(
      "country",
      input.country.trim().toUpperCase()
    );
  }

  if (input.platform) {
    request = request.eq(
      "platform",
      input.platform
    );
  }

  const {
    data,
    error,
  } = await request;

  if (error) {
    throw new Error(
      `Failed to get AdSpy snapshot history: ${error.message}`
    );
  }

  return (
    (data ?? []) as AdSpySnapshotRow[]
  ).map(mapSnapshotRow);
}
