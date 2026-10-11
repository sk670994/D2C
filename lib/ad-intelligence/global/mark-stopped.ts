import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

const CHUNK = 200;

/**
 * After a COMPLETE live-only scan of one Meta page, every ad of that page that
 * is still flagged live but was not seen in the scan has stopped running.
 * Seen ads were written with last_seen_at = now (after scanStartedAt), so
 * "live and last seen before the scan started" is exactly the stopped set.
 *
 * Only call this when the scan reached the end of Meta's list; a partial
 * scan would wrongly stop ads it simply did not reach.
 */
export async function markStoppedAds(input: {
  pageId: string;
  platform: string;
  scanStartedAt: string;
}): Promise<number> {
  const client = createGlobalServiceClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("ad_intelligence_creatives")
      .select("id")
      .eq("platform", input.platform)
      .eq("advertiser_id", input.pageId)
      .eq("is_currently_active", true)
      .lt("last_seen_at", input.scanStartedAt)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`load live ads failed: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: string }>;
    ids.push(...rows.map((r) => String(r.id)));
    if (rows.length < 1000) break;
  }

  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await client
      .from("ad_intelligence_creatives")
      .update({ is_currently_active: false, updated_at: now })
      .in("id", chunk);
    if (error) throw new Error(`mark stopped failed: ${error.message}`);
    // Market rows carry their own live flag (state / city views).
    await client.from("ad_intelligence_markets").update({ is_currently_active: false }).in("creative_id", chunk);
  }
  return ids.length;
}
