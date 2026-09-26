import type { CompetitorAd } from "../types";

export type IntelligenceRow = Pick<CompetitorAd,
  "id" | "platform" | "advertiserName" | "advertiserId" | "creatorName" |
  "creativeType" | "primaryText" | "headline" | "description" | "offer" |
  "callToAction" | "firstSeen" | "lastSeen" | "isActive" | "landingPage"
>;

export type HawkyConfidence = "low" | "medium" | "high";
export type HawkyState = "stable" | "evolving" | "shifting";

export type HawkySignal = {
  id: string;
  type: "hook_shift" | "offer_shift" | "format_shift" | "creative_expansion" | "creative_retrenchment" | "persistence";
  title: string;
  summary: string;
  evidence: string[];
  recentCount: number;
  previousCount: number;
  changePct: number;
  confidence: HawkyConfidence;
};

export type HawkyOpportunity = {
  id: string;
  title: string;
  why: string;
  evidence: string[];
  confidence: HawkyConfidence;
};

export type HawkyInsight = {
  query: string;
  generatedAt: string;
  sampleSize: number;
  activeAds: number;
  state: HawkyState;
  confidence: HawkyConfidence;
  shiftScore: number;
  summary: string;
  signals: HawkySignal[];
  opportunities: HawkyOpportunity[];
  formatMix: Array<{ label: string; count: number; share: number }>;
  topHooks: Array<{ label: string; count: number; share: number }>;
  topOffers: Array<{ label: string; count: number; share: number }>;
  evidence: string[];
};

const DAY_MS = 86400000;

function clean(value?: string | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function lower(value?: string | null): string { return clean(value).toLocaleLowerCase(); }
function dateMs(value?: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
function share(part: number, total: number): number { return total ? Math.round((part / total) * 1000) / 10 : 0; }
function pctChange(recent: number, previous: number): number {
  if (previous === 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - previous) / previous) * 100);
}
function confidenceFor(sampleSize: number): HawkyConfidence {
  if (sampleSize >= 75) return "high";
  if (sampleSize >= 25) return "medium";
  return "low";
}
function hook(row: IntelligenceRow): string | null {
  const text = clean(row.primaryText || row.headline || row.description);
  if (!text) return null;
  return text.split(/[.!?।！？]/)[0]?.trim().replace(/https?:\/\/\S+/gi, "").slice(0, 120) || null;
}
function offer(row: IntelligenceRow): string | null {
  const direct = clean(row.offer);
  if (direct) return direct;
  const text = clean([row.primaryText, row.headline, row.description].filter(Boolean).join(" "));
  if (!text) return null;
  const percentage = text.match(/\b(?:save\s*)?(\d{1,3})\s*%\s*(?:off|discount)\b/i);
  if (percentage?.[0]) return percentage[0].trim();
  const patterns = ["free shipping","free delivery","limited offer","special offer","promo code","discount","save","sale","coupon","deal"];
  const normalized = lower(text);
  return patterns.find((pattern) => normalized.includes(pattern)) ?? null;
}
function topValues(values: Array<string | null>, total: number) {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const value of values) {
    const v = clean(value);
    if (!v) continue;
    const key = v.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    labels.set(key, v);
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([key,count]) => ({
    label: labels.get(key) ?? key, count, share: share(count,total)
  }));
}
function formatLabel(row: IntelligenceRow): string {
  const type = lower(row.creativeType);
  if (type.includes("video")) return "Video";
  if (type.includes("carousel")) return "Carousel";
  if (type.includes("image") || type.includes("static")) return "Static image";
  return "Other";
}
function changeSignal(type: HawkySignal["type"], title: string, label: string, recentCount: number, previousCount: number, confidence: HawkyConfidence): HawkySignal | null {
  if (recentCount + previousCount === 0) return null;
  const changePct = pctChange(recentCount, previousCount);
  if (Math.abs(changePct) < 35 && recentCount < 4) return null;
  return {
    id: type + ":" + label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-"),
    type, title,
    summary: label + (recentCount >= previousCount ? " increased" : " decreased") + " in the recent observation window.",
    evidence: [
      String(recentCount) + " observed in the recent 30-day window.",
      String(previousCount) + " observed in the preceding 30-day window.",
      "Change: " + (changePct >= 0 ? "+" : "") + String(changePct) + "%.",
    ],
    recentCount, previousCount, changePct, confidence,
  };
}

export function buildHawkyInsight(rows: IntelligenceRow[], input: { query: string; now?: Date }): HawkyInsight {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const recentStart = nowMs - 30 * DAY_MS;
  const previousStart = nowMs - 60 * DAY_MS;
  const confidence = confidenceFor(rows.length);

  const recentRows = rows.filter((row) => { const first = dateMs(row.firstSeen); return first !== null && first >= recentStart; });
  const previousRows = rows.filter((row) => { const first = dateMs(row.firstSeen); return first !== null && first >= previousStart && first < recentStart; });

  const recentFormats = recentRows.map(formatLabel);
  const previousFormats = previousRows.map(formatLabel);
  const recentHooks = recentRows.map(hook);
  const previousHooks = previousRows.map(hook);
  const recentOffers = recentRows.map(offer);
  const previousOffers = previousRows.map(offer);

  const formatMix = topValues(rows.map(formatLabel), rows.length);
  const topHooks = topValues(rows.map(hook), rows.length);
  const topOffers = topValues(rows.map(offer), rows.length);
  const signals: HawkySignal[] = [];

  for (const format of new Set([...formatMix.map((x) => x.label), ...recentFormats])) {
    const s = changeSignal("format_shift", "Format movement", format,
      recentFormats.filter((x) => x === format).length,
      previousFormats.filter((x) => x === format).length, confidence);
    if (s) signals.push(s);
  }
  const hookKeys = new Set(topValues([...recentHooks, ...previousHooks], rows.length).map((x) => x.label.toLocaleLowerCase()));
  for (const label of hookKeys) {
    const s = changeSignal("hook_shift", "Opening-message movement", label,
      recentHooks.filter((x) => clean(x).toLocaleLowerCase() === label).length,
      previousHooks.filter((x) => clean(x).toLocaleLowerCase() === label).length, confidence);
    if (s) signals.push(s);
  }
  const offerKeys = new Set(topValues([...recentOffers, ...previousOffers], rows.length).map((x) => x.label.toLocaleLowerCase()));
  for (const label of offerKeys) {
    const s = changeSignal("offer_shift", "Offer movement", label,
      recentOffers.filter((x) => clean(x).toLocaleLowerCase() === label).length,
      previousOffers.filter((x) => clean(x).toLocaleLowerCase() === label).length, confidence);
    if (s) signals.push(s);
  }

  const activeAds = rows.filter((row) => row.isActive !== false).length;
  const persistent30 = rows.filter((row) => {
    const first = dateMs(row.firstSeen);
    return first !== null && row.isActive !== false && nowMs - first >= 30 * DAY_MS;
  }).length;
  if (persistent30 >= 3) {
    signals.push({ id:"persistence", type:"persistence", title:"Persistent creative system",
      summary:"Multiple creatives have remained observable for at least 30 days.",
      evidence:[String(persistent30)+" currently observable creatives meet the 30-day persistence threshold.", "Persistence is an observation signal, not proof of performance."],
      recentCount:persistent30, previousCount:0, changePct:0, confidence });
  }

  if (recentRows.length >= 4 || previousRows.length >= 4) {
    const growing = recentRows.length >= previousRows.length;
    const type = growing ? "creative_expansion" : "creative_retrenchment";
    signals.push({ id:type, type, title:growing ? "Creative activity is expanding" : "Creative activity is slowing",
      summary:"The number of creatives first observed recently changed versus the preceding window.",
      evidence:[String(recentRows.length)+" first observed in the recent 30-day window.", String(previousRows.length)+" first observed in the preceding 30-day window."],
      recentCount:recentRows.length, previousCount:previousRows.length,
      changePct:pctChange(recentRows.length, previousRows.length), confidence });
  }

  const sortedSignals = [...signals].sort((a,b) => Math.abs(b.changePct)-Math.abs(a.changePct)).slice(0,6);
  const shiftScore = Math.min(100, Math.round(sortedSignals.reduce((sum,s) => sum + Math.min(35, Math.abs(s.changePct)/3 + 6), 0)));
  const state: HawkyState = shiftScore >= 62 ? "shifting" : shiftScore >= 28 ? "evolving" : "stable";

  const recentTopFormats = topValues(recentFormats, recentRows.length);
  const previousTopFormats = topValues(previousFormats, previousRows.length);
  const opportunities: HawkyOpportunity[] = [];
  if (recentTopFormats[0] && previousTopFormats[0] && recentTopFormats[0].label !== previousTopFormats[0].label) {
    opportunities.push({ id:"format-difference", title:"Investigate the change in dominant format",
      why:"The dominant creative format differs between the two observation windows.",
      evidence:["Recent leader: "+recentTopFormats[0].label+".", "Previous leader: "+previousTopFormats[0].label+"."], confidence });
  }
  const repeatedHook = topHooks.find((item) => item.count >= 3);
  if (repeatedHook) opportunities.push({ id:"repeat-hook", title:"Study repeated opening messages",
    why:"A recurring opening message appears across multiple creatives.",
    evidence:["The opening message appears in "+String(repeatedHook.count)+" indexed creatives.", "Repetition is useful for qualitative study; it does not establish causal performance."], confidence });
  const repeatedOffer = topOffers.find((item) => item.count >= 3);
  if (repeatedOffer) opportunities.push({ id:"repeat-offer", title:"Study recurring commercial offers",
    why:"A recurring offer is visible across the indexed creative system.",
    evidence:["The offer appears in "+String(repeatedOffer.count)+" indexed creatives.", "Compare hook, format and landing page context before treating it as a strategic pattern."], confidence });
  if (opportunities.length < 3 && formatMix.length) {
    const leastUsed = [...formatMix].sort((a,b) => a.share-b.share)[0];
    if (leastUsed) opportunities.push({ id:"underused-format", title:"Explore an underrepresented format",
      why:"It occupies a smaller share of the observed portfolio.",
      evidence:[leastUsed.label+": "+String(leastUsed.count)+" of "+String(rows.length)+" creatives ("+String(leastUsed.share)+"%).", "This is a portfolio-gap signal, not a performance prediction."], confidence });
  }

  return {
    query:input.query, generatedAt:now.toISOString(), sampleSize:rows.length, activeAds, state, confidence, shiftScore,
    summary: state === "shifting"
      ? "The observed creative system is changing materially across the selected window."
      : state === "evolving"
        ? "The observed creative system shows moderate movement worth monitoring."
        : "The observed creative system looks comparatively stable in the selected history.",
    signals:sortedSignals, opportunities:opportunities.slice(0,5), formatMix, topHooks, topOffers,
    evidence:[String(rows.length)+" public creative records were analyzed.", String(activeAds)+" are currently marked observable/active.", String(recentRows.length)+" were first observed in the last 30 days.", String(previousRows.length)+" were first observed in the preceding 30 days.", "Public competitor data is treated as observational intelligence; performance metrics are not inferred."],
  };
}
