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
const recentHours = Number(process.env.ADSPY_PREFILL_RECENT_HOURS);
/** Skip brands collected this recently (default 5 days; 0 forces a fresh scan). */
const RECENT_MS = (Number.isFinite(recentHours) && recentHours >= 0 ? recentHours : 120) * 60 * 60_000;
/** Optional: only these seed brands (manual test runs). */
const only = new Set(
  (process.env.ADSPY_PREFILL_BRANDS ?? "")
    .split(",")
    .map((b) => normalizeAdvertiserName(b.trim()))
    .filter(Boolean),
);

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

/**
 * tsx (esbuild keepNames) wraps functions with a `__name` helper. Functions
 * sent into the browser via page.evaluate then fail with
 * "__name is not defined". Define it inside every page we open.
 */
async function patchBrowserForTsx() {
  const { chromium } = await import("playwright-core");
  const shim = "globalThis.__name = globalThis.__name || ((f) => f);";
  const launch = chromium.launch.bind(chromium);
  chromium.launch = (async (...args: Parameters<typeof chromium.launch>) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = (async (...a: Parameters<typeof browser.newContext>) => {
      const context = await newContext(...a);
      await context.addInitScript(shim);
      return context;
    }) as typeof browser.newContext;
    const newPage = browser.newPage.bind(browser);
    browser.newPage = (async (...a: Parameters<typeof browser.newPage>) => {
      const page = await newPage(...a);
      await page.addInitScript(shim);
      return page;
    }) as typeof browser.newPage;
    return browser;
  }) as typeof chromium.launch;
}

async function main() {
  if (!userId) throw new Error("Missing ADSPY_SYSTEM_USER_ID.");
  await patchBrowserForTsx();
  const stats = { tracked: 0, collected: 0, skippedRecent: 0, noPage: 0, errors: 0 };

  // 1) Tracked / watched brands first — these are what paying users look at.
  //    (Skipped on a test run limited to a few brands.)
  if (!only.size) try {
    const tracked = await refreshTrackedAdSpy({ depth: "deep", minIntervalMs: Math.min(12 * 60 * 60_000, RECENT_MS) });
    await drain();
    stats.tracked = tracked.dispatched;
    console.log(
      `tracked brands refreshed: ${tracked.dispatched}/${tracked.targets}`,
      JSON.stringify({ skipped: tracked.skipped, errors: tracked.errors }),
    );
  } catch (error) {
    stats.errors += 1;
    console.error("tracked refresh failed:", error instanceof Error ? error.message : error);
  }

  // 2) Seed list, rotated daily so every night starts somewhere new.
  const seedData = seed as { country: string; brands: string[]; pages?: Record<string, string[]> };
  const brands = seedData.brands;
  const country = seedData.country || "IN";
  // Brand -> Meta Page IDs checked by hand. Wins over name matching and lets
  // one brand cover several pages (Kapiva runs ads from 3 pages).
  const pinned = seedData.pages ?? {};
  const byName = process.env.ADSPY_PREFILL_BY_NAME === "1";
  const day = Math.floor(Date.now() / 86_400_000);
  const offset = brands.length ? (day * 37) % brands.length : 0;
  const order = [...brands.slice(offset), ...brands.slice(0, offset)].filter(
    (b) => !only.size || only.has(normalizeAdvertiserName(b)),
  );
  if (only.size) console.log(`only: ${order.join(", ") || "(no seed brand matched)"}`);

  const collect = async (brand: string, page: Page | null) => {
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
      console.log(`- ${brand}${page ? ` (${page.pageId})` : ""}: ${result.outcome}`);
      return;
    }
    const t0 = Date.now();
    await drain();
    stats.collected += 1;
    console.log(`+ ${brand} (${page?.pageId ?? "by name"}) in ${mins(Date.now() - t0)} min`);
  };

  let attempted = 0;
  for (const brand of order) {
    if (attempted >= limit) break;
    if (timeLeft() < 4 * 60_000) {
      console.log(`time budget reached after ${mins(Date.now() - started)} min`);
      break;
    }
    attempted += 1;

    try {
      const ids = pinned[brand];
      if (ids?.length) {
        for (const pageId of ids) {
          if (timeLeft() < 4 * 60_000) break;
          await collect(brand, { pageId, name: brand });
        }
        continue;
      }

      const want = normalizeAdvertiserName(brand);
      // Identity boundary: exact name match, or a verified page containing
      // the brand. Never guess a Page ID.
      let page = pick(await fromIndex(brand, country), want);
      if (!page) {
        const live = await searchMetaPages(brand, country).catch(() => [] as Page[]);
        page = pick(live, want);
      }
      if (!page) {
        stats.noPage += 1;
        if (!byName) {
          // A name search is a keyword search: other advertisers' ads, and
          // never the brand's full list. Add the brand's page to "pages" in
          // adspy-seed-brands.json instead.
          console.log(`~ ${brand}: no exact page, skipped (add its Page ID to seed "pages")`);
          continue;
        }
        console.log(`~ ${brand}: no exact page, collecting by name`);
      }
      await collect(brand, page ?? null);
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
