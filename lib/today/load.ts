import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSourceCounts, type SourceCounts } from "@/lib/ad-intelligence/global/source-counts";

import { loadDecodes } from "@/lib/decode/run";
import { topPatterns, type PatternCount } from "@/lib/decode/taxonomy";

import { cached } from "./cache";
import { detectChanges, type AdChange, type VersionRow } from "./changes";
import { loadLandingSummary, type LandingSummary } from "@/lib/landing/check";
import { brandVerdict, pickMoves, summarizeBrand, todayHeadline, type BrandSummary, type Move, type TodayAdRow } from "./insights";

const SELECT =
  "id,advertiser_name,creative_type,headline,primary_text,offer,call_to_action,landing_page_url,product_name,first_seen_at,last_seen_at,is_currently_active,thumbnail_url";
const PAGE = 1000;
const MAX_ROWS = 3000;
const MAX_RIVALS = 8;
/** How long a brand's summary is reused across all users (data is refreshed nightly). */
const SUMMARY_TTL_MS = 15 * 60_000;

/** One brand's summary, shared by every user who watches it. */
function brandSummary(pageId: string): Promise<BrandSummary> {
  return cached(`sum:${pageId}`, SUMMARY_TTL_MS, async () => {
    const rows = await loadRows(pageId);
    return summarizeBrand(pageId, rows, Date.now(), await loadChanges(rows));
  });
}

const CHANGE_WINDOW_DAYS = 7;
const VERSION_FIELDS = "creative_id,primary_text,headline,call_to_action,landing_page_url,offer,product_price,currency,first_observed_at";

/**
 * Recent content changes on a brand's live ads. Two light queries: which live
 * ads got a new version this week, then the full history of only those ads.
 * Best effort: a failure means "no changes", never a broken page.
 */
async function loadChanges(rows: TodayAdRow[]): Promise<AdChange[]> {
  try {
    const liveIds = rows.filter((row) => row.is_currently_active).map((row) => row.id).slice(0, 600);
    if (!liveIds.length) return [];
    const client = createGlobalServiceClient();
    const since = new Date(Date.now() - CHANGE_WINDOW_DAYS * 86_400_000).toISOString();
    const touched = new Set<string>();
    for (let i = 0; i < liveIds.length; i += 150) {
      const { data, error } = await client
        .from("ad_intelligence_creative_versions")
        .select("creative_id")
        .in("creative_id", liveIds.slice(i, i + 150))
        .gte("first_observed_at", since)
        .limit(1000);
      if (error) return [];
      for (const row of (data ?? []) as Array<{ creative_id: string }>) touched.add(String(row.creative_id));
    }
    if (!touched.size) return [];
    const ids = Array.from(touched).slice(0, 150);
    const { data, error } = await client
      .from("ad_intelligence_creative_versions")
      .select(VERSION_FIELDS)
      .in("creative_id", ids)
      .order("first_observed_at", { ascending: true })
      .limit(2000);
    if (error) return [];
    return detectChanges((data ?? []) as VersionRow[], Date.parse(since));
  } catch {
    return [];
  }
}

/** Summary + coverage + AI patterns for a brand page, shared across users. */
function brandCore(pageId: string, country: string): Promise<{ summary: BrandSummary; coverage: SourceCounts | null; patterns: CreativePatterns; landing?: LandingSummary | null }> {
  return cached(`core:${pageId}:${country}`, SUMMARY_TTL_MS, async () => {
    const [rows, coverage] = await Promise.all([
      loadRows(pageId),
      getSourceCounts({ platform: "meta", country, scope: { scopeType: "page", scopeKey: pageId } }),
    ]);
    const live = rows.filter((row) => row.is_currently_active);
    const landing = await loadLandingSummary(live.map((row) => row.id), new Map(live.map((row) => [row.id, row.offer])));
    return { summary: summarizeBrand(pageId, rows, Date.now(), await loadChanges(rows)), coverage, patterns: await patternsFor(rows), landing };
  });
}

export type WatchedTarget = { pageId: string; name: string; country: string };

export type CreativePatterns = { decoded: number; live: number; top: PatternCount[] };

export type VsYou = {
  you: { pageId: string; name: string; new7: number; active: number; videoShare: number; topOffer: string | null; patterns: CreativePatterns };
};

export type BrandOverview = BrandSummary & {
  verdict: string;
  country: string;
  coverage: SourceCounts | null;
  patterns: CreativePatterns;
  vsYou: VsYou | null;
  /** How live ads line up with their landing pages (null until checked). */
  landing: LandingSummary | null;
};

export type TodayData = {
  generatedAt: string;
  headline: string;
  moves: Move[];
  rivals: Array<{ pageId: string; name: string; new7: number; total: number; lastSeenAt: string | null }>;
  watchedCount: number;
};

async function loadRows(pageId: string): Promise<TodayAdRow[]> {
  const client = createGlobalServiceClient();
  const rows: TodayAdRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await client
      .from("ad_intelligence_creatives")
      .select(SELECT)
      .eq("platform", "meta")
      .eq("advertiser_id", pageId)
      .order("first_seen_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, Math.min(from + PAGE, MAX_ROWS) - 1);
    if (error) throw new Error(`Could not read ads for ${pageId}: ${error.message}`);
    const batch = (data ?? []) as TodayAdRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/** AI patterns over a brand's live ads (only ads the decoder has labelled). */
async function patternsFor(rows: TodayAdRow[]): Promise<CreativePatterns> {
  const live = rows.filter((row) => row.is_currently_active).slice(0, 600);
  const decodes = await loadDecodes(live.map((row) => row.id));
  return { decoded: decodes.size, live: live.length, top: topPatterns(Array.from(decodes.values()), 2) };
}

/** The user's own Meta page (Brand Vault), when set. */
export async function getOwnBrand(userId: string): Promise<{ pageId: string | null; brandName: string | null; websiteUrl: string | null }> {
  const { data, error } = await createGlobalServiceClient()
    .from("brand_vaults")
    .select("own_page_id,brand_name,website_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { pageId: null, brandName: null, websiteUrl: null };
  const row = data as { own_page_id?: string | null; brand_name?: string | null; website_url?: string | null };
  return {
    pageId: row.own_page_id && /^\d+$/.test(row.own_page_id) ? row.own_page_id : null,
    brandName: row.brand_name ?? null,
    websiteUrl: row.website_url ?? null,
  };
}

export async function getBrandOverview(pageId: string, country = "IN", ownPageId: string | null = null): Promise<BrandOverview> {
  const { summary, coverage, patterns, landing } = await brandCore(pageId, country);

  let vsYou: VsYou | null = null;
  if (ownPageId && ownPageId !== pageId) {
    const ownCore = await brandCore(ownPageId, country);
    const own = ownCore.summary;
    vsYou = {
      you: {
        pageId: ownPageId,
        name: own.name,
        new7: own.new7,
        active: own.active,
        videoShare: own.videoShare,
        topOffer: own.offers[0]?.label ?? null,
        patterns: ownCore.patterns,
      },
    };
  }
  return { ...summary, verdict: brandVerdict(summary), country, coverage, patterns, vsYou, landing: landing ?? null };
}

/** The user's rivals: AdSpy watchlist first, then Brand Vault competitors (Page ID only). */
export async function listWatchedTargets(userId: string): Promise<WatchedTarget[]> {
  const client = createGlobalServiceClient();
  const [watch, vault] = await Promise.all([
    client
      .from("adspy_advertiser_watchlists")
      .select("advertiser_id,advertiser_name,country,updated_at")
      .eq("user_id", userId)
      .eq("platform", "meta")
      .order("updated_at", { ascending: false })
      .limit(50),
    client.from("brand_vault_competitors").select("name,advertiser_page_id,country").eq("user_id", userId).limit(10),
  ]);

  const out: WatchedTarget[] = [];
  const seen = new Set<string>();
  const push = (pageId: unknown, name: unknown, country: unknown) => {
    const id = String(pageId ?? "").trim();
    if (!/^\d+$/.test(id) || seen.has(id)) return;
    seen.add(id);
    out.push({ pageId: id, name: String(name ?? "").trim() || `Page ${id}`, country: String(country ?? "IN").toUpperCase() });
  };
  for (const row of (watch.data ?? []) as Array<Record<string, unknown>>) push(row.advertiser_id, row.advertiser_name, row.country);
  if (!vault.error) {
    for (const row of (vault.data ?? []) as Array<Record<string, unknown>>) push(row.advertiser_page_id, row.name, row.country);
  }
  return out;
}

export async function getToday(userId: string): Promise<TodayData> {
  const targets = await listWatchedTargets(userId);
  const chosen = targets.slice(0, MAX_RIVALS);
  const settled = await Promise.allSettled(chosen.map((t) => brandSummary(t.pageId)));
  const summaries: BrandSummary[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const s = result.value;
      // Prefer the name the user saved when the index has no ads yet.
      summaries.push(s.total ? s : { ...s, name: chosen[i].name });
    } else {
      console.warn("[Today] brand skipped", chosen[i].pageId, result.reason instanceof Error ? result.reason.message : result.reason);
    }
  });
  const moves = pickMoves(summaries);
  return {
    generatedAt: new Date().toISOString(),
    headline: todayHeadline(moves),
    moves,
    rivals: summaries
      .map((s) => ({ pageId: s.pageId, name: s.name, new7: s.new7, total: s.total, lastSeenAt: s.lastSeenAt }))
      .sort((a, b) => b.new7 - a.new7 || b.total - a.total),
    watchedCount: targets.length,
  };
}
