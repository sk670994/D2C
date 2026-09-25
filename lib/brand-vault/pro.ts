import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";
import {
  EMPTY_ECONOMICS,
  type BrandEconomics,
  type BrandVaultAnalytics,
  type BrandVaultCompetitor,
  type BrandVaultPeriod,
  type CompetitorAnalytics,
  type OfferItem,
  type ProductPressure,
  type RankedItem,
  type SupportingAd,
  type Provenance,
} from "./types";

const DAY_MS = 86_400_000;
const MAX_ADS_PER_COMPETITOR = 5_000;
const MAX_SUPPORTING_ADS = 6;
const MAX_LANGUAGE_ROWS = 50_000;

const ANGLES = [
  "discount-led",
  "problem-solution",
  "benefit-led",
  "social-proof",
  "product-demo",
  "urgency-led",
] as const;

const LANGUAGE_FALLBACK = ["en", "hi", "hinglish", "ta", "te", "mr", "bn", "gu", "kn", "ml"];

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = (value: unknown) => clean(value).toLowerCase();
const compactName = (value: unknown) => normalize(value).replace(/[^a-z0-9]+/g, "");

function safeDate(value: unknown): number | null {
  const ms = value ? new Date(String(value)).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function runningDays(firstSeenAt: string | null, lastSeenAt: string | null, now = Date.now()): number {
  const first = safeDate(firstSeenAt);
  if (first == null) return 0;
  const last = safeDate(lastSeenAt) ?? now;
  return Math.max(1, Math.floor((last - first) / DAY_MS) + 1);
}

function periodDays(period: BrandVaultPeriod): number {
  return period === "week" ? 7 : period === "month" ? 30 : 90;
}

function firstSentence(text: string | null): string | null {
  const value = clean(text);
  if (!value) return null;
  const first = value.split(/[.!?।！？]/)[0]?.trim() ?? value;
  const cleaned = first.replace(/\bhttps?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}

function messageAngle(text: string | null): string | null {
  const value = normalize(text);
  if (!value) return null;
  const groups: Array<{ label: string; words: string[] }> = [
    { label: "discount-led", words: ["discount", "off", "sale", "deal", "save", "coupon", "%"] },
    { label: "problem-solution", words: ["problem", "solve", "fix", "struggle", "pain", "without", "stop"] },
    { label: "benefit-led", words: ["benefit", "better", "faster", "easier", "premium", "quality", "results"] },
    { label: "social-proof", words: ["review", "reviews", "customer", "customers", "trusted", "loved", "rated", "testimonial"] },
    { label: "product-demo", words: ["watch", "see", "demo", "how", "before", "after", "works"] },
    { label: "urgency-led", words: ["today", "now", "limited", "hurry", "ends", "last", "only"] },
  ];
  let best: string | null = null;
  let score = 0;
  for (const group of groups) {
    let current = 0;
    for (const word of group.words) {
      current += value.includes(word) ? 1 : 0;
    }
    if (current > score) {
      score = current;
      best = group.label;
    }
  }
  return best;
}

function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function ranked(values: string[], total: number, provenance: Provenance = "Derived"): RankedItem[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const label = clean(raw);
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, share: percent(count, total), provenance }));
}

function rankedHooks(rows: RawAd[], total: number): RankedItem[] {
  const map = new Map<string, { label: string; count: number; score: number; creators: Set<string> }>();
  for (const row of rows) {
    const label = firstSentence(row.primary_text ?? row.headline);
    if (!label) continue;
    const key = normalize(label);
    const entry = map.get(key) ?? { label, count: 0, score: 0, creators: new Set<string>() };
    entry.count += 1;
    entry.score += row.is_currently_active === false ? 1 : Math.min(90, runningDays(row.first_seen_at, row.last_seen_at));
    const creator = clean(row.creator_name);
    if (creator) entry.creators.add(normalize(creator));
    map.set(key, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.score - a.score || b.creators.size - a.creators.size || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)
    .map((item) => ({ label: item.label, count: item.count, share: percent(item.count, total), provenance: "Derived" }));
}

function rankedCreators(rows: RawAd[], total: number): RankedItem[] {
  const map = new Map<string, { label: string; count: number; active: number; longevity: number }>();
  for (const row of rows) {
    const label = clean(row.creator_name);
    if (!label) continue;
    const key = normalize(label);
    const entry = map.get(key) ?? { label, count: 0, active: 0, longevity: 0 };
    entry.count += 1;
    if (row.is_currently_active !== false) entry.active += 1;
    entry.longevity += Math.min(90, runningDays(row.first_seen_at, row.last_seen_at));
    map.set(key, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.active - a.active || b.count - a.count || b.longevity - a.longevity || a.label.localeCompare(b.label))
    .slice(0, 5)
    .map((item) => ({ label: item.label, count: item.count, share: percent(item.count, total), provenance: "Source" }));
}

function parsePrice(value: string | null): number | null {
  const raw = clean(value).replace(/[,\s]/g, " ");
  if (!raw) return null;
  const rupee = raw.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d{1,2})?)/i);
  if (rupee) return Number(rupee[1]);
  return null;
}

function visibleOfferPrice(row: RawAd): number | null {
  return row.product_price != null && Number.isFinite(Number(row.product_price))
    ? Number(row.product_price)
    : parsePrice(row.offer);
}

function relationToBreakEven(price: number | null, breakEven: number | null): OfferItem["relation"] {
  if (price == null || breakEven == null) return "unknown";
  const delta = price - breakEven;
  if (delta < -breakEven * 0.05) return "below";
  if (Math.abs(delta) <= Math.max(50, breakEven * 0.05)) return "near";
  return "above";
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "not set";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function normalizeEconomics(value: unknown): BrandEconomics {
  if (!value || typeof value !== "object") return { ...EMPTY_ECONOMICS };
  const input = value as Record<string, unknown>;
  const numberOrNull = (key: keyof BrandEconomics) => {
    const raw = input[key];
    const number = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(number) ? number : null;
  };
  return {
    sellingPrice: numberOrNull("sellingPrice"),
    cogs: numberOrNull("cogs"),
    packagingCost: numberOrNull("packagingCost"),
    shippingCost: numberOrNull("shippingCost"),
    paymentFeePercent: numberOrNull("paymentFeePercent"),
    paymentFeeFixed: numberOrNull("paymentFeeFixed"),
    rtoRatePercent: numberOrNull("rtoRatePercent"),
    rtoCost: numberOrNull("rtoCost"),
    refundAllowancePercent: numberOrNull("refundAllowancePercent"),
    targetContributionMarginPercent: numberOrNull("targetContributionMarginPercent"),
  };
}

export function calculateBreakEven(economics: BrandEconomics): {
  breakEvenPrice: number | null;
  targetMarginPrice: number | null;
  contributionBeforeAds: number | null;
} {
  const fixed =
    (economics.cogs ?? 0) +
    (economics.packagingCost ?? 0) +
    (economics.shippingCost ?? 0) +
    ((economics.rtoCost ?? 0) * (economics.rtoRatePercent ?? 0)) / 100 +
    (economics.paymentFeeFixed ?? 0);
  const feeRate = Math.max(0, (economics.paymentFeePercent ?? 0) + (economics.refundAllowancePercent ?? 0)) / 100;
  const denominator = 1 - feeRate;
  const breakEvenPrice = denominator > 0 ? fixed / denominator : null;
  const targetMargin = Math.max(0, economics.targetContributionMarginPercent ?? 0) / 100;
  const targetDenominator = 1 - feeRate - targetMargin;
  const targetMarginPrice = targetDenominator > 0 ? fixed / targetDenominator : null;

  if (economics.sellingPrice == null) {
    return { breakEvenPrice, targetMarginPrice, contributionBeforeAds: null };
  }

  const revenue = economics.sellingPrice;
  const contributionBeforeAds =
    revenue - fixed - revenue * feeRate;
  return { breakEvenPrice, targetMarginPrice, contributionBeforeAds };
}

export type RawAd = {
  id: string;
  advertiser_name: string | null;
  advertiser_id: string | null;
  creator_name: string | null;
  creative_type: string | null;
  primary_text: string | null;
  headline: string | null;
  offer: string | null;
  call_to_action: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
  product_name: string | null;
  product_price: number | string | null;
  max_price: number | string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  currency: string | null;
};

type LanguageRow = {
  creative_id: string;
  language: string | null;
  language_name?: string | null;
};

type ObservationRow = {
  creative_id: string;
  language: string | null;
  observation_day: string;
};

function mapSupportingAd(row: RawAd, provenance: Provenance = "Source"): SupportingAd {
  const days = runningDays(row.first_seen_at, row.last_seen_at);
  return {
    id: row.id,
    productName: clean(row.product_name) || null,
    hook: firstSentence(row.primary_text ?? row.headline),
    creatorName: clean(row.creator_name) || null,
    offer: clean(row.offer) || null,
    price: visibleOfferPrice(row),
    creativeType: clean(row.creative_type) || null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    runningDays: days,
    active: row.is_currently_active,
    sourceUrl: clean(row.source_url) || null,
    thumbnailUrl: clean(row.thumbnail_url) || null,
    provenance,
    heuristicLabel: row.is_currently_active && days >= 60 ? "Likely proven · heuristic" : null,
  };
}

async function resolveIndexedPageId(name: string, country: string): Promise<string | null> {
  const service = createGlobalServiceClient();
  const result = await service.rpc("adspy_autocomplete_advertisers", {
    p_query: name,
    p_platform: "meta",
    p_country: country,
    p_limit: 12,
  });
  if (result.error || !result.data?.length) return null;

  const query = compactName(name);
  for (const candidate of result.data as Array<{ page_id?: string | null; label?: string | null }>) {
    const pageId = clean(candidate.page_id);
    const label = compactName(candidate.label);
    if (!/^\d+$/.test(pageId)) continue;
    if (!query || !label) continue;
    if (label === query || label.startsWith(query) || query.startsWith(label)) return pageId;
  }
  return null;
}

async function loadAds(pageId: string, name: string, country = "IN"): Promise<RawAd[]> {
  const service = createGlobalServiceClient();
  const select = "id,advertiser_name,advertiser_id,creator_name,creative_type,primary_text,headline,offer,call_to_action,first_seen_at,last_seen_at,is_currently_active,product_name,product_price,max_price,source_url,thumbnail_url,currency";
  let resolvedPageId = /^\d+$/.test(pageId) ? pageId : null;

  if (!resolvedPageId) resolvedPageId = await resolveIndexedPageId(name, country);

  if (resolvedPageId) {
    const byId = await service
      .from("ad_intelligence_creatives")
      .select(select)
      .eq("platform", "meta")
      .eq("advertiser_id", resolvedPageId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(MAX_ADS_PER_COMPETITOR);

    if (!byId.error && byId.data?.length) return (byId.data ?? []) as RawAd[];
  }

  const exact = await service
    .from("ad_intelligence_creatives")
    .select(select)
    .eq("platform", "meta")
    .ilike("advertiser_name", name)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(MAX_ADS_PER_COMPETITOR);

  if (!exact.error && exact.data?.length) return (exact.data ?? []) as RawAd[];

  const safeName = clean(name).replace(/[%_]/g, "");
  if (!safeName) return [];
  const fallback = await service
    .from("ad_intelligence_creatives")
    .select(select)
    .eq("platform", "meta")
    .ilike("advertiser_name", `%${safeName}%`)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(MAX_ADS_PER_COMPETITOR);

  if (fallback.error) throw new Error(`Brand Vault ad query failed for ${name}: ${fallback.error.message}`);
  return (fallback.data ?? []) as RawAd[];
}

async function loadLanguages(creativeIds: string[], start: number): Promise<Map<string, string[]>> {
  const service = createGlobalServiceClient();
  const result = new Map<string, string[]>();
  if (!creativeIds.length) return result;

  const observations = await service
    .from("ad_intelligence_observations")
    .select("creative_id,language,observation_day")
    .gte("observation_day", new Date(start).toISOString().slice(0, 10))
    .in("creative_id", creativeIds)
    .not("language", "is", null)
    .limit(MAX_LANGUAGE_ROWS);

  if (!observations.error && observations.data?.length) {
    for (const row of observations.data as ObservationRow[]) {
      if (!creativeIds.includes(row.creative_id)) continue;
      const value = clean(row.language).toLowerCase();
      if (!value) continue;
      const list = result.get(row.creative_id) ?? [];
      if (!list.includes(value)) list.push(value);
      result.set(row.creative_id, list);
    }
    return result;
  }

  const languages = await service
    .from("ad_intelligence_languages")
    .select("creative_id,language_code,language_name")
    .in("creative_id", creativeIds)
    .limit(MAX_LANGUAGE_ROWS);
  if (languages.error) return result;
  for (const row of languages.data as Array<LanguageRow & { language_code?: string | null }>) {
    const value = clean(row.language ?? row.language_code).toLowerCase();
    if (!value) continue;
    const list = result.get(row.creative_id) ?? [];
    if (!list.includes(value)) list.push(value);
    result.set(row.creative_id, list);
  }
  return result;
}

function buildOffers(rows: RawAd[], breakEvenPrice: number | null): OfferItem[] {
  const counts = new Map<string, { count: number; price: number | null }>();
  for (const row of rows) {
    const label = clean(row.offer);
    if (!label) continue;
    const key = normalize(label);
    const current = counts.get(key) ?? { count: 0, price: null };
    current.count += 1;
    current.price = current.price ?? visibleOfferPrice(row);
    counts.set(key, current);
  }
  const total = rows.length;
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([, value]) => ({
      label: value.price != null ? `${value.count}× · ${formatCurrency(value.price)}` : `${value.count}× · offer text`,
      count: value.count,
      share: percent(value.count, total),
      visiblePrice: value.price,
      vsBreakEven: value.price != null && breakEvenPrice != null ? Math.round((value.price - breakEvenPrice) * 100) / 100 : null,
      relation: relationToBreakEven(value.price, breakEvenPrice),
      provenance: "Derived" as const,
    }));
}

function buildProducts(rows: RawAd[]): ProductPressure[] {
  const groups = new Map<string, RawAd[]>();
  for (const row of rows) {
    const product = clean(row.product_name) || "Unspecified product";
    const key = normalize(product);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const total = rows.length;
  return [...groups.entries()]
    .sort((a, b) => {
      const score = (group: RawAd[]) => {
        const active = group.filter((row) => row.is_currently_active !== false).length;
        const persistent = group.filter((row) => runningDays(row.first_seen_at, row.last_seen_at) >= 60).length;
        const longest = Math.min(90, Math.max(...group.map((row) => runningDays(row.first_seen_at, row.last_seen_at)), 0));
        return active * 3 + persistent * 2 + longest + group.length;
      };
      return score(b[1]) - score(a[1]) || b[1].length - a[1].length || a[0].localeCompare(b[0]);
    })
    .slice(0, 5)
    .map(([, group]) => {
      const activeAds = group.filter((row) => row.is_currently_active !== false).length;
      const persistent60 = group.filter((row) => runningDays(row.first_seen_at, row.last_seen_at) >= 60).length;
      return {
        product: clean(group[0].product_name) || "Unspecified product",
        ads: group.length,
        activeAds,
        persistent60,
        share: percent(group.length, total),
        provenance: "Derived",
        supportingAds: group
          .slice()
          .sort((a, b) => runningDays(b.first_seen_at, b.last_seen_at) - runningDays(a.first_seen_at, a.last_seen_at))
          .slice(0, MAX_SUPPORTING_ADS)
          .map((row) => mapSupportingAd(row)),
      };
    });
}

function buildChanges(recent: RawAd[], previous: RawAd[], rows: RawAd[], periodStart: number): { items: CompetitorAnalytics["changes"]; counts: [number, number, number, number] } {
  const previousOffers = new Set(previous.map((row) => normalize(row.offer)).filter(Boolean));
  const previousHooks = new Set(previous.map((row) => normalize(firstSentence(row.primary_text ?? row.headline))).filter(Boolean));

  const newTests = recent.length;
  const newOfferRows = recent.filter((row) => {
    const offer = normalize(row.offer);
    return offer && !previousOffers.has(offer);
  });
  const newMessageRows = recent.filter((row) => {
    const hook = normalize(firstSentence(row.primary_text ?? row.headline));
    return hook && !previousHooks.has(hook);
  });
  const retiredRows = rows.filter((row) => row.is_currently_active === false && (safeDate(row.last_seen_at) ?? 0) >= periodStart);

  const newOfferLabels = newOfferRows.map((row) => clean(row.offer)).filter(Boolean);
  const newMessageLabels = newMessageRows.map((row) => firstSentence(row.primary_text ?? row.headline)).filter(Boolean) as string[];

  const items: CompetitorAnalytics["changes"] = [];
  if (newTests) {
    items.push({ type: "new_test", label: "New ads entered the index", detail: `${newTests} creatives were first observed in this period.`, count: newTests, provenance: "Source", supportingAds: newTests ? recent.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)) : [] });
  }
  if (newOfferRows.length) {
    const unique = [...new Set(newOfferLabels)].slice(0, 2).join(" · ");
    items.push({ type: "new_offer", label: unique || "New offer message", detail: `${newOfferRows.length} recent creatives introduce an offer not seen in the previous comparison window.`, count: newOfferRows.length, provenance: "Derived", supportingAds: newOfferRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row, "Derived")) });
  }
  if (newMessageRows.length) {
    const unique = [...new Set(newMessageLabels)].slice(0, 2).join(" · ");
    items.push({ type: "new_message", label: unique || "New messaging", detail: `${newMessageRows.length} recent creatives introduce a hook not seen in the previous comparison window.`, count: newMessageRows.length, provenance: "Derived", supportingAds: newMessageRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row, "Derived")) });
  }
  if (retiredRows.length) {
    items.push({ type: "retired", label: "Ads stopped appearing", detail: `${retiredRows.length} creatives have a last-seen date inside this period and are currently inactive.`, count: retiredRows.length, provenance: "Source", supportingAds: retiredRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)) });
  }

  return { items: items.slice(0, 6), counts: [newTests, newOfferRows.length, newMessageRows.length, retiredRows.length] };
}

async function analyzeCompetitor(input: {
  competitor: BrandVaultCompetitor;
  period: BrandVaultPeriod;
  breakEvenPrice: number | null;
  userId: string;
}): Promise<CompetitorAnalytics> {
  const now = Date.now();
  const days = periodDays(input.period);
  const recentStart = now - days * DAY_MS;
  const previousStart = now - days * 2 * DAY_MS;
  const rows = await loadAds(input.competitor.advertiserPageId ?? "", input.competitor.name, input.competitor.country);
  let collectionState: "indexed" | "collecting" | "empty" = rows.length ? "indexed" : "empty";
  if (!rows.length) {
    try {
      const collection = await startAdSpyCollection({
        userId: input.userId,
        query: input.competitor.name,
        country: input.competitor.country,
        platform: "meta",
        mode: "advertiser",
        pageId: input.competitor.advertiserPageId,
        minIntervalMs: 30 * 60_000,
        reason: "user",
        depth: "quick",
      });
      collectionState = collection.dispatched || collection.outcome === "already_running" ? "collecting" : "empty";
    } catch (error) {
      console.warn("[BrandVault] collection kickoff failed", input.competitor.name, error);
    }
  }
  const filteredRows = rows.filter((row) => {
    const last = safeDate(row.last_seen_at) ?? safeDate(row.first_seen_at);
    return last == null || last >= previousStart;
  });
  const recent = filteredRows.filter((row) => (safeDate(row.first_seen_at) ?? Number.POSITIVE_INFINITY) >= recentStart);
  const previous = filteredRows.filter((row) => {
    const first = safeDate(row.first_seen_at);
    return first != null && first >= previousStart && first < recentStart;
  });
  const relevantForWinners = rows.slice();
  const languageMap = await loadLanguages(rows.map((row) => row.id), previousStart);
  const languageValues: string[] = [];
  for (const values of languageMap.values()) languageValues.push(...values);

  const changes = buildChanges(recent, previous, filteredRows, recentStart);
  const [newTests, newOffers, newMessages, retiredAds] = changes.counts;
  const activeAds = rows.filter((row) => row.is_currently_active !== false).length;
  const persistent30 = rows.filter((row) => runningDays(row.first_seen_at, row.last_seen_at) >= 30).length;
  const persistent60 = rows.filter((row) => runningDays(row.first_seen_at, row.last_seen_at) >= 60).length;
  const persistent90 = rows.filter((row) => runningDays(row.first_seen_at, row.last_seen_at) >= 90).length;

  const hooks = rows.map((row) => firstSentence(row.primary_text ?? row.headline)).filter(Boolean) as string[];
  const creators = rows.map((row) => clean(row.creator_name)).filter(Boolean);
  const languages = languageValues.length ? languageValues : LANGUAGE_FALLBACK.filter((language) => rows.some((row) => normalize(`${row.primary_text ?? ""} ${row.headline ?? ""}`).includes(language)));
  const products = buildProducts(rows);
  const offers = buildOffers(rows, input.breakEvenPrice);
  const winnersBoard = relevantForWinners
    .filter((row) => row.is_currently_active !== false && runningDays(row.first_seen_at, row.last_seen_at) >= 30)
    .sort((a, b) => runningDays(b.first_seen_at, b.last_seen_at) - runningDays(a.first_seen_at, a.last_seen_at))
    .slice(0, 10)
    .map((row) => mapSupportingAd(row, runningDays(row.first_seen_at, row.last_seen_at) >= 60 ? "Heuristic" : "Derived"));
  const stoppedWithin7Days = relevantForWinners
    .filter((row) => row.is_currently_active === false && (safeDate(row.last_seen_at) ?? 0) >= now - 7 * DAY_MS)
    .sort((a, b) => (safeDate(b.last_seen_at) ?? 0) - (safeDate(a.last_seen_at) ?? 0))
    .slice(0, 10)
    .map((row) => mapSupportingAd(row));

  const angleCoverage: Record<string, number> = {};
  for (const angle of ANGLES) angleCoverage[angle] = 0;
  for (const row of rows) {
    const angle = messageAngle(`${row.primary_text ?? ""} ${row.headline ?? ""} ${row.offer ?? ""}`);
    if (angle) angleCoverage[angle] = (angleCoverage[angle] ?? 0) + 1;
  }

  const latestSeen = rows.map((row) => safeDate(row.last_seen_at)).filter((x): x is number => x != null).sort((a, b) => b - a)[0] ?? null;
  const dataCoverage: CompetitorAnalytics["dataCoverage"] = rows.length >= 20 ? "strong" : rows.length > 0 ? "thin" : "none";

  return {
    slot: input.competitor.slot,
    name: input.competitor.name,
    pageId: input.competitor.advertiserPageId,
    country: input.competitor.country,
    periodDays: days,
    lastObservedAt: latestSeen ? new Date(latestSeen).toISOString() : null,
    totalAds: rows.length,
    activeAds,
    newTests,
    newOffers,
    newMessages,
    retiredAds,
    persistent30,
    persistent60,
    persistent90,
    topHooks: rankedHooks(recent, recent.length),
    topCreators: rankedCreators(recent, recent.length),
    topLanguages: ranked(languages, languages.length, "Derived"),
    topProducts: products,
    topOffers: offers,
    changes: changes.items,
    winnersBoard,
    stoppedWithin7Days,
    angleCoverage,
    usedCreatorNames: [...new Set(creators.map(normalize).filter(Boolean))].slice(0, 200),
    usedLanguageCodes: [...new Set(languages.map(normalize).filter(Boolean))],
    dataCoverage,
    collectionState,
  };
}

function buildGaps(competitors: CompetitorAnalytics[]): BrandVaultAnalytics["gaps"] {
  const active = competitors.filter((item) => item.dataCoverage !== "none");
  const angles = ANGLES.filter((angle) => active.every((item) => (item.angleCoverage[angle] ?? 0) === 0)).map((angle) => angle);
  const creatorUniverse = [...new Set(active.flatMap((item) => item.topCreators.map((row) => normalize(row.label))))].filter(Boolean);
  const creators = active.length >= 2
    ? creatorUniverse.filter((creator) => active.every((item) => !item.usedCreatorNames.includes(creator))).slice(0, 5)
    : [];
  const languageSet = new Set(active.flatMap((item) => item.usedLanguageCodes));
  const languages = LANGUAGE_FALLBACK.filter((language) => !languageSet.has(language)).slice(0, 5);
  return { angles, creators, languages };
}

function buildCounterBrief(
  brandName: string,
  analytics: BrandVaultAnalytics["competitors"],
  gaps: BrandVaultAnalytics["gaps"],
  breakEvenPrice: number | null,
): string {
  const names = analytics.map((item) => item.name).join(", ") || "your selected competitors";
  const topHooks = analytics.flatMap((item) => item.topHooks.slice(0, 2).map((hook) => hook.label)).slice(0, 4);
  const persistent = analytics.reduce((sum, item) => sum + item.persistent60, 0);
  const offersBelow = analytics.flatMap((item) => item.topOffers.filter((offer) => offer.relation === "below")).slice(0, 3);
  const lines = [
    `Counter-brief for ${brandName || "your brand"}`,
    `Observed set: ${names}.`,
    topHooks.length ? `Hooks worth pressure-testing against the market: ${topHooks.join(" · ")}.` : "No dominant hook cluster was strong enough to summarize.",
    `Persistent creative signal: ${persistent} ads have a 60+ day observation window across the selected set. This is a heuristic persistence signal, not proof of performance.`,
    gaps.angles.length ? `Observed whitespace: ${gaps.angles.join(", ")} were not observed in the selected competitor copy during the indexed period.` : "No empty angle bucket was observed across the selected taxonomy.",
    offersBelow.length && breakEvenPrice != null
      ? `Economics watch: ${offersBelow.length} recurring visible offers were below the stored break-even price; treat those as market pressure, not evidence they are profitable.`
      : breakEvenPrice != null
        ? `Economics anchor: your stored break-even price is ${formatCurrency(breakEvenPrice)}; visible competitor offers should be checked against that floor before matching.`
        : "Economics anchor is not set yet. Complete your cost inputs before matching competitor offers.",
    "Next test: choose one market hook, one creator/format, and one offer you can support at your own contribution floor; then measure first-party performance in Zooptrack.",
  ];
  return lines.join("\n\n").replace(/"\.$/, ".");
}

export async function getBrandVaultAnalytics(input: {
  userId: string;
  competitors: BrandVaultCompetitor[];
  period: BrandVaultPeriod;
  economics: BrandEconomics;
  brandName: string;
}): Promise<BrandVaultAnalytics> {
  const { breakEvenPrice, targetMarginPrice, contributionBeforeAds } = calculateBreakEven(input.economics);
  const competitors = (await Promise.all(input.competitors.map((competitor) => analyzeCompetitor({ competitor, period: input.period, breakEvenPrice, userId: input.userId })))).filter(Boolean);
  const gaps = buildGaps(competitors);
  const compareRows = competitors.map((item) => ({
    slot: item.slot,
    name: item.name,
    totalAds: item.totalAds,
    activeAds: item.activeAds,
    newTests: item.newTests,
    persistent60: item.persistent60,
    topProduct: item.topProducts[0]?.product ?? null,
    topHook: item.topHooks[0]?.label ?? null,
    topCreator: item.topCreators[0]?.label ?? null,
    topLanguage: item.topLanguages[0]?.label ?? null,
  }));

  const mondayChanges = competitors.flatMap((item) => item.changes.map((change) => ({ ...change, label: `${item.name}: ${change.label}` })));
  const lines = competitors.length
    ? competitors.slice(0, 3).map((item) => `${item.name}: ${item.newTests} new tests, ${item.newOffers} new offer signals, ${item.newMessages} new message signals, ${item.persistent60} 60+ day creatives.`)
    : ["Add at least one exact competitor match to generate the digest."];
  const mondayDigest = {
    headline: competitors.length ? "What changed in the latest indexed period" : "Set up your competitors to start the digest",
    lines,
    changes: mondayChanges.slice(0, 10),
  };

  const analytics: BrandVaultAnalytics = {
    period: input.period,
    generatedAt: new Date().toISOString(),
    breakEvenPrice,
    targetMarginPrice,
    contributionBeforeAds,
    competitors,
    compareRows,
    gaps,
    mondayDigest,
    counterBrief: buildCounterBrief(input.brandName, competitors, gaps, breakEvenPrice),
  };
  return analytics;
}

export { normalizeEconomics };
