import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { askJev, jevKey } from "@/lib/ai/jev";
import { createLedger } from "@/lib/ai/ledger";
import { classifyOffer } from "@/lib/brand-vault/signals";

import { isMismatch, landingKey, offersOverlap, pageFacts, readPage } from "./reader";

/**
 * Landing-page check for watched brands' live ads, in idle time:
 * read each new page once a week (Jina Reader), store its prices and offers,
 * and record per ad whether the page shows the offer the ad promises
 * (offer types first; Jev for the judgement when TYPESAFE_API_KEY is set).
 * Tables: landing_pages, ad_landing_checks (migration 20261001010000).
 */

const REFRESH_DAYS = 7;
const missingTable = (message: string) => /42P01|PGRST205|does not exist/i.test(message);

type AdRow = { id: string; advertiser_id: string | null; landing_page_url: string | null; offer: string | null; headline: string | null; primary_text: string | null };
type PageRow = { url_key: string; title: string | null; prices: number[] | null; offers: string[] | null; excerpt: string | null; fetched_at: string | null; status: string | null };

export async function checkLandingPages(options: { limit?: number; deadlineAt?: number } = {}): Promise<{ pages: number; checks: number; skipped: string | null }> {
  if (process.env.LANDING_CHECKS === "0") return { pages: 0, checks: 0, skipped: "disabled" };
  const client = createGlobalServiceClient();
  const ledger = createLedger(client);
  const past = () => Boolean(options.deadlineAt && Date.now() > options.deadlineAt);
  const limit = Math.max(1, Math.min(options.limit ?? 8, 40));

  const watched = await client.from("adspy_advertiser_watchlists").select("advertiser_id").eq("platform", "meta").limit(500);
  const pageIds = Array.from(new Set((watched.data ?? []).map((r) => String((r as { advertiser_id: unknown }).advertiser_id)).filter((id) => /^\d+$/.test(id))));
  if (!pageIds.length) return { pages: 0, checks: 0, skipped: "no watched brands" };

  const ads: AdRow[] = [];
  for (let i = 0; i < pageIds.length && ads.length < 400; i += 20) {
    const { data, error } = await client
      .from("ad_intelligence_creatives")
      .select("id,advertiser_id,landing_page_url,offer,headline,primary_text")
      .eq("platform", "meta")
      .eq("is_currently_active", true)
      .in("advertiser_id", pageIds.slice(i, i + 20))
      .not("landing_page_url", "is", null)
      .order("first_seen_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) return { pages: 0, checks: 0, skipped: error.message };
    ads.push(...((data ?? []) as AdRow[]));
  }

  // Ads per page, and which pages are fresh already.
  const byKey = new Map<string, { url: string; ads: AdRow[] }>();
  for (const ad of ads) {
    const key = landingKey(ad.landing_page_url);
    if (!key) continue;
    const entry = byKey.get(key) ?? { url: String(ad.landing_page_url), ads: [] };
    entry.ads.push(ad);
    byKey.set(key, entry);
  }
  const keys = Array.from(byKey.keys());
  if (!keys.length) return { pages: 0, checks: 0, skipped: null };
  const known = new Map<string, PageRow>();
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await client.from("landing_pages").select("url_key,title,prices,offers,excerpt,fetched_at,status").in("url_key", keys.slice(i, i + 150));
    if (error) return { pages: 0, checks: 0, skipped: missingTable(error.message) ? "landing tables missing (run the migration)" : error.message };
    for (const row of (data ?? []) as PageRow[]) known.set(row.url_key, row);
  }
  const stale = (row: PageRow | undefined) => !row?.fetched_at || Date.now() - Date.parse(row.fetched_at) > REFRESH_DAYS * 86_400_000;
  // Pages used by the most ads first.
  const toRead = keys.filter((k) => stale(known.get(k))).sort((a, b) => byKey.get(b)!.ads.length - byKey.get(a)!.ads.length).slice(0, limit);

  let pages = 0;
  for (const key of toRead) {
    if (past()) break;
    const { url } = byKey.get(key)!;
    try {
      const read = await readPage(url);
      ledger.record({ provider: "jina", model: "reader", purpose: "landing_page", inputTokens: read.tokens, latencyMs: read.ms, ok: true });
      const facts = pageFacts(read.content, read.title);
      const row: PageRow & { url: string; error: null } = {
        url_key: key,
        url,
        title: facts.title,
        prices: facts.prices,
        offers: facts.offers,
        excerpt: facts.excerpt,
        fetched_at: new Date().toISOString(),
        status: "ok",
        error: null,
      };
      await client.from("landing_pages").upsert(row);
      known.set(key, row);
      pages += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ledger.record({ provider: "jina", model: "reader", purpose: "landing_page", ok: false, error: message });
      await client.from("landing_pages").upsert({ url_key: key, url, status: "failed", error: message.slice(0, 300), fetched_at: new Date().toISOString() });
      if (/Jina Reader 429/.test(message)) break; // rate limited: next run
    }
  }

  // Offer match for ads on pages read in this run.
  let checks = 0;
  const jevOn = Boolean(jevKey());
  for (const key of toRead) {
    const page = known.get(key);
    if (!page || page.status !== "ok") continue;
    for (const ad of byKey.get(key)!.ads.slice(0, 5)) {
      if (past()) break;
      const adText = [ad.offer, ad.headline, ad.primary_text].filter(Boolean).join(" ");
      const adOffers = classifyOffer(adText);
      const overlap = offersOverlap(adOffers, (page.offers ?? []) as typeof adOffers);
      let jevMatch: number | null = null;
      if (jevOn && adOffers.length) {
        try {
          const res = await askJev(
            { ad_offer: ad.offer, ad_copy: (ad.primary_text ?? ad.headline ?? "").slice(0, 600), page_title: page.title, page_text: (page.excerpt ?? "").slice(0, 1500) },
            { offerMatches: { type: "noul", instructions: "Does the landing page show the same deal the ad promises (same discount, gift, bundle or price)? Answer no if the page shows a different or no deal." } },
          );
          ledger.record({ provider: "jev", model: res.model, purpose: "landing_offer_match", creativeId: ad.id, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.ms, ok: true });
          jevMatch = typeof res.answers.offerMatches?.noul === "number" ? res.answers.offerMatches.noul : null;
        } catch {
          jevMatch = null;
        }
      }
      await client.from("ad_landing_checks").upsert({
        creative_id: ad.id,
        advertiser_id: ad.advertiser_id,
        url_key: key,
        ad_offers: adOffers,
        page_offers: page.offers ?? [],
        offers_overlap: overlap,
        jev_match: jevMatch,
        checked_at: new Date().toISOString(),
      });
      checks += 1;
    }
  }
  await ledger.flush();
  return { pages, checks, skipped: null };
}

export type LandingSummary = { checked: number; mismatches: number; example: { adOffer: string | null; pageTitle: string | null } | null; pricePoints: number[] };

/** For the brand overview: how a brand's live ads line up with their pages. Best effort. */
export async function loadLandingSummary(liveIds: string[], offers: Map<string, string | null>): Promise<LandingSummary | null> {
  try {
    if (!liveIds.length) return null;
    const client = createGlobalServiceClient();
    const rows: Array<{ creative_id: string; url_key: string; offers_overlap: boolean | null; jev_match: number | null }> = [];
    for (let i = 0; i < Math.min(liveIds.length, 600); i += 150) {
      const { data, error } = await client.from("ad_landing_checks").select("creative_id,url_key,offers_overlap,jev_match").in("creative_id", liveIds.slice(i, i + 150));
      if (error) return null;
      rows.push(...((data ?? []) as typeof rows));
    }
    if (!rows.length) return null;
    const bad = rows.filter(isMismatch);
    const pageKeys = Array.from(new Set(rows.map((r) => r.url_key))).slice(0, 150);
    const { data: pages } = await client.from("landing_pages").select("url_key,title,prices").in("url_key", pageKeys).eq("status", "ok");
    const pageRows = (pages ?? []) as Array<{ url_key: string; title: string | null; prices: number[] | null }>;
    const prices = Array.from(new Set(pageRows.flatMap((p) => p.prices ?? []))).sort((a, b) => a - b).slice(0, 8);
    const first = bad[0];
    return {
      checked: rows.length,
      mismatches: bad.length,
      example: first ? { adOffer: offers.get(first.creative_id) ?? null, pageTitle: pageRows.find((p) => p.url_key === first.url_key)?.title ?? null } : null,
      pricePoints: prices,
    };
  } catch {
    return null;
  }
}
