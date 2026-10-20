import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { cached } from "@/lib/today/cache";
import { buildRivalContext, type RivalCreative, type RivalDecode, type RivalWatch } from "./rival-context";

const TTL_MS = 10 * 60_000;

async function compute(userId: string): Promise<string> {
  const client = createGlobalServiceClient();
  const watched = await client
    .from("adspy_advertiser_watchlists")
    .select("advertiser_id,advertiser_name")
    .eq("user_id", userId)
    .eq("platform", "meta")
    .order("updated_at", { ascending: false })
    .limit(8);
  if (watched.error) return "";
  const watch = ((watched.data ?? []) as Array<{ advertiser_id: unknown; advertiser_name: unknown }>)
    .map((r) => ({ advertiser_id: String(r.advertiser_id ?? ""), advertiser_name: r.advertiser_name == null ? null : String(r.advertiser_name) }))
    .filter((r): r is RivalWatch => /^\d+$/.test(r.advertiser_id));
  if (!watch.length) return "";

  const decoded = await client
    .from("ad_creative_decodes")
    .select("creative_id,advertiser_id,elements,decoded_at")
    .eq("status", "done")
    .in("advertiser_id", watch.map((w) => w.advertiser_id))
    .order("decoded_at", { ascending: false })
    .limit(20);
  const decodes = decoded.error ? [] : ((decoded.data ?? []) as RivalDecode[]);

  const creatives = new Map<string, RivalCreative>();
  if (decodes.length) {
    const rows = await client
      .from("ad_intelligence_creatives")
      .select("id,headline,creative_type,first_seen_at,is_currently_active")
      .in("id", decodes.map((d) => d.creative_id));
    for (const row of (rows.error ? [] : rows.data ?? []) as RivalCreative[]) creatives.set(String(row.id), row);
  }
  return buildRivalContext(watch, decodes, creatives);
}

/** "Rival ads (decoded)" text for ZWIRK, cached per user for 10 minutes. Never throws; "" on any failure. */
export async function loadRivalContext(userId: string | null | undefined): Promise<string> {
  if (!userId) return "";
  try {
    return await cached(`zwirk-rivals:${userId}`, TTL_MS, () => compute(userId));
  } catch (error) {
    console.warn("[zwirk] rival context failed", error instanceof Error ? error.message : error);
    return "";
  }
}
