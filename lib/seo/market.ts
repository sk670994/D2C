import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getSearchFacets, type FacetBucket, type FacetResult } from "@/lib/ad-intelligence/global/facets";
import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import { fastMediaUrl, isStoredMediaUrl } from "@/lib/ad-intelligence/global/media-store";
import { PAGE_OVERRIDES, resolveBrandPages } from "@/lib/ad-intelligence/discovery/resolve-brand-pages";
import { newestDate } from "@/lib/seo/data-date";

export { PAGE_OVERRIDES };

/**
 * Live market numbers for the public SEO pages (brand, industry, research).
 * Everything here is read from the ads we collect from Meta's public Ad
 * Library: nothing is estimated. A real database error THROWS (these pages
 * are ISR: a throw keeps the last good version cached instead of caching an
 * empty page); an empty result means the database confirmed zero rows.
 */

const COUNTRY = "IN";
const DAY_MS = 86_400_000;

export type Advertiser = {
  pageId: string;
  name: string;
  /** Every pinned page of the brand, primary first. */
  pageIds?: string[];
};

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
  /** When the summary behind these numbers was computed (null: counted live). */
  computedAt: string | null;
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

/**
 * Brand name -> its Meta page(s): seed pins, then hand overrides, then the
 * autocomplete pick (lib/ad-intelligence/discovery/resolve-brand-pages.ts).
 * Null = no match; throws when the look-up itself fails.
 */
export async function resolveAdvertiser(name: string): Promise<Advertiser | null> {
  if (name.trim().length < 2) return null;
  const pages = await resolveBrandPages(name, { country: COUNTRY });
  return pages ? { pageId: pages.primaryPageId, name: pages.name, pageIds: pages.pageIds } : null;
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

function statFrom(adv: Advertiser & { query: string }, facets: FacetResult | null, computedAt: string | null): BrandStat | null {
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
    computedAt,
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
  const summaries = new Map<string, { facets: FacetResult; computedAt: string | null }>();
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_advertiser_summaries")
    .select("advertiser_id,facets,computed_at")
    .eq("platform", "meta")
    .eq("country", COUNTRY)
    .in("advertiser_id", advertisers.map((a) => a.pageId));
  if (error) throw new Error(`Advertiser summaries failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ advertiser_id: string; facets: FacetResult; computed_at: string | null }>) {
    summaries.set(String(row.advertiser_id), { facets: row.facets, computedAt: row.computed_at ?? null });
  }

  // No summary yet: count live (getSearchFacets throws on a database error).
  const stats = await mapLimit(advertisers, 6, async (adv) => {
    const summary = summaries.get(adv.pageId);
    if (summary) return statFrom(adv, summary.facets, summary.computedAt);
    const facets = await getSearchFacets({ query: adv.name, country: COUNTRY, platform: "meta", mode: "advertiser", pageId: adv.pageId });
    return statFrom(adv, facets, null);
  });
  return stats.filter((s): s is BrandStat => Boolean(s)).sort((a, b) => b.active - a.active || b.total - a.total);
}

/** Data date of a set of stats: the newest summary computed_at among them (null if all were counted live). */
export function statsDataDate(stats: Array<Pick<BrandStat, "computedAt">>): string | null {
  return newestDate(stats.map((s) => s.computedAt));
}

/** Ads that are still live and started longest ago: the likely winners. */
export async function getLongestRunning(advertisers: Array<Pick<BrandStat, "pageId" | "name"> & { pageIds?: string[] }>, limit = 6): Promise<LongAd[]> {
  if (!advertisers.length) return [];
  // Every pinned page of a brand counts as that brand.
  const names = new Map(advertisers.flatMap((a) => (a.pageIds?.length ? a.pageIds : [a.pageId]).map((id) => [id, a.name] as const)));
  const { data, error } = await createGlobalServiceClient()
    .from("ad_intelligence_creatives")
    .select("id,advertiser_id,headline,primary_text,thumbnail_url,image_url,creative_type,first_seen_at")
    .eq("platform", "meta")
    .eq("is_currently_active", true)
    .in("advertiser_id", [...names.keys()])
    .not("first_seen_at", "is", null)
    .order("first_seen_at", { ascending: true })
    .limit(limit * 6);
  if (error) throw new Error(`Longest-running ads failed: ${error.message}`);
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
  const { data, error } = await createGlobalServiceClient()
    .from("ad_creative_decodes")
    .select("elements")
    .eq("advertiser_id", pageId)
    .eq("status", "done")
    .order("decoded_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Creative mix failed: ${error.message}`);
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
}

export type SeasonData = {
  matched: number;
  active: number;
  brandCount: number;
  brands: Array<{ name: string; slug: string; count: number; active: number }>;
  weeks: Array<{ weekStart: string; n: number }>;
  videoShare: number;
  offers: Array<{ label: string; share: number }>;
  ads: LongAd[];
  /** Newest last_seen_at among the matched ads (the data date). */
  dataDate: string | null;
};

const OFFER_PATTERNS: Array<[string, RegExp]> = [
  ["% off / discount", /\d{1,2}\s?%\s?(off|discount)|flat\s?₹?\s?\d+\s?off|upto\s?\d+%|up to \d+%/i],
  ["Free gift", /free\s+(gift|goodies|sample|product)|gift\s+(free|inside)/i],
  ["Buy X get Y / combo", /buy\s?\d\s?get\s?\d|\bbogo\b|combo|bundle/i],
  ["Cashback / bank offer", /cashback|cash back|bank offer|hdfc|icici|sbi card/i],
  ["No-cost EMI", /no[-\s]?cost\s?emi|easy\s?emi|\bemi\b/i],
  ["Free shipping / COD", /free\s+(shipping|delivery)|cash on delivery|\bcod\b/i],
];

function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/**
 * Every collected Meta ad from the last year whose copy mentions the season,
 * summarised: weekly calendar, top advertisers, offer mix and the
 * longest-running live ads. Fails soft to an empty result.
 */
export async function getSeasonData(keywords: string[], limit = 2500): Promise<SeasonData> {
  const empty: SeasonData = { matched: 0, active: 0, brandCount: 0, brands: [], weeks: [], videoShare: 0, offers: [], ads: [], dataDate: null };
  const safe = keywords.map((k) => k.replace(/["\\,()%*]/g, "").trim()).filter(Boolean);
  if (!safe.length) return empty;
  const filter = safe.flatMap((k) => [`primary_text.ilike."%${k}%"`, `headline.ilike."%${k}%"`]).join(",");
  const since = new Date(Date.now() - 400 * DAY_MS).toISOString();
  const { data, error } = await createGlobalServiceClient()
    .from("ad_intelligence_creatives")
    .select("id,advertiser_id,advertiser_name,headline,primary_text,thumbnail_url,image_url,creative_type,is_currently_active,first_seen_at,last_seen_at")
    .eq("platform", "meta")
    .gte("first_seen_at", since)
    .or(filter)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Season ads failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, string | boolean | null>>;
  if (!rows.length) return empty;

  const now = Date.now();
  const byBrand = new Map<string, { name: string; count: number; active: number }>();
  const weekCounts = new Map<string, number>();
  const offerHits = new Map<string, number>();
  let active = 0;
  let video = 0;
  for (const r of rows) {
    const name = String(r.advertiser_name ?? "").trim();
    if (!name) continue;
    const b = byBrand.get(name) ?? { name, count: 0, active: 0 };
    b.count += 1;
    if (r.is_currently_active) { b.active += 1; active += 1; }
    byBrand.set(name, b);
    if (String(r.creative_type ?? "").toLowerCase() === "video") video += 1;
    if (r.first_seen_at) {
      const k = weekKey(new Date(String(r.first_seen_at)));
      weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1);
    }
    const text = `${r.headline ?? ""} ${r.primary_text ?? ""}`;
    for (const [label, re] of OFFER_PATTERNS) if (re.test(text)) offerHits.set(label, (offerHits.get(label) ?? 0) + 1);
  }

  // 52 weekly buckets ending this week, zero-filled.
  const weeks: SeasonData["weeks"] = [];
  const thisWeek = new Date(weekKey(new Date()));
  for (let i = 51; i >= 0; i--) {
    const d = new Date(thisWeek.getTime() - i * 7 * DAY_MS);
    const k = d.toISOString().slice(0, 10);
    weeks.push({ weekStart: k, n: weekCounts.get(k) ?? 0 });
  }

  const longest = rows
    .filter((r) => r.is_currently_active && r.first_seen_at && isStoredMediaUrl(String(r.thumbnail_url || r.image_url || "")))
    .sort((a, b) => String(a.first_seen_at).localeCompare(String(b.first_seen_at)));
  const perBrand = new Map<string, number>();
  const ads: LongAd[] = [];
  for (const r of longest) {
    const brand = String(r.advertiser_name);
    if ((perBrand.get(brand) ?? 0) >= 1) continue;
    perBrand.set(brand, 1);
    const raw = String(r.primary_text || r.headline || "").replace(/\s+/g, " ").trim();
    ads.push({
      id: String(r.id),
      advertiser: brand,
      advertiserSlug: brandSlug(brand),
      text: /^started running on\b/i.test(raw) ? "" : raw.slice(0, 140),
      media: fastMediaUrl(String(r.thumbnail_url || r.image_url)),
      format: String(r.creative_type ?? "ad").toLowerCase(),
      days: Math.max(1, Math.floor((now - new Date(String(r.first_seen_at)).getTime()) / DAY_MS)),
    });
    if (ads.length >= 6) break;
  }

  const brands = [...byBrand.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((b) => ({ ...b, slug: brandSlug(b.name) }));
  return {
    matched: rows.length,
    active,
    brandCount: byBrand.size,
    brands,
    weeks,
    videoShare: pct(video, rows.length),
    offers: OFFER_PATTERNS.map(([label]) => ({ label, share: pct(offerHits.get(label) ?? 0, rows.length) })).sort((a, b) => b.share - a.share),
    ads,
    dataDate: newestDate(rows.map((r) => (typeof r.last_seen_at === "string" ? r.last_seen_at : null))),
  };
}
