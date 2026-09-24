/**
 * Nightly AdSpy pre-fill (runs on GitHub Actions, not Vercel).
 *
 * 1. Refreshes every brand users track/watch (replaces the Vercel cron).
 * 2. Walks scripts/adspy-seed-brands.json, resolves each brand to its exact
 *    Meta Page ID, and collects its full public ad library ("deep").
 *
 * Runs collections in-process, one at a time, inside a time budget, so the
 * 60-second Vercel limit does not apply. Brands collected in the last
 * few days are skipped, so consecutive nights cover different brands.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      ADSPY_SYSTEM_USER_ID, ADSPY_BROWSER=playwright,
 *      ADSPY_PREFILL_MINUTES (default 50), ADSPY_PREFILL_LIMIT (optional).
 */
import seed from "./adspy-seed-brands.json";

import { collectAdIntelligence } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import { setAdSpyInlineRunner } from "@/lib/ad-intelligence/jobs/dispatch-adspy-collection";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";
import { refreshTrackedAdSpy } from "@/lib/ad-intelligence/jobs/refresh-tracked-ad-spy";
import { normalizeAdvertiserName, searchMetaPages } from "@/lib/ad-intelligence/global/meta-page-search";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

type Page = { pageId: string; name: string; verification?: string | null };

/** 1) our own advertiser index (fast, no browser) */
async function fromIndex(brand: string, country: string): Promise<Page[]> {
  const { data, error } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
    p_query: brand,
    p_platform: "meta",
    p_country: country,
    p_limit: 10,
  });
  if (error) return [];
  return ((data ?? []) as Array<{ page_id?: string | number | null; label?: string | null; verification?: string | null }>)
    .filter((row) => row.page_id && row.label)
    .map((row) => ({ pageId: String(row.page_id), name: String(row.label), verification: row.verification ?? null }));
}

function pick(pages: Page[], want: string): Page | undefined {
  return (
    pages.find((p) => normalizeAdvertiserName(p.name) === want) ??
    pages.find((p) => p.verification?.toUpperCase() === "VERIFIED" && normalizeAdvertiserName(p.name).includes(want))
  );
}

const started = Date.now();
const budgetMs = Math.max(5, Number(process.env.ADSPY_PREFILL_MINUTES) || 50) * 60_000;
const limit = Number(process.env.ADSPY_PREFILL_LIMIT) || Infinity;
const userId = (process.env.ADSPY_SYSTEM_USER_ID ?? "").trim();
const RECENT_MS = 5 * 24 * 60 * 60_000;

const pending: Promise<unknown>[] = [];
setAdSpyInlineRunner((payload: CollectionEvent) => {
  pending.push(
    collectAdIntelligence(payload).catch((error) => {
      console.error("  collection failed:", error instanceof Error ? error.message : error);
    }),
  );
});

async function drain() {
  while (pending.length) await pending.shift();
}

const timeLeft = () => budgetMs - (Date.now() - started);
const mins = (ms: number) => (ms / 60_000).toFixed(1);

async function main() {
  if (!userId) throw new Error("Missing ADSPY_SYSTEM_USER_ID.");
  const stats = { tracked: 0, collected: 0, skippedRecent: 0, noPage: 0, errors: 0 };

  // 1) Tracked / watched brands first — these are what paying users look at.
  try {
    const tracked = await refreshTrackedAdSpy();
    await drain();
    stats.tracked = tracked.dispatched;
    console.log(`tracked brands refreshed: ${tracked.dispatched}/${tracked.targets}`);
  } catch (error) {
    stats.errors += 1;
    console.error("tracked refresh failed:", error instanceof Error ? error.message : error);
  }

  // 2) Seed list, rotated daily so every night starts somewhere new.
  const brands = (seed as { country: string; brands: string[] }).brands;
  const country = (seed as { country: string }).country || "IN";
  const day = Math.floor(Date.now() / 86_400_000);
  const offset = brands.length ? (day * 37) % brands.length : 0;
  const order = [...brands.slice(offset), ...brands.slice(0, offset)];

  let attempted = 0;
  for (const brand of order) {
    if (attempted >= limit) break;
    if (timeLeft() < 4 * 60_000) {
      console.log(`time budget reached after ${mins(Date.now() - started)} min`);
      break;
    }
    attempted += 1;

    try {
      const want = normalizeAdvertiserName(brand);
      // Identity boundary: exact name match, or a verified page containing
      // the brand. Never guess a Page ID.
      let page = pick(await fromIndex(brand, country), want);
      if (!page) {
        const live = await searchMetaPages(brand, country).catch(() => [] as Page[]);
        page = pick(live, want);
      }
      if (!page) {
        // No exact page: search Meta by brand name. Every ad is still stored
        // under its real advertiser Page ID, so data stays correctly attributed.
        stats.noPage += 1;
        console.log(`~ ${brand}: no exact page, collecting by name`);
      }

      const result = await startAdSpyCollection({
        userId,
        query: page?.name ?? brand,
        country,
        platform: "meta",
        mode: "advertiser",
        pageId: page?.pageId ?? null,
        minIntervalMs: RECENT_MS,
        reason: "scheduled",
        depth: "deep",
      });

      if (result.outcome !== "dispatched") {
        stats.skippedRecent += 1;
        console.log(`- ${brand}: ${result.outcome}`);
        continue;
      }
      const t0 = Date.now();
      await drain();
      stats.collected += 1;
      console.log(`+ ${brand} (${page?.pageId ?? "by name"}) in ${mins(Date.now() - t0)} min`);
    } catch (error) {
      stats.errors += 1;
      console.error(`! ${brand}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("summary", JSON.stringify({ ...stats, minutes: mins(Date.now() - started) }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
