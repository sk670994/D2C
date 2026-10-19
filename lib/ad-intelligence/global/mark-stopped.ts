import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { STOP_CAP_FLOOR, STOP_CAP_SHARE, STRIKES_TO_STOP, stopCapExceeded } from "@/lib/ad-intelligence/global/scan-rules";

const CHUNK = 200;
const MISSING_RPC = /PGRST202|42883|could not find the function/i;

export type MarkMissedResult = {
  live: number;
  missed: number;
  /** Ads that got a strike this scan (first miss). */
  struck: number;
  stopped: number;
  reset: number;
  /** More than 15% of the page's live ads missing: nothing was changed. */
  capped: boolean;
};

/**
 * After a COMPLETE live-only scan of one Meta page (>= 98% of Meta's total,
 * see isScanComplete): every ad of that page still flagged live but not seen
 * in the scan gets a strike; the SECOND miss in a row marks it stopped. Seen
 * ads were written with last_seen_at = now (after scanStartedAt), so "live
 * and last seen before the scan started" is exactly the missed set.
 *
 * Sanity cap: more than 15% of the page's live ads missing at once means the
 * scan was bad (Kapiva, 19 Oct: 583 of ~1,300), so nothing is changed.
 *
 * Only call this when the scan reached the end of Meta's list.
 */
export async function markStoppedAds(input: {
  pageId: string;
  platform: string;
  scanStartedAt: string;
}): Promise<MarkMissedResult> {
  const client = createGlobalServiceClient();
  const { data, error } = await client.rpc("adspy_mark_missed", {
    p_platform: input.platform,
    p_page_id: input.pageId,
    p_scan_started_at: input.scanStartedAt,
    p_max_share: STOP_CAP_SHARE,
    p_floor: STOP_CAP_FLOOR,
    p_strikes: STRIKES_TO_STOP,
  });
  if (!error) {
    const r = (data ?? {}) as Partial<Record<keyof MarkMissedResult, number | boolean>>;
    const result: MarkMissedResult = {
      live: Number(r.live ?? 0),
      missed: Number(r.missed ?? 0),
      struck: Number(r.struck ?? 0),
      stopped: Number(r.stopped ?? 0),
      reset: Number(r.reset ?? 0),
      capped: Boolean(r.capped),
    };
    if (result.capped) {
      console.warn("[AdSpy stop] sanity cap: too many live ads missing, nothing marked", {
        pageId: input.pageId,
        live: result.live,
        missed: result.missed,
      });
    }
    return result;
  }
  if (!MISSING_RPC.test(`${error.code ?? ""} ${error.message}`)) {
    throw new Error(`mark missed failed: ${error.message}`);
  }
  // Migration 20261021010000 not applied yet: old one-strike behaviour, but
  // with the 15% sanity cap.
  return markStoppedAdsLegacy(input);
}

async function markStoppedAdsLegacy(input: {
  pageId: string;
  platform: string;
  scanStartedAt: string;
}): Promise<MarkMissedResult> {
  const client = createGlobalServiceClient();

  const { count: liveCount, error: countError } = await client
    .from("ad_intelligence_creatives")
    .select("id", { count: "exact", head: true })
    .eq("platform", input.platform)
    .eq("advertiser_id", input.pageId)
    .eq("is_currently_active", true);
  if (countError) throw new Error(`count live ads failed: ${countError.message}`);
  const live = Number(liveCount ?? 0);

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

  const base = { live, missed: ids.length, struck: 0, reset: 0 };
  if (stopCapExceeded(ids.length, live)) {
    console.warn("[AdSpy stop] sanity cap: too many live ads missing, nothing marked", {
      pageId: input.pageId,
      live,
      missed: ids.length,
    });
    return { ...base, stopped: 0, capped: true };
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
    const { error: marketError } = await client
      .from("ad_intelligence_markets")
      .update({ is_currently_active: false })
      .in("creative_id", chunk);
    if (marketError) console.warn("[AdSpy stop] market flags not updated", marketError.message);
  }
  return { ...base, stopped: ids.length, capped: false };
}
