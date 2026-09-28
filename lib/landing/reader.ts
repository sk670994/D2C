/**
 * Landing pages: what a rival actually sells behind an ad.
 * Jina Reader turns the page into clean text (r.jina.ai; free without a key
 * at 20 requests/min, JINA_API_KEY raises it). We extract prices and offer
 * types deterministically, and ask Jev whether the page's offer matches the
 * ad's promise. Pure helpers here are unit tested.
 */
import { classifyOffer, type OfferType } from "@/lib/brand-vault/signals";

export const READER_BASE = "https://r.jina.ai/";

/** Same page regardless of tracking parameters. */
export function landingKey(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (/(^|\.)facebook\.com$|(^|\.)fb\.me$|(^|\.)instagram\.com$|(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i.test(u.hostname)) return null; // not a store page
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

/** Rupee prices on the page (₹, Rs., INR), deduplicated, ascending. */
export function extractPrices(text: string, max = 12): number[] {
  const found = new Set<number>();
  const re = /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]{2,7}(?:\.[0-9]{1,2})?)/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 10 && n <= 500_000) found.add(Math.round(n));
    if (found.size >= 40) break;
  }
  return Array.from(found).sort((a, b) => a - b).slice(0, max);
}

export type PageFacts = { title: string | null; prices: number[]; offers: OfferType[]; excerpt: string };

/** Facts from the Reader's markdown: title, prices, offer types, a short excerpt. */
export function pageFacts(markdown: string, title: string | null = null): PageFacts {
  const text = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return {
    title: title?.trim() || null,
    prices: extractPrices(text),
    offers: classifyOffer(text.slice(0, 20_000)),
    excerpt: text.slice(0, 1_500),
  };
}

export type ReaderResult = { title: string | null; content: string; tokens: number; ms: number };

export function jinaKey(): string | null {
  const raw = process.env.JINA_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return raw ? raw : null;
}

/** One page through Jina Reader (JSON mode). */
export async function readPage(url: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ReaderResult> {
  const started = Date.now();
  const headers: Record<string, string> = { Accept: "application/json", "X-Timeout": "20" };
  const key = jinaKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await (options.fetchImpl ?? fetch)(`${READER_BASE}${url}`, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  if (!response.ok) throw new Error(`Jina Reader ${response.status}`);
  const json = (await response.json().catch(() => null)) as { data?: { title?: string; content?: string; usage?: { tokens?: number } } } | null;
  const content = String(json?.data?.content ?? "");
  if (!content) throw new Error("Jina Reader returned no content");
  return { title: json?.data?.title ?? null, content: content.slice(0, 60_000), tokens: Number(json?.data?.usage?.tokens ?? 0), ms: Date.now() - started };
}

/** Deterministic first check before asking Jev: do the offer types overlap? */
export function offersOverlap(adOffers: OfferType[], pageOffers: OfferType[]): boolean | null {
  if (!adOffers.length) return null; // the ad makes no offer: nothing to compare
  if (!pageOffers.length) return false;
  return adOffers.some((o) => pageOffers.includes(o));
}

/** A mismatch: Jev says the page does not show the ad's deal (or, without Jev, no offer type in common). */
export function isMismatch(row: { offers_overlap: boolean | null; jev_match: number | null }): boolean {
  if (typeof row.jev_match === "number") return row.jev_match < 0.3;
  return row.offers_overlap === false;
}
