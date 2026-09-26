/**
 * Pure Brand Vault Pro helpers (no I/O, unit tested in signals.test.ts).
 */
import type { BrandEconomics } from "./types";

export const DAY_MS = 86_400_000;

export const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
export const normalize = (value: unknown) => clean(value).toLowerCase();
export const compactName = (value: unknown) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");

export function safeDate(value: unknown): number | null {
  const ms = value ? new Date(String(value)).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Observed days between first and last sighting (inclusive). 0 when unknown. */
export function runningDays(firstSeenAt: string | null, lastSeenAt: string | null, now = Date.now()): number {
  const first = safeDate(firstSeenAt);
  if (first == null) return 0;
  const last = safeDate(lastSeenAt) ?? now;
  return Math.max(1, Math.floor((Math.max(last, first) - first) / DAY_MS) + 1);
}

/** Hook = first sentence of the ad copy (headline when there is no copy). */
export function firstSentence(text: string | null | undefined): string | null {
  const value = clean(text);
  if (!value) return null;
  const first = value.split(/(?<=[.!?।！？])\s|\n/)[0]?.trim() ?? value;
  const cleaned = first.replace(/\bhttps?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 140);
  return cleaned || null;
}

/** Grouping key for hooks: case, punctuation and emoji do not create new hooks. */
export function hookKey(hook: string): string {
  return normalize(hook).replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * Product the ad pushes, from the landing URL path (/products/x, /collections/y),
 * else the parsed product name. Home pages and bare domains return null.
 */
export function productKey(landingUrl: string | null | undefined, productName: string | null | undefined): string | null {
  const url = clean(landingUrl);
  if (url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
      const match = path.match(/\/(products?|collections?|shop|p)\/([^/]+)/);
      if (match) return `/${match[1]}/${decodeURIComponent(match[2])}`.slice(0, 120);
    } catch {
      // not a URL: fall through to the product name
    }
  }
  const name = clean(productName);
  return name ? name.slice(0, 120) : null;
}

export type OfferType = "bogo" | "percent_off" | "flat_off" | "code" | "free_gift" | "combo" | "prepaid" | "free_shipping" | "sale";

const OFFER_RULES: Array<[OfferType, RegExp]> = [
  ["bogo", /\bbuy\s*\d+\s*get\s*\d+|\bb\d+g\d+\b|\bbogo\b/i],
  ["percent_off", /\d{1,2}\s*%\s*(off|discount)|(flat|upto|up to)\s*\d{1,2}\s*%/i],
  ["flat_off", /(flat|save|get)\s*(₹|rs\.?|inr)\s*\d+|(₹|rs\.?|inr)\s*\d+\s*off/i],
  ["code", /\b(use|apply)\s+(code|coupon)\b|\bcode\s*[:\-]?\s*[A-Z0-9]{4,}\b/i],
  ["free_gift", /\bfree\s+(gift|sample|comb|pouch|mini|product)|\bgift\s+(with|on)\b/i],
  ["combo", /\b(combo|kit|bundle|pack of \d+|set of \d+)\b/i],
  ["prepaid", /\bprepaid\b/i],
  ["free_shipping", /\bfree\s+(shipping|delivery)\b/i],
  ["sale", /\b(sale|deal|offer)\b/i],
];

export const OFFER_LABEL: Record<OfferType, string> = {
  bogo: "Buy X Get Y",
  percent_off: "% off",
  flat_off: "Flat ₹ off",
  code: "Coupon code",
  free_gift: "Free gift",
  combo: "Combo / kit",
  prepaid: "Prepaid discount",
  free_shipping: "Free shipping",
  sale: "Sale",
};

/** Offer types found in the ad's offer field and copy (most specific first). */
export function classifyOffer(text: string | null | undefined): OfferType[] {
  const value = clean(text);
  if (!value) return [];
  const found = OFFER_RULES.filter(([, re]) => re.test(value)).map(([type]) => type);
  // "sale" only when nothing more specific was found.
  return found.length > 1 ? found.filter((type) => type !== "sale") : found;
}

/** Largest % discount mentioned, e.g. "Flat 30% off" -> 30. */
export function discountDepth(text: string | null | undefined): number | null {
  const matches = [...clean(text).matchAll(/(\d{1,2})\s*%/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 100);
  return matches.length ? Math.max(...matches) : null;
}

/** A rupee price in text, e.g. "₹399", "Rs. 1,299". */
export function parseRupees(value: string | null | undefined): number | null {
  const match = clean(value).match(/(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

export function calculateBreakEven(economics: BrandEconomics): {
  breakEvenPrice: number | null;
  targetMarginPrice: number | null;
  contributionBeforeAds: number | null;
} {
  const anyCost = [economics.cogs, economics.packagingCost, economics.shippingCost, economics.paymentFeeFixed, economics.rtoCost]
    .some((value) => value != null && value > 0);
  if (!anyCost) return { breakEvenPrice: null, targetMarginPrice: null, contributionBeforeAds: null };

  const fixed =
    (economics.cogs ?? 0) +
    (economics.packagingCost ?? 0) +
    (economics.shippingCost ?? 0) +
    ((economics.rtoCost ?? 0) * (economics.rtoRatePercent ?? 0)) / 100 +
    (economics.paymentFeeFixed ?? 0);
  const feeRate = Math.max(0, (economics.paymentFeePercent ?? 0) + (economics.refundAllowancePercent ?? 0)) / 100;
  const denominator = 1 - feeRate;
  const round = (n: number) => Math.round(n * 100) / 100;
  const breakEvenPrice = denominator > 0 ? round(fixed / denominator) : null;
  const targetMargin = Math.max(0, economics.targetContributionMarginPercent ?? 0) / 100;
  const targetDenominator = 1 - feeRate - targetMargin;
  const targetMarginPrice = targetDenominator > 0 ? round(fixed / targetDenominator) : null;

  if (economics.sellingPrice == null) return { breakEvenPrice, targetMarginPrice, contributionBeforeAds: null };
  const revenue = economics.sellingPrice;
  return { breakEvenPrice, targetMarginPrice, contributionBeforeAds: round(revenue - fixed - revenue * feeRate) };
}

const ECONOMICS_KEYS: Array<keyof BrandEconomics> = [
  "sellingPrice", "cogs", "packagingCost", "shippingCost", "paymentFeePercent", "paymentFeeFixed",
  "rtoRatePercent", "rtoCost", "refundAllowancePercent", "targetContributionMarginPercent",
];
const PERCENT_KEYS = new Set<keyof BrandEconomics>(["paymentFeePercent", "rtoRatePercent", "refundAllowancePercent", "targetContributionMarginPercent"]);

/** Only finite, non-negative numbers survive; percentages are capped at 100. */
export function normalizeEconomics(value: unknown): BrandEconomics {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = {} as BrandEconomics;
  for (const key of ECONOMICS_KEYS) {
    const raw = input[key];
    const number = raw === null || raw === undefined || raw === "" ? NaN : typeof raw === "number" ? raw : Number(raw);
    out[key] = Number.isFinite(number) && number >= 0 ? (PERCENT_KEYS.has(key) ? Math.min(100, number) : Math.min(10_000_000, number)) : null;
  }
  return out;
}

/**
 * Match a typed competitor name to an indexed Meta page. Exact (ignoring case,
 * spaces and punctuation) wins; otherwise a single prefix match is accepted.
 * Ambiguous names return null so the user picks the Page ID explicitly.
 */
export function pickPageForName(
  name: string,
  candidates: Array<{ page_id?: string | number | null; label?: string | null }>,
): string | null {
  const query = compactName(name);
  if (query.length < 2) return null;
  const valid = candidates
    .map((row) => ({ pageId: String(row.page_id ?? "").trim(), label: compactName(row.label) }))
    .filter((row) => /^\d+$/.test(row.pageId) && row.label);
  const exact = [...new Set(valid.filter((row) => row.label === query).map((row) => row.pageId))];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const prefix = [...new Set(valid.filter((row) => row.label.startsWith(query) && row.label.length - query.length <= 12).map((row) => row.pageId))];
  return prefix.length === 1 ? prefix[0] : null;
}

/** Language code -> display name (Hinglish kept separate from Hindi/English). */
export function languageName(code: string): string {
  const map: Record<string, string> = {
    en: "English", hi: "Hindi", hinglish: "Hinglish", ta: "Tamil", te: "Telugu", mr: "Marathi", bn: "Bengali",
    gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", or: "Odia", ur: "Urdu", as: "Assamese",
  };
  const key = normalize(code);
  return map[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Unknown");
}
