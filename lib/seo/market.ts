import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSearchFacets, type FacetBucket, type FacetResult } from "@/lib/ad-intelligence/global/facets";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import { fastMediaUrl, isStoredMediaUrl } from "@/lib/ad-intelligence/global/media-store";

/**
 * Live market numbers for the public SEO pages (brand, industry, research).
 * Everything here is read from the ads we collect from Meta's public Ad
 * Library: nothing is estimated. Every call fails soft (empty result) so a
 * public page never breaks because the database is slow.
 */

const COUNTRY = "IN";
const DAY_MS = 86_400_000;

export type Advertiser = { pageId: string; name: string };

export type BrandStat = {
  /** The name we searched for (our list), which can differ from the Page name. */
  query: string;
  name: string;
  slug: string;
  pageId: string;
  total: number;
  active: number;
  video: number;
  image: number;
  carousel: number;
  languages: FacetBucket[];
  launched30d: number;
};

export type LongAd = {
  id: string;
  advertiser: string;
  advertiserSlug: string;
  text: string;
  media: string;
  format: string;
  days: number;
};

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Brand name -> its Meta page, via the same autocomplete the app uses. */
export async function resolveAdvertiser(name: string): Promise<Advertiser | null> {
  if (name.trim().length < 2) return null;
  try {
    const { data } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
      p_query: name,
      p_platform: "meta",
      p_country: COUNTRY,
      p_limit: 8,
    });
    const rows = ((data ?? []) as Array<{ page_id?: string | number | null; label?: string | null }>)
      .filter((r) => r.page_id && r.label)
      .map((r) => ({ pageId: String(r.page_id), name: String(r.label) }));
    const want = norm(name);
    return rows.find((r) => norm(r.name) === want) ?? rows.find((r) => norm(r.name).startsWith(want)) ?? null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const count = (buckets: FacetBucket[] | undefined, value: string) => buckets?.find((b) => b.value === value)?.count ?? 0;

function statFrom(adv: Advertiser & { query: string }, facets: FacetResult | null): BrandStat | null {
  if (!facets || !facets.total) return null;
  return {
    query: adv.query,
    name: adv.name,
    slug: brandSlug(adv.name),
    pageId: adv.pageId,
    total: facets.total,
    active: count(facets.status, "active"),
    video: count(facets.format, "video"),
    image: count(facets.format, "image"),
    carousel: count(facets.format, "carousel"),
    languages: facets.language ?? [],
    launched30d: facets.momentum?.launched30d ?? 0,
  };
}

/** Live stats for a list of brand names. Brands with no collected ads are left out. */
export async function getBrandStats(names: string[]): Promise<BrandStat[]> {
  const resolved = await mapLimit(names, 12, async (query) => {
    const adv = await resolveAdvertiser(query);
    return adv ? { ...adv, query } : null;
  });
  // Two list names can resolve to the same Page; keep it once.
  const seen = new Set<string>();
  const advertisers = resolved.filter((a): a is Advertiser & { query: string } => {
    if (!a || seen.has(a.pageId)) return false;
    seen.add(a.pageId);
    return true;
  });
  if (!advertisers.length) return [];

  // Precomputed per-advertiser summaries: one query for the whole list.
  const summaries = new Map<string, FacetResult>();
  try {
    const { data } = await createGlobalServiceClient()
      .from("adspy_advertiser_summaries")
      .select("advertiser_id,facets")
      .eq("platform", "meta")
      .eq("country", COUNTRY)
      .in("advertiser_id", advertisers.map((a) => a.pageId));
    for (const row of (data ?? []) as Array<{ advertiser_id: string; facets: FacetResult }>) summaries.set(String(row.advertiser_id), row.facets);
  } catch {
    /* fall through to per-brand facets */
  }

  const stats = await mapLimit(advertisers, 6, async (adv) => {
    const facets =
      summaries.get(adv.pageId) ??
      (await getSearchFacets({ query: adv.name, country: COUNTRY, platform: "meta", mode: "advertiser", pageId: adv.pageId }).catch(() => null));
    return statFrom(adv, facets);
  });
  return stats.filter((s): s is BrandStat => Boolean(s)).sort((a, b) => b.active - a.active || b.total - a.total);
}

/** Ads that are still live and started longest ago: the likely winners. */
export async function getLongestRunning(advertisers: Array<Pick<BrandStat, "pageId" | "name">>, limit = 6): Promise<LongAd[]> {
  if (!advertisers.length) return [];
  const names = new Map(advertisers.map((a) => [a.pageId, a.name]));
  try {
    const { data } = await createGlobalServiceClient()
      .from("ad_intelligence_creatives")
      .select("id,advertiser_id,headline,primary_text,thumbnail_url,image_url,creative_type,first_seen_at")
      .eq("platform", "meta")
      .eq("is_currently_active", true)
      .in("advertiser_id", [...names.keys()])
      .not("first_seen_at", "is", null)
      .order("first_seen_at", { ascending: true })
      .limit(limit * 6);
    const now = Date.now();
    const perBrand = new Map<string, number>();
    const out: LongAd[] = [];
    for (const row of (data ?? []) as Array<Record<string, string | null>>) {
      const media = row.thumbnail_url || row.image_url;
      const brand = names.get(String(row.advertiser_id));
      if (!media || !brand || !isStoredMediaUrl(media)) continue;
      // At most 2 per brand, so one advertiser cannot fill the whole list.
      const seen = perBrand.get(brand) ?? 0;
      if (seen >= 2 && advertisers.length > 1) continue;
      perBrand.set(brand, seen + 1);
      const raw = (row.primary_text || row.headline || "").replace(/\s+/g, " ").trim();
      out.push({
        id: String(row.id),
        advertiser: brand,
        advertiserSlug: brandSlug(brand),
        text: /^started running on\b/i.test(raw) ? "" : raw.slice(0, 140),
        media: fastMediaUrl(media),
        format: (row.creative_type ?? "ad").toLowerCase(),
        days: Math.max(1, Math.floor((now - new Date(String(row.first_seen_at)).getTime()) / DAY_MS)),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export type MarketTotals = {
  brands: number;
  total: number;
  active: number;
  launched30d: number;
  videoShare: number;
  imageShare: number;
  carouselShare: number;
  languages: Array<{ label: string; share: number }>;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Totals and shares across a set of brands. */
export function totals(stats: BrandStat[]): MarketTotals {
  const sum = (f: (s: BrandStat) => number) => stats.reduce((n, s) => n + f(s), 0);
  const total = sum((s) => s.total);
  const formatTotal = sum((s) => s.video + s.image + s.carousel) || total;
  const langs = new Map<string, number>();
  for (const s of stats) for (const l of s.languages) langs.set(l.label, (langs.get(l.label) ?? 0) + l.count);
  const langTotal = [...langs.values()].reduce((a, b) => a + b, 0);
  return {
    brands: stats.length,
    total,
    active: sum((s) => s.active),
    launched30d: sum((s) => s.launched30d),
    videoShare: pct(sum((s) => s.video), formatTotal),
    imageShare: pct(sum((s) => s.image), formatTotal),
    carouselShare: pct(sum((s) => s.carousel), formatTotal),
    languages: [...langs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, n]) => ({ label, share: pct(n, langTotal) })),
  };
}

export const share = pct;
export const fmt = (n: number) => n.toLocaleString("en-IN");

export type MixRow = { label: string; share: number };
export type CreativeMix = {
  decoded: number;
  offerShare: number;
  hooks: MixRow[];
  angles: MixRow[];
  visuals: MixRow[];
  languages: MixRow[];
};

const LABELS: Record<string, string> = {
  offer: "Offer first",
  claim_with_number: "Claim with a number",
  question: "Question",
  social_proof: "Social proof",
  problem_first: "Problem first",
  demo: "Product demo",
  testimonial: "Testimonial",
  founder_story: "Founder story",
  launch: "New launch",
  comparison: "Comparison",
  statement: "Bold statement",
  price_value: "Price / value",
  results: "Results",
  ingredients: "Ingredients",
  convenience: "Convenience",
  premium_status: "Premium / status",
  trust_safety: "Trust / safety",
  lifestyle: "Lifestyle",
  gifting: "Gifting",
  festive: "Festive",
  problem_solution: "Problem → solution",
  ugc_selfie: "UGC selfie",
  studio_product: "Studio product shot",
  lifestyle_scene: "Lifestyle scene",
  before_after: "Before / after",
  text_graphic: "Text graphic",
  animation: "Animation",
  influencer: "Influencer",
  demo_closeup: "Demo close-up",
  english: "English",
  hindi: "Hindi",
  hinglish: "Hinglish",
};

export const mixLabel = (v: string) => LABELS[v] ?? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function topShares(values: Array<string | null | undefined>, n = 4): MixRow[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const v of values) {
    if (!v) continue;
    total += 1;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v, c]) => ({ label: mixLabel(v), share: pct(c, total) }));
}

/**
 * What a brand's ads are made of, from the AI labels on its most recent
 * decoded ads (hook, angle, visual style, language, offer). Returns null
 * when too few ads are decoded to say anything honest.
 */
export async function getCreativeMix(pageId: string, minimum = 12): Promise<CreativeMix | null> {
  try {
    const { data } = await createGlobalServiceClient()
      .from("ad_creative_decodes")
      .select("elements")
      .eq("advertiser_id", pageId)
      .eq("status", "done")
      .order("decoded_at", { ascending: false })
      .limit(300);
    const rows = ((data ?? []) as Array<{ elements: Record<string, unknown> | null }>).map((r) => r.elements ?? {});
    if (rows.length < minimum) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const offers = rows.filter((r) => typeof r.offerPresent === "boolean");
    return {
      decoded: rows.length,
      offerShare: pct(offers.filter((r) => r.offerPresent === true).length, offers.length),
      hooks: topShares(rows.map((r) => str(r.hookType))),
      angles: topShares(rows.map((r) => str(r.angle))),
      visuals: topShares(rows.map((r) => str(r.visualStyle))),
      languages: topShares(rows.map((r) => str(r.language)), 3),
    };
  } catch {
    return null;
  }
}
