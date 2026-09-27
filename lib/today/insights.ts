/**
 * "Answers first" logic for the Today feed, brand overviews, the Monday
 * report and ad decoding. Pure functions only (no I/O); unit tested in
 * insights.test.ts. Every sentence is built from counted facts: no invented
 * numbers, and heuristics are labelled as such.
 */
import { classifyOffer, firstSentence, hookKey, OFFER_LABEL, productKey, runningDays, type OfferType } from "@/lib/brand-vault/signals";

export const DAY = 86_400_000;

export type TodayAdRow = {
  id: string;
  advertiser_name: string | null;
  creative_type: string | null;
  headline: string | null;
  primary_text: string | null;
  offer: string | null;
  call_to_action?: string | null;
  landing_page_url?: string | null;
  product_name?: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
  thumbnail_url?: string | null;
};

export type EvidenceAd = {
  id: string;
  hook: string | null;
  format: string;
  days: number;
  active: boolean;
  thumbnailUrl: string | null;
};

export type BrandSummary = {
  pageId: string;
  name: string;
  total: number;
  active: number;
  new7: number;
  new30: number;
  formats: { video: number; image: number; carousel: number; other: number };
  videoShare: number;
  /** Offer types in ads launched in the last 7 days (else all live ads). */
  offers: Array<{ type: OfferType; label: string; count: number }>;
  /** Most repeated hook among the last 7 days' launches. */
  leadHook: { text: string; count: number } | null;
  longestLive: EvidenceAd | null;
  newest: EvidenceAd[];
  /** Launches per day, oldest first, last 14 days. */
  launches14: number[];
  lastSeenAt: string | null;
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function ms(value: string | null | undefined): number | null {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : null;
}

export function hookOf(ad: Pick<TodayAdRow, "headline" | "primary_text">): string | null {
  const headline = clean(ad.headline);
  if (headline && headline.length >= 4) return headline.slice(0, 140);
  return firstSentence(ad.primary_text);
}

function formatOf(type: string | null): "video" | "image" | "carousel" | "other" {
  const t = clean(type).toLowerCase();
  return t === "video" || t === "image" || t === "carousel" ? t : "other";
}

function evidence(ad: TodayAdRow, now: number): EvidenceAd {
  return {
    id: ad.id,
    hook: hookOf(ad),
    format: formatOf(ad.creative_type),
    days: runningDays(ad.first_seen_at, ad.last_seen_at, now),
    active: Boolean(ad.is_currently_active),
    thumbnailUrl: ad.thumbnail_url ?? null,
  };
}

export function summarizeBrand(pageId: string, rows: TodayAdRow[], now = Date.now()): BrandSummary {
  const formats = { video: 0, image: 0, carousel: 0, other: 0 };
  const launches14 = new Array<number>(14).fill(0);
  const recent: TodayAdRow[] = [];
  let active = 0;
  let new7 = 0;
  let new30 = 0;
  let lastSeen = 0;
  const names = new Map<string, number>();

  for (const ad of rows) {
    formats[formatOf(ad.creative_type)] += 1;
    if (ad.is_currently_active) active += 1;
    const name = clean(ad.advertiser_name);
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
    const first = ms(ad.first_seen_at);
    const last = ms(ad.last_seen_at);
    if (last && last > lastSeen) lastSeen = last;
    if (first == null) continue;
    const age = now - first;
    if (age <= 7 * DAY) {
      new7 += 1;
      recent.push(ad);
    }
    if (age <= 30 * DAY) new30 += 1;
    const dayIndex = 13 - Math.floor(age / DAY);
    if (dayIndex >= 0 && dayIndex < 14) launches14[dayIndex] += 1;
  }

  const offerPool = recent.length ? recent : rows.filter((ad) => ad.is_currently_active);
  const offerCounts = new Map<OfferType, number>();
  for (const ad of offerPool) {
    for (const type of new Set(classifyOffer(`${clean(ad.offer)} ${clean(ad.headline)} ${clean(ad.primary_text)}`))) {
      offerCounts.set(type, (offerCounts.get(type) ?? 0) + 1);
    }
  }
  const offers = Array.from(offerCounts.entries())
    .map(([type, count]) => ({ type, label: OFFER_LABEL[type], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const hooks = new Map<string, { text: string; count: number }>();
  for (const ad of recent) {
    const text = hookOf(ad);
    if (!text) continue;
    const key = hookKey(text);
    if (!key) continue;
    const entry = hooks.get(key) ?? { text, count: 0 };
    entry.count += 1;
    hooks.set(key, entry);
  }
  const leadHook = Array.from(hooks.values()).sort((a, b) => b.count - a.count)[0] ?? null;

  const liveAds = rows.filter((ad) => ad.is_currently_active && ms(ad.first_seen_at) != null);
  const longest = liveAds
    .map((ad) => evidence(ad, now))
    .sort((a, b) => b.days - a.days)[0] ?? null;

  const newest = [...rows]
    .filter((ad) => ms(ad.first_seen_at) != null)
    .sort((a, b) => (ms(b.first_seen_at) ?? 0) - (ms(a.first_seen_at) ?? 0))
    .slice(0, 6)
    .map((ad) => evidence(ad, now));

  const name = Array.from(names.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Page ${pageId}`;
  const total = rows.length;

  return {
    pageId,
    name,
    total,
    active,
    new7,
    new30,
    formats,
    videoShare: total ? Math.round((formats.video / total) * 100) : 0,
    offers,
    leadHook,
    longestLive: longest,
    newest,
    launches14,
    lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
  };
}

/** A hook "leads" when it repeats across a real share of the week's launches. */
function leadingHook(s: BrandSummary): string | null {
  if (!s.leadHook) return null;
  return s.leadHook.count >= Math.max(3, Math.ceil(s.new7 * 0.3)) ? s.leadHook.text : null;
}

/** One sentence that answers "what is this brand doing right now?" */
export function brandVerdict(s: BrandSummary): string {
  if (s.total === 0) return "No ads collected yet. Refresh to read this brand from Meta.";
  const lead = leadingHook(s);
  const offer = s.offers[0];
  if (s.new7 >= 10) {
    return lead
      ? `Pushing hard: ${s.new7} new ads this week, most led by “${lead}”.`
      : `Pushing hard: ${s.new7} new ads this week${offer ? `, lead offer ${offer.label.toLowerCase()}` : ""}.`;
  }
  if (s.new7 > 0) {
    return `${s.new7} new ${s.new7 === 1 ? "ad" : "ads"} this week${offer ? `; lead offer ${offer.label.toLowerCase()}` : ""}. ${s.active} live in total.`;
  }
  if (s.active > 0) return `No new ads this week. ${s.active} ${s.active === 1 ? "ad is" : "ads are"} still live.`;
  return `No live ads right now. ${s.total} on record.`;
}

export type MoveKind = "big" | "staying" | "quiet" | "steady";

export type Move = {
  kind: MoveKind;
  label: string;
  pageId: string;
  brand: string;
  title: string;
  detail: string;
  action: string;
  score: number;
  evidence: EvidenceAd[];
};

const MOVE_LABEL: Record<MoveKind, string> = { big: "Big move", staying: "Staying power", quiet: "Quiet", steady: "Steady" };

export function movesFor(s: BrandSummary): Move[] {
  const moves: Move[] = [];
  const base = { pageId: s.pageId, brand: s.name };
  const lead = leadingHook(s);
  if (s.new7 >= 10) {
    moves.push({
      ...base,
      kind: "big",
      label: MOVE_LABEL.big,
      title: `${s.new7} new ads in 7 days${lead ? `, led by “${lead}”` : ""}.`,
      detail: `${s.new30} launched in 30 days. ${s.videoShare}% of their ads are video.${s.offers[0] ? ` Lead offer: ${s.offers[0].label.toLowerCase()}.` : ""}`,
      action: "A counter-offer lands best while their push is live. Brief it this week.",
      score: 100 + s.new7,
      evidence: s.newest.slice(0, 3),
    });
  } else if (s.new7 > 0) {
    moves.push({
      ...base,
      kind: "steady",
      label: MOVE_LABEL.steady,
      title: `${s.new7} new ${s.new7 === 1 ? "ad" : "ads"} this week.`,
      detail: `${s.active} live in total.${s.offers[0] ? ` Lead offer: ${s.offers[0].label.toLowerCase()}.` : ""}`,
      action: "Worth a look: new creative usually means a new test.",
      score: 20 + s.new7,
      evidence: s.newest.slice(0, 3),
    });
  } else if (s.total > 0) {
    moves.push({
      ...base,
      kind: "quiet",
      label: MOVE_LABEL.quiet,
      title: "No new ads in 7 days.",
      detail: `${s.total} ads on record, none launched this week.`,
      action: "A quiet rival is a window to test your hero offer against the same buyers.",
      score: 10,
      evidence: [],
    });
  }
  if (s.longestLive && s.longestLive.days >= 60 && s.longestLive.hook) {
    moves.push({
      ...base,
      kind: "staying",
      label: MOVE_LABEL.staying,
      title: `“${s.longestLive.hook}” has been live ${s.longestLive.days}+ days.`,
      detail: "Their longest-running live ad. Brands rarely keep paying for an ad this long unless it works (a heuristic, not a spend figure).",
      action: "Study the hook and test your own version of it.",
      score: 30 + Math.min(60, Math.floor(s.longestLive.days / 5)),
      evidence: [s.longestLive],
    });
  }
  return moves;
}

/** Top moves across rivals: highest score first, at most `perBrand` per brand. */
export function pickMoves(summaries: BrandSummary[], limit = 3, perBrand = 2): Move[] {
  const all = summaries.flatMap(movesFor).sort((a, b) => b.score - a.score);
  const used = new Map<string, number>();
  const picked: Move[] = [];
  for (const move of all) {
    const n = used.get(move.pageId) ?? 0;
    if (n >= perBrand) continue;
    used.set(move.pageId, n + 1);
    picked.push(move);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** The feed's headline: the biggest move, as one sentence. */
export function todayHeadline(moves: Move[]): string {
  const top = moves[0];
  if (!top) return "Add rivals to see what they changed this week.";
  if (top.kind === "big") return `${top.brand} is pushing hard this week.`;
  if (top.kind === "staying") return `${top.brand} is sticking with a winner.`;
  if (top.kind === "steady") return `${top.brand} launched new ads this week.`;
  return "A quiet week across your rivals.";
}

// ---------------------------------------------------------------- decoding

export type Provenance = "source" | "derived" | "heuristic";
export type DecodedLine = { label: string; value: string; provenance: Provenance };

export function hookType(hook: string | null): string | null {
  const h = clean(hook);
  if (!h) return null;
  if (classifyOffer(h).some((t) => t !== "sale")) return "Offer-led";
  if (/\?\s*$/.test(h) || /^(why|how|what|do you|are you|is your|tired of)\b/i.test(h)) return "Question";
  if (/\b(reviews?|rated|stars?|customers|loved by|bestsell|#1|trusted)\b/i.test(h)) return "Social proof";
  if (/\b\d+(\.\d+)?\s*(%|x|times|days?|weeks?|lakh|k\+?|\+)/i.test(h)) return "Claim with a number";
  if (/\b(new|introducing|launch|just dropped|now available)\b/i.test(h)) return "Launch";
  if (/\b(problem|struggl|hair ?fall|acne|dry|frizz|pain|stop)\b/i.test(h)) return "Problem-first";
  return "Statement";
}

export function decodeAd(
  ad: {
    headline?: string | null;
    primaryText?: string | null;
    offer?: string | null;
    creativeType?: string | null;
    callToAction?: string | null;
    landingPage?: string | null;
    productName?: string | null;
    languages?: Array<{ name: string }> | null;
    firstSeen?: string | null;
    lastSeen?: string | null;
    isActive?: boolean | null;
  },
  now = Date.now(),
): DecodedLine[] {
  const lines: DecodedLine[] = [];
  const hook = hookOf({ headline: ad.headline ?? null, primary_text: ad.primaryText ?? null });
  if (hook) lines.push({ label: "Hook", value: `“${hook}”`, provenance: "source" });
  const type = hookType(hook);
  if (type) lines.push({ label: "Hook type", value: type, provenance: "derived" });
  const offers = classifyOffer(`${clean(ad.offer)} ${clean(ad.headline)} ${clean(ad.primaryText)}`);
  lines.push({
    label: "Offer",
    value: offers.length ? offers.map((t) => OFFER_LABEL[t]).join(", ") : "None: sells on the product or result",
    provenance: "derived",
  });
  const format = clean(ad.creativeType).toLowerCase();
  if (format && format !== "unknown") lines.push({ label: "Format", value: format.charAt(0).toUpperCase() + format.slice(1), provenance: "source" });
  const product = productKey(ad.landingPage ?? null, ad.productName ?? null);
  if (product) lines.push({ label: "Product", value: product, provenance: "derived" });
  if (ad.languages?.length) lines.push({ label: "Language", value: ad.languages.map((l) => l.name).join(", "), provenance: "derived" });
  if (clean(ad.callToAction)) lines.push({ label: "Call to action", value: clean(ad.callToAction), provenance: "source" });
  const days = runningDays(ad.firstSeen ?? null, ad.lastSeen ?? null, now);
  if (days > 0) {
    lines.push({
      label: "Likely a winner",
      value: ad.isActive && days >= 60 ? `Yes: live ${days}+ days` : ad.isActive ? `Too early: live ${days} days` : `Stopped after ${days} days`,
      provenance: "heuristic",
    });
  }
  return lines;
}
