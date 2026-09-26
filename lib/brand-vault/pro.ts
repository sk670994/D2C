import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";
import {
  DAY_MS,
  OFFER_LABEL,
  calculateBreakEven,
  classifyOffer,
  clean,
  discountDepth,
  firstSentence,
  hookKey,
  languageName,
  normalize,
  normalizeEconomics,
  parseRupees,
  pickPageForName,
  productKey,
  runningDays,
  safeDate,
  type OfferType,
} from "./signals";
import type {
  BrandEconomics,
  BrandVaultAnalytics,
  BrandVaultCompetitor,
  BrandVaultPeriod,
  ChangeItem,
  CompetitorAnalytics,
  OfferItem,
  ProductPressure,
  Provenance,
  RankedItem,
  SupportingAd,
} from "./types";

/** PostgREST returns at most 1000 rows per request; we page up to this many. */
const MAX_ADS_PER_COMPETITOR = 3_000;
const PAGE_SIZE = 1_000;
/** Keep `.in()` URLs well under proxy limits (36-char UUIDs). */
const ID_CHUNK = 150;
const MAX_SUPPORTING_ADS = 6;
const TOP_N = 5;

const ANGLES: Array<{ label: string; re: RegExp }> = [
  { label: "discount-led", re: /\b(discount|sale|deal|coupon|save|off)\b|%/i },
  { label: "problem-solution", re: /\b(problem|solve|fix|struggle|pain|tired of|say goodbye)\b/i },
  { label: "social-proof", re: /\b(reviews?|customers?|trusted|loved by|rated|testimonial|bestseller|best seller)\b/i },
  { label: "expert-claim", re: /\b(dermat\w*|doctor|clinically|tested|expert|formulated)\b/i },
  { label: "product-demo", re: /\b(watch|demo|how to|before|after|results?)\b/i },
  { label: "urgency-led", re: /\b(today|now|limited|hurry|ends|last chance|only)\b/i },
];

/** Indian-language whitespace we can suggest; only used when language data exists. */
const GAP_LANGUAGES = ["hinglish", "hi", "ta", "te", "mr", "bn", "gu", "kn", "ml"];

const SELECT =
  "id,advertiser_name,advertiser_id,creator_name,creative_type,primary_text,headline,offer,call_to_action,landing_page_url,first_seen_at,last_seen_at,is_currently_active,product_name,product_price,source_url,thumbnail_url";

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
  landing_page_url: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
  product_name: string | null;
  product_price: number | string | null;
  source_url: string | null;
  thumbnail_url: string | null;
};

const isActive = (row: RawAd) => row.is_currently_active !== false;
const days = (row: RawAd) => runningDays(row.first_seen_at, row.last_seen_at);
const hookOf = (row: RawAd) => firstSentence(row.primary_text ?? row.headline);

function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "not set";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function visiblePrice(row: RawAd): number | null {
  const direct = row.product_price != null ? Number(row.product_price) : NaN;
  if (Number.isFinite(direct) && direct > 0) return direct;
  return parseRupees(row.offer) ?? parseRupees(row.headline);
}

function relationToBreakEven(price: number | null, breakEven: number | null): OfferItem["relation"] {
  if (price == null || breakEven == null) return "unknown";
  const delta = price - breakEven;
  if (Math.abs(delta) <= Math.max(10, breakEven * 0.03)) return "near";
  return delta < 0 ? "below" : "above";
}

function mapSupportingAd(row: RawAd, provenance: Provenance = "Source"): SupportingAd {
  const d = days(row);
  return {
    id: row.id,
    productName: clean(row.product_name) || null,
    hook: hookOf(row),
    creatorName: clean(row.creator_name) || null,
    offer: clean(row.offer) || null,
    price: visiblePrice(row),
    creativeType: clean(row.creative_type) || null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    runningDays: d,
    active: row.is_currently_active,
    sourceUrl: clean(row.source_url) || null,
    thumbnailUrl: clean(row.thumbnail_url) || null,
    provenance,
    heuristicLabel: isActive(row) && d >= 60 ? "Likely proven · heuristic" : null,
  };
}

const byLongest = (a: RawAd, b: RawAd) => days(b) - days(a);

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

async function resolveIndexedPageId(name: string, country: string): Promise<string | null> {
  const { data, error } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
    p_query: name,
    p_platform: "meta",
    p_country: country,
    p_limit: 12,
  });
  if (error || !Array.isArray(data)) return null;
  return pickPageForName(name, data as Array<{ page_id?: string | null; label?: string | null }>);
}

async function fetchPaged(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<RawAd[]> {
  const rows: RawAd[] = [];
  for (let from = 0; from < MAX_ADS_PER_COMPETITOR; from += PAGE_SIZE) {
    const { data, error } = await build(from, Math.min(from + PAGE_SIZE, MAX_ADS_PER_COMPETITOR) - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as RawAd[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Page ID is authoritative. Without one, only an exact (case-insensitive)
 * advertiser-name match is used, never a substring: "Plum" must not pull in
 * "Plum Goodness x creator" or unrelated brands.
 */
async function loadAds(competitor: BrandVaultCompetitor): Promise<{ rows: RawAd[]; identity: CompetitorAnalytics["identity"]; pageId: string | null }> {
  const service = createGlobalServiceClient();
  let pageId = competitor.advertiserPageId && /^\d+$/.test(competitor.advertiserPageId) ? competitor.advertiserPageId : null;
  if (!pageId) pageId = await resolveIndexedPageId(competitor.name, competitor.country);

  if (pageId) {
    const rows = await fetchPaged((from, to) =>
      service
        .from("ad_intelligence_creatives")
        .select(SELECT)
        .eq("platform", "meta")
        .eq("advertiser_id", pageId)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (rows.length || competitor.advertiserPageId) return { rows, identity: "page_id", pageId };
  }

  const exactName = clean(competitor.name).replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!exactName) return { rows: [], identity: "none", pageId };
  const rows = await fetchPaged((from, to) =>
    service
      .from("ad_intelligence_creatives")
      .select(SELECT)
      .eq("platform", "meta")
      .ilike("advertiser_name", exactName)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return { rows, identity: rows.length ? "name" : "none", pageId };
}

async function loadLanguages(creativeIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!creativeIds.length) return result;
  const service = createGlobalServiceClient();
  for (let i = 0; i < creativeIds.length; i += ID_CHUNK) {
    const chunk = creativeIds.slice(i, i + ID_CHUNK);
    const { data, error } = await service
      .from("ad_intelligence_languages")
      .select("creative_id,language_code")
      .in("creative_id", chunk)
      .limit(PAGE_SIZE);
    if (error) {
      console.warn("[BrandVault] language lookup failed", error.message);
      return result;
    }
    for (const row of (data ?? []) as Array<{ creative_id: string; language_code: string | null }>) {
      const code = normalize(row.language_code);
      if (!code) continue;
      const list = result.get(row.creative_id) ?? [];
      if (!list.includes(code)) list.push(code);
      result.set(row.creative_id, list);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Modules                                                             */
/* ------------------------------------------------------------------ */

/** Top hooks: reused opening lines that stay live. Rank = Σ active × days (≤90) + reuse across creators. */
function buildHooks(live: RawAd[]): RankedItem[] {
  const groups = new Map<string, { label: string; ads: RawAd[]; creators: Set<string> }>();
  for (const row of live) {
    const hook = hookOf(row);
    if (!hook) continue;
    const key = hookKey(hook);
    if (key.length < 4) continue;
    const g = groups.get(key) ?? { label: hook, ads: [], creators: new Set<string>() };
    g.ads.push(row);
    const creator = normalize(row.creator_name);
    if (creator) g.creators.add(creator);
    groups.set(key, g);
  }
  const score = (g: { ads: RawAd[]; creators: Set<string> }) =>
    g.ads.reduce((sum, row) => sum + (isActive(row) ? Math.min(90, days(row)) : 1), 0) + g.creators.size * 10;
  return [...groups.values()]
    .sort((a, b) => score(b) - score(a) || b.ads.length - a.ads.length || a.label.localeCompare(b.label))
    .slice(0, TOP_N)
    .map((g) => ({
      label: g.label,
      count: g.ads.length,
      share: percent(g.ads.length, live.length),
      activeCount: g.ads.filter(isActive).length,
      longestDays: Math.max(0, ...g.ads.map(days)),
      provenance: "Derived" as const,
      supportingAds: g.ads.slice().sort(byLongest).slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row, "Derived")),
    }));
}

/** Top creators from Meta's partnership tag. "New" = first seen inside the period. */
function buildCreators(live: RawAd[], recentStart: number): { items: RankedItem[]; total: number; newCount: number } {
  const groups = new Map<string, { label: string; ads: RawAd[]; firstSeen: number }>();
  for (const row of live) {
    const label = clean(row.creator_name);
    if (!label) continue;
    const key = normalize(label);
    const g = groups.get(key) ?? { label, ads: [], firstSeen: Number.POSITIVE_INFINITY };
    g.ads.push(row);
    g.firstSeen = Math.min(g.firstSeen, safeDate(row.first_seen_at) ?? Number.POSITIVE_INFINITY);
    groups.set(key, g);
  }
  const all = [...groups.values()];
  const items = all
    .map((g) => ({ g, active: g.ads.filter(isActive).length, longest: Math.max(0, ...g.ads.map(days)) }))
    .sort((a, b) => b.active - a.active || b.longest - a.longest || a.g.label.localeCompare(b.g.label))
    .slice(0, TOP_N)
    .map(({ g, active, longest }) => ({
      label: g.label,
      count: g.ads.length,
      share: percent(g.ads.length, live.length),
      activeCount: active,
      longestDays: longest,
      isNew: g.firstSeen >= recentStart,
      provenance: "Source" as const,
      supportingAds: g.ads.slice().sort(byLongest).slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)),
    }));
  return { items, total: all.length, newCount: all.filter((g) => g.firstSeen >= recentStart).length };
}

function buildLanguages(live: RawAd[], languageMap: Map<string, string[]>): RankedItem[] {
  const counts = new Map<string, number>();
  let tagged = 0;
  for (const row of live) {
    const codes = languageMap.get(row.id);
    if (!codes?.length) continue;
    tagged += 1;
    for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N)
    .map(([code, count]) => ({ label: languageName(code), count, share: percent(count, tagged), provenance: "Heuristic" as const }));
}

/** "Most ad pressure", not sales. Grouped by landing product/collection URL. */
function buildProducts(live: RawAd[], recentStart: number): ProductPressure[] {
  const groups = new Map<string, RawAd[]>();
  for (const row of live) {
    const key = productKey(row.landing_page_url, row.product_name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const withProduct = [...groups.values()].reduce((sum, g) => sum + g.length, 0);
  return [...groups.entries()]
    .map(([product, group]) => {
      const activeAds = group.filter(isActive).length;
      const longestDays = Math.max(0, ...group.map(days));
      const persistent60 = group.filter((row) => isActive(row) && days(row) >= 60).length;
      const newAds = group.filter((row) => (safeDate(row.first_seen_at) ?? 0) >= recentStart).length;
      const variants = new Set(group.map((row) => hookKey(hookOf(row) ?? row.id))).size;
      const status: ProductPressure["status"] =
        persistent60 > 0 ? "Likely proven" : newAds >= Math.max(2, group.length / 2) ? "New push" : "Steady";
      return { product, group, activeAds, longestDays, persistent60, variants, status, score: activeAds * 3 + variants + Math.min(90, longestDays) / 10 };
    })
    .sort((a, b) => b.score - a.score || b.group.length - a.group.length || a.product.localeCompare(b.product))
    .slice(0, TOP_N)
    .map(({ product, group, activeAds, longestDays, persistent60, variants, status }) => ({
      product,
      ads: group.length,
      activeAds,
      persistent60,
      variants,
      longestDays,
      status,
      share: percent(group.length, withProduct),
      provenance: "Derived" as const,
      supportingAds: group.slice().sort(byLongest).slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)),
    }));
}

function offerText(row: RawAd): string {
  return [row.offer, row.headline, firstSentence(row.primary_text)].filter(Boolean).join(" · ");
}

function buildOffers(live: RawAd[], breakEvenPrice: number | null): OfferItem[] {
  const groups = new Map<OfferType, RawAd[]>();
  for (const row of live) {
    for (const type of classifyOffer(offerText(row))) {
      const list = groups.get(type) ?? [];
      list.push(row);
      groups.set(type, list);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].filter(isActive).length - a[1].filter(isActive).length || b[1].length - a[1].length)
    .slice(0, TOP_N)
    .map(([type, group]) => {
      const prices = group.map(visiblePrice).filter((p): p is number => p != null);
      const price = prices.length ? Math.min(...prices) : null;
      const depths = group.map((row) => discountDepth(offerText(row))).filter((d): d is number => d != null);
      const example = group.map((row) => clean(row.offer) || firstSentence(row.headline)).find(Boolean) ?? null;
      return {
        label: OFFER_LABEL[type],
        type,
        depthPercent: depths.length ? Math.max(...depths) : null,
        example,
        count: group.length,
        share: percent(group.length, live.length),
        visiblePrice: price,
        vsBreakEven: price != null && breakEvenPrice != null ? Math.round((price - breakEvenPrice) * 100) / 100 : null,
        relation: relationToBreakEven(price, breakEvenPrice),
        provenance: "Derived" as const,
      };
    });
}

function buildChanges(recent: RawAd[], previous: RawAd[], all: RawAd[], recentStart: number) {
  const prevTypes = new Set(previous.flatMap((row) => classifyOffer(offerText(row))));
  const prevHooks = new Set(previous.map((row) => hookKey(hookOf(row) ?? "")).filter(Boolean));

  const newOfferRows = recent.filter((row) => classifyOffer(offerText(row)).some((type) => !prevTypes.has(type)));
  const newMessageRows = recent.filter((row) => {
    const key = hookKey(hookOf(row) ?? "");
    return key.length >= 4 && !prevHooks.has(key);
  });
  const retiredRows = all
    .filter((row) => row.is_currently_active === false && (safeDate(row.last_seen_at) ?? 0) >= recentStart)
    .sort((a, b) => (safeDate(b.last_seen_at) ?? 0) - (safeDate(a.last_seen_at) ?? 0));

  const items: ChangeItem[] = [];
  if (recent.length) {
    const formats = [...new Set(recent.map((row) => clean(row.creative_type)).filter((f) => f && f !== "unknown"))].slice(0, 2).join(" + ");
    items.push({
      type: "new_test",
      label: `Launched ${recent.length} new ad${recent.length === 1 ? "" : "s"}${formats ? ` (${formats})` : ""}`,
      detail: `${recent.length} creatives were first observed in this period.`,
      count: recent.length,
      provenance: "Source",
      supportingAds: recent.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)),
    });
  }
  if (newOfferRows.length) {
    const types = [...new Set(newOfferRows.flatMap((row) => classifyOffer(offerText(row)).filter((t) => !prevTypes.has(t))))];
    items.push({
      type: "new_offer",
      label: `New offer: ${types.map((t) => OFFER_LABEL[t]).join(", ")}`,
      detail: `${newOfferRows.length} new ads use an offer type not seen in the previous period.`,
      count: newOfferRows.length,
      provenance: "Derived",
      supportingAds: newOfferRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row, "Derived")),
    });
  }
  if (newMessageRows.length) {
    const sample = hookOf(newMessageRows[0]);
    items.push({
      type: "new_message",
      label: sample ? `New message: “${sample}”` : "New messaging",
      detail: `${newMessageRows.length} new ads open with a line not used in the previous period.`,
      count: newMessageRows.length,
      provenance: "Derived",
      supportingAds: newMessageRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row, "Derived")),
    });
  }
  if (retiredRows.length) {
    const quick = retiredRows.filter((row) => days(row) <= 7).length;
    items.push({
      type: "retired",
      label: `Stopped ${retiredRows.length} ad${retiredRows.length === 1 ? "" : "s"}${quick ? ` (${quick} live under 7 days)` : ""}`,
      detail: `${retiredRows.length} creatives were last seen in this period and are no longer active.`,
      count: retiredRows.length,
      provenance: "Source",
      supportingAds: retiredRows.slice(0, MAX_SUPPORTING_ADS).map((row) => mapSupportingAd(row)),
    });
  }
  return { items, newOffers: newOfferRows.length, newMessages: newMessageRows.length, retired: retiredRows.length };
}

function periodDays(period: BrandVaultPeriod): number {
  return period === "week" ? 7 : period === "month" ? 30 : 90;
}

async function analyzeCompetitor(input: {
  competitor: BrandVaultCompetitor;
  period: BrandVaultPeriod;
  breakEvenPrice: number | null;
  userId: string;
}): Promise<CompetitorAnalytics> {
  const now = Date.now();
  const span = periodDays(input.period);
  const recentStart = now - span * DAY_MS;
  const previousStart = now - span * 2 * DAY_MS;

  const { rows, identity, pageId } = await loadAds(input.competitor);

  let collectionState: CompetitorAnalytics["collectionState"] = rows.length ? "indexed" : "empty";
  if (!rows.length) {
    // Nothing indexed yet: queue a background collection (rate-limited per key).
    try {
      const collection = await startAdSpyCollection({
        userId: input.userId,
        query: input.competitor.name,
        country: input.competitor.country,
        platform: "meta",
        mode: "advertiser",
        pageId,
        minIntervalMs: 30 * 60_000,
        reason: "user",
        depth: "quick",
      });
      collectionState = collection.dispatched || collection.outcome === "already_running" || collection.outcome === "running_for_another_request" ? "collecting" : "empty";
    } catch (error) {
      console.warn("[BrandVault] collection kickoff failed", input.competitor.name, error);
    }
  }

  // Ads observed live during the period (the basis for "top" modules).
  const live = rows.filter((row) => (safeDate(row.last_seen_at) ?? safeDate(row.first_seen_at) ?? 0) >= recentStart);
  const recent = rows.filter((row) => (safeDate(row.first_seen_at) ?? 0) >= recentStart);
  const previous = rows.filter((row) => {
    const first = safeDate(row.first_seen_at);
    return first != null && first >= previousStart && first < recentStart;
  });

  const languageMap = await loadLanguages(live.map((row) => row.id));
  const changes = buildChanges(recent, previous, rows, recentStart);
  const creators = buildCreators(live, recentStart);
  const topLanguages = buildLanguages(live, languageMap);

  const angleCoverage: Record<string, number> = {};
  for (const angle of ANGLES) angleCoverage[angle.label] = 0;
  for (const row of live) {
    const text = `${row.primary_text ?? ""} ${row.headline ?? ""} ${row.offer ?? ""}`;
    for (const angle of ANGLES) if (angle.re.test(text)) angleCoverage[angle.label] += 1;
  }

  const latestSeen = rows.reduce<number | null>((max, row) => {
    const t = safeDate(row.last_seen_at);
    return t != null && (max == null || t > max) ? t : max;
  }, null);

  return {
    slot: input.competitor.slot,
    name: input.competitor.name,
    pageId,
    country: input.competitor.country,
    periodDays: span,
    lastObservedAt: latestSeen ? new Date(latestSeen).toISOString() : null,
    totalAds: rows.length,
    activeAds: rows.filter(isActive).length,
    newTests: recent.length,
    newOffers: changes.newOffers,
    newMessages: changes.newMessages,
    retiredAds: changes.retired,
    creatorsCount: creators.total,
    newCreators: creators.newCount,
    identity,
    persistent30: rows.filter((row) => isActive(row) && days(row) >= 30).length,
    persistent60: rows.filter((row) => isActive(row) && days(row) >= 60).length,
    persistent90: rows.filter((row) => isActive(row) && days(row) >= 90).length,
    topHooks: buildHooks(live),
    topCreators: creators.items,
    topLanguages,
    topProducts: buildProducts(live, recentStart),
    topOffers: buildOffers(live, input.breakEvenPrice),
    changes: changes.items,
    winnersBoard: rows
      .filter((row) => isActive(row) && days(row) >= 30)
      .sort(byLongest)
      .slice(0, 10)
      .map((row) => mapSupportingAd(row, days(row) >= 60 ? "Heuristic" : "Derived")),
    // Killed fast: stopped inside the period after at most 7 days live.
    stoppedWithin7Days: rows
      .filter((row) => row.is_currently_active === false && days(row) <= 7 && (safeDate(row.last_seen_at) ?? 0) >= recentStart)
      .sort((a, b) => (safeDate(b.last_seen_at) ?? 0) - (safeDate(a.last_seen_at) ?? 0))
      .slice(0, 10)
      .map((row) => mapSupportingAd(row)),
    angleCoverage,
    usedCreatorNames: [...new Set(live.map((row) => normalize(row.creator_name)).filter(Boolean))].slice(0, 200),
    usedLanguageCodes: [...new Set([...languageMap.values()].flat())],
    dataCoverage: rows.length >= 20 ? "strong" : rows.length > 0 ? "thin" : "none",
    collectionState,
  };
}

function buildGaps(competitors: CompetitorAnalytics[]): BrandVaultAnalytics["gaps"] {
  const withData = competitors.filter((item) => item.dataCoverage !== "none");
  if (!withData.length) return { angles: [], creators: [], languages: [] };
  const angles = ANGLES.map((a) => a.label).filter((label) => withData.every((item) => (item.angleCoverage[label] ?? 0) === 0));
  const used = new Set(withData.flatMap((item) => item.usedLanguageCodes));
  // Only claim a language gap when we actually have language data for the set.
  const languages = used.size ? GAP_LANGUAGES.filter((code) => !used.has(code)).slice(0, 3).map(languageName) : [];
  return { angles, creators: [], languages };
}

function buildNextMove(competitors: CompetitorAnalytics[], gaps: BrandVaultAnalytics["gaps"], breakEvenPrice: number | null, heroProduct: string): string {
  const floor = breakEvenPrice != null ? `priced above your ${formatCurrency(breakEvenPrice)} break-even` : "priced above your break-even (add your costs in Edit vault)";
  const hero = heroProduct || "your best-selling SKU";
  const withData = competitors.filter((item) => item.dataCoverage !== "none");
  if (!withData.length) return "Waiting for indexed ads from your competitors. The first read appears once their ads are collected.";
  const leadAngle = Object.entries(
    withData.reduce<Record<string, number>>((acc, item) => {
      for (const [label, n] of Object.entries(item.angleCoverage)) acc[label] = (acc[label] ?? 0) + (n > 0 ? 1 : 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0];
  const parts: string[] = [];
  if (leadAngle && leadAngle[1] >= 2) parts.push(`${leadAngle[1]} of your rivals lead with ${leadAngle[0].replace("-", " ")} copy`);
  if (gaps.languages.length) parts.push(`none of them run ${gaps.languages[0]} ads`);
  const observed = parts.length ? `${parts.join(" and ")}. ` : "";
  const action = gaps.languages.length
    ? `Brief 3 ${gaps.languages[0]} UGC ads on ${hero}, ${floor}.`
    : gaps.angles.length
      ? `Brief 3 ${gaps.angles[0].replace("-", " ")} ads on ${hero} (nobody in your set uses that angle), ${floor}.`
      : `Test one new hook on ${hero} against their longest-running ads, ${floor}.`;
  return observed.charAt(0).toUpperCase() + observed.slice(1) + action;
}

function buildCounterBrief(brandName: string, competitors: CompetitorAnalytics[], gaps: BrandVaultAnalytics["gaps"], breakEvenPrice: number | null, nextMove: string): string {
  const names = competitors.map((item) => item.name).join(", ") || "your selected competitors";
  const topHooks = competitors.flatMap((item) => item.topHooks.slice(0, 2).map((hook) => `“${hook.label}”`)).slice(0, 4);
  const persistent = competitors.reduce((sum, item) => sum + item.persistent60, 0);
  const below = competitors.flatMap((item) => item.topOffers.filter((offer) => offer.relation === "below").map((offer) => `${item.name}: ${offer.label}`)).slice(0, 3);
  return [
    `Counter-brief for ${brandName || "your brand"}`,
    `Observed set: ${names}.`,
    topHooks.length ? `Hooks they keep live: ${topHooks.join(" · ")}.` : "No hook is reused enough to call a pattern yet.",
    `${persistent} of their ads have stayed live 60+ days. That signals continued use, not proven performance.`,
    gaps.angles.length ? `Angles nobody in the set uses: ${gaps.angles.join(", ")}.` : "Every tracked angle is already used by at least one rival.",
    below.length && breakEvenPrice != null
      ? `Offers below your ${formatCurrency(breakEvenPrice)} break-even: ${below.join("; ")}. Do not match these.`
      : breakEvenPrice != null
        ? `Keep any offer above your ${formatCurrency(breakEvenPrice)} break-even.`
        : "Add your costs in Edit vault to check offers against your break-even.",
    `Next move: ${nextMove}`,
  ].join("\n\n");
}

export async function getBrandVaultAnalytics(input: {
  userId: string;
  competitors: BrandVaultCompetitor[];
  period: BrandVaultPeriod;
  economics: BrandEconomics;
  brandName: string;
  heroProduct?: string;
}): Promise<BrandVaultAnalytics> {
  const { breakEvenPrice, targetMarginPrice, contributionBeforeAds } = calculateBreakEven(input.economics);
  const settled = await Promise.allSettled(
    input.competitors.map((competitor) => analyzeCompetitor({ competitor, period: input.period, breakEvenPrice, userId: input.userId })),
  );
  const competitors = settled
    .map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      console.error("[BrandVault] competitor analysis failed", input.competitors[i]?.name, result.reason);
      return null;
    })
    .filter((item): item is CompetitorAnalytics => item !== null)
    .sort((a, b) => a.slot - b.slot);

  const gaps = buildGaps(competitors);
  const nextMove = buildNextMove(competitors, gaps, breakEvenPrice, input.heroProduct ?? "");

  const compareRows = competitors.map((item) => ({
    slot: item.slot,
    name: item.name,
    totalAds: item.totalAds,
    activeAds: item.activeAds,
    newTests: item.newTests,
    retiredAds: item.retiredAds,
    persistent60: item.persistent60,
    creatorsCount: item.creatorsCount,
    topProduct: item.topProducts[0]?.product ?? null,
    topHook: item.topHooks[0]?.label ?? null,
    topCreator: item.topCreators[0]?.label ?? null,
    topLanguage: item.topLanguages[0] ? `${item.topLanguages[0].label} ${item.topLanguages[0].share}%` : null,
    topOffer: item.topOffers[0] ? `${item.topOffers[0].label}${item.topOffers[0].depthPercent ? ` (${item.topOffers[0].depthPercent}%)` : ""}` : null,
  }));

  const periodWord = input.period === "week" ? "this week" : input.period === "month" ? "this month" : "in the last 3 months";
  const digestChanges = competitors.flatMap((item) => item.changes.slice(0, 1).map((change) => ({ ...change, label: `${item.name}: ${change.label}` })));
  const mondayDigest = {
    headline: competitors.length ? `What your rivals changed ${periodWord}` : "Add competitors to start your Monday digest",
    lines: competitors.map((item) =>
      item.dataCoverage === "none"
        ? `${item.name}: no indexed ads yet${item.collectionState === "collecting" ? " (collecting now)" : ""}.`
        : `${item.name}: +${item.newTests} new, −${item.retiredAds} stopped, ${item.activeAds} active ads; ${item.persistent60} live 60+ days.`,
    ),
    changes: digestChanges,
    nextMove,
  };

  return {
    period: input.period,
    generatedAt: new Date().toISOString(),
    breakEvenPrice,
    targetMarginPrice,
    contributionBeforeAds,
    competitors,
    compareRows,
    gaps,
    mondayDigest,
    counterBrief: buildCounterBrief(input.brandName, competitors, gaps, breakEvenPrice, nextMove),
  };
}

export { calculateBreakEven, normalizeEconomics };
