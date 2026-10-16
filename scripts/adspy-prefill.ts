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
import { backfillAdMedia } from "@/lib/ad-intelligence/jobs/media-backfill";
import { pickBrandPage } from "@/lib/ad-intelligence/discovery/pick-page";
import { PageMemory } from "@/lib/ad-intelligence/worker/page-memory";

type Page = { pageId: string; name: string; verification?: string | null; likes?: number | null; igFollowers?: number | null };

/** 1) our own advertiser index (fast, no browser). failed = could not ask (DB down), not "no page". */
async function fromIndex(brand: string, country: string): Promise<{ pages: Page[]; failed: boolean }> {
  try {
    const { data, error } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
      p_query: brand,
      p_platform: "meta",
      p_country: country,
      p_limit: 10,
    });
    if (error) return { pages: [], failed: true };
    const pages = ((data ?? []) as Array<{ page_id?: string | number | null; label?: string | null; verification?: string | null }>)
      .filter((row) => row.page_id && row.label)
      .map((row) => ({ pageId: String(row.page_id), name: String(row.label), verification: row.verification ?? null }));
    return { pages, failed: false };
  } catch {
    return { pages: [], failed: true };
  }
}

/** Last page this brand was collected from (DB history), used only when a fresh look-up failed. */
async function lastKnownPage(brand: string, country: string): Promise<Page | null> {
  const { data, error } = await createGlobalServiceClient()
    .from("ad_intelligence_collection_jobs")
    .select("query,collection_key")
    .eq("platform", "meta")
    .eq("mode", "advertiser")
    .eq("country", country)
    .ilike("query", brand.replace(/[\\%_]/g, (c) => `\\${c}`))
    .like("collection_key", "%|page:%")
    .order("last_requested_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as Array<{ query: string; collection_key: string }>)[0];
  const pageId = row ? /\|page:(\d+)$/.exec(row.collection_key)?.[1] : null;
  return pageId ? { pageId, name: brand } : null;
}

/**
 * Before each brand: is the database answering? If not, wait (it is usually
 * the free tier's disk budget recovering) instead of hammering it. After
 * ~15 min of no answer, the run stops; the remaining brands go next night.
 */
async function databaseReady(): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await createGlobalServiceClient()
      .from("ad_intelligence_brands")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .then((r) => r, (e: unknown) => ({ error: e }));
    if (!error) return true;
    if (attempt === 3) break;
    console.warn(`  database not answering (${error instanceof Error ? error.message : (error as { message?: string }).message ?? "error"}); waiting 5 min`);
    await new Promise((resolve) => setTimeout(resolve, 5 * 60_000));
  }
  return false;
}

/**
 * Brand -> one Meta page (accents ignored: L'Oréal = Loreal). Exact name
 * first; otherwise the plausible pages are ranked (verified, then audience)
 * and the top one is taken only with a clear lead. A wrong page is worse
 * than a skipped brand, so ties return no page plus the candidates to pin.
 */
function pick(pages: Page[], brand: string) {
  const result = pickBrandPage(brand, pages.map((p) => ({ ...p, label: p.name })));
  return { page: result.page ?? undefined, candidates: result.candidates, reason: result.reason };
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

// One collection at a time. Starting them all at once (11 tracked brands on
// 11 Oct) flooded Supabase with writes until every query timed out.
const pending: CollectionEvent[] = [];
setAdSpyInlineRunner((payload: CollectionEvent) => {
  pending.push(payload);
});

/** Page IDs and brand names already read in full tonight: never twice a night. */
const doneTonight = new Set<string>();
const nameKey = (name: string) => `name:${normalizeAdvertiserName(name)}`;
const collectedTonight = (pageId: string | null | undefined, name: string) =>
  (pageId ? doneTonight.has(`page:${pageId}`) : false) || doneTonight.has(nameKey(name));

async function drain() {
  while (pending.length) {
    const payload = pending.shift()!;
    const result = await collectAdIntelligence(payload).catch((error) => {
      console.error("  collection failed:", error instanceof Error ? error.message : error);
      return null;
    });
    doneTonight.add(nameKey(payload.query));
    const pageId = result?.pageId ?? payload.advertiserPageId ?? null;
    if (pageId) doneTonight.add(`page:${pageId}`);
  }
}

const timeLeft = () => budgetMs - (Date.now() - started);

/**
 * With ADSPY_DEFER_MEDIA=1 ads are saved with Meta's image links; copy those
 * images to our storage now, while the links still work. Separate from the
 * scrape so a slow upload never holds a save (or the run's heartbeat).
 */
let lastMediaCopy = Date.now();
async function copyMedia(capMs = 20 * 60_000, ignoreBudget = false) {
  if (process.env.ADSPY_DEFER_MEDIA !== "1") return;
  lastMediaCopy = Date.now();
  const t0 = Date.now();
  const deadlineAt = Date.now() + Math.max(0, ignoreBudget ? capMs : Math.min(capMs, timeLeft() - 4 * 60_000));
  let copied = 0;
  while (Date.now() < deadlineAt) {
    const moved = await backfillAdMedia({ limit: 200, deadlineAt }).catch((error) => {
      console.error("  media copy failed:", error instanceof Error ? error.message : error);
      return 0;
    });
    copied += moved;
    if (moved < 5) break; // nothing (or only dead links) left
  }
  if (copied) console.log(`  images copied: ${copied} in ${mins(Date.now() - t0)} min`);
}
const mins = (ms: number) => (ms / 60_000).toFixed(1);

/**
 * Copy images every ~hour, not after every brand (that cost up to 20 min per
 * brand). Meta's image links last well over an hour, so nothing is lost.
 */
async function copyMediaIfDue() {
  if (Date.now() - lastMediaCopy >= 60 * 60_000) await copyMedia();
}

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
  const stats = { tracked: 0, collected: 0, skippedRecent: 0, noPage: 0, lookupFailed: 0, remembered: 0, errors: 0 };
  const memory = new PageMemory();
  console.log(`page memory: ${memory.size} brands`);
  if (!(await databaseReady())) {
    console.error("! database unavailable for ~15 min at start: nothing collected tonight");
    console.log("summary", JSON.stringify({ ...stats, errors: 1, minutes: mins(Date.now() - started) }));
    return;
  }

  // 1) Tracked / watched brands first — these are what paying users look at.
  //    (Skipped on a test run limited to a few brands.)
  if (!only.size) try {
    const tracked = await refreshTrackedAdSpy({ depth: "deep", minIntervalMs: Math.min(12 * 60 * 60_000, RECENT_MS) });
    await drain();
    await copyMediaIfDue();
    stats.tracked = tracked.dispatched;
    console.log(
      `tracked brands refreshed: ${tracked.dispatched}/${tracked.targets}`,
      JSON.stringify({ skipped: tracked.skipped, errors: tracked.errors }),
    );
  } catch (error) {
    stats.errors += 1;
    console.error("tracked refresh failed:", error instanceof Error ? error.message : error);
  }

  // 1b) Brands users looked up in the last day. On the site they got a quick
  //     first look (or were deferred by the credit guard); read them in full now.
  if (!only.size) try {
    const since = new Date(Date.now() - 26 * 60 * 60_000).toISOString();
    const { data, error } = await createGlobalServiceClient()
      .from("ad_intelligence_collection_jobs")
      .select("query,country,collection_key,user_id")
      .eq("platform", "meta")
      .eq("mode", "advertiser")
      .gte("last_requested_at", since)
      .neq("user_id", userId)
      .order("last_requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    let done = 0;
    for (const row of (data ?? []) as Array<{ query: string; country: string; collection_key: string; user_id: string | null }>) {
      if (timeLeft() < 4 * 60_000) break;
      const pageId = /\|page:(\d+)$/.exec(row.collection_key)?.[1] ?? null;
      if (collectedTonight(pageId, row.query)) continue; // tracked step just read it
      const result = await startAdSpyCollection({
        userId: row.user_id ?? userId,
        query: row.query,
        country: row.country || "IN",
        platform: "meta",
        mode: "advertiser",
        pageId,
        // Not again if read in full in the last 12 h (by any step).
        minIntervalMs: 12 * 60 * 60_000,
        reason: "scheduled",
        depth: "deep",
      });
      if (result.outcome !== "dispatched") continue;
      await drain();
      await copyMediaIfDue();
      done += 1;
    }
    console.log(`user look-ups read in full: ${done}/${(data ?? []).length}`);
  } catch (error) {
    stats.errors += 1;
    console.error("user look-ups failed:", error instanceof Error ? error.message : error);
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
    if (collectedTonight(page?.pageId, page?.name ?? brand)) {
      stats.skippedRecent += 1;
      console.log(`- ${brand}${page ? ` (${page.pageId})` : ""}: already read tonight`);
      return;
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
      console.log(`- ${brand}${page ? ` (${page.pageId})` : ""}: ${result.outcome}`);
      return;
    }
    const t0 = Date.now();
    await drain();
    stats.collected += 1;
    console.log(`+ ${brand} (${page?.pageId ?? "by name"}) in ${mins(Date.now() - t0)} min`);
    await copyMediaIfDue();
  };

  let attempted = 0;
  for (const brand of order) {
    if (attempted >= limit) break;
    if (timeLeft() < 4 * 60_000) {
      console.log(`time budget reached after ${mins(Date.now() - started)} min`);
      break;
    }
    if (!(await databaseReady())) {
      stats.errors += 1;
      console.error("! database unavailable for ~15 min: stopping; the remaining brands run next night");
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

      // Page memory first: a page this brand matched before is reused, so a
      // failed look-up tonight never costs us the brand. Pinned pages win.
      const key = normalizeAdvertiserName(brand);
      const known = memory.get(key);
      if (known) {
        stats.remembered += 1;
        await collect(brand, { pageId: known.pageId, name: known.name });
        continue;
      }

      // Identity boundary: one page with a clear lead, never a guess. Our
      // index first (no browser); Meta's live search adds likes/followers.
      const indexed = await fromIndex(brand, country);
      let match = pick(indexed.pages, brand);
      let liveFailed = false;
      let live: Page[] = [];
      if (!match.page) {
        live = await searchMetaPages(brand, country).catch(() => {
          liveFailed = true;
          return [] as Page[];
        });
        match = pick([...live, ...indexed.pages], brand);
      }
      let page: Page | undefined = match.page;
      if (page) {
        memory.remember(key, { pageId: page.pageId, name: page.name });
        memory.save();
        if (match.reason !== "exact") console.log(`  ${brand} -> ${page.name} (${page.pageId}) [${match.reason}]`);
      }
      // Nothing came back at all (DB timeout, Meta showed nothing, or the
      // brand truly has no page). Ambiguous names are NOT handled here: they
      // list their candidates below. Reuse the page we last collected this
      // brand from; a failed look-up must never cost us the brand.
      if (!page && !match.candidates.length) {
        const failed = indexed.failed || liveFailed;
        const last = await lastKnownPage(brand, country).catch(() => null);
        if (last) {
          console.log(`  ${brand}: ${failed ? "look-up failed" : "no page by name"}, using last collected page ${last.pageId}`);
          page = last;
        } else if (failed) {
          stats.lookupFailed += 1;
          console.log(`~ ${brand}: page look-up failed (database or Meta did not answer); retry next night`);
          continue;
        }
      }
      if (!page && match.candidates.length) {
        const list = match.candidates
          .map((c) => `${c.name} ${c.pageId}${c.verification ? ` ${c.verification}` : ""}${c.likes ? ` likes ${c.likes}` : ""}`)
          .join(" | ");
        console.log(`~ ${brand}: ${match.candidates.length} possible pages, pin one in seed "pages": ${list}`);
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

  memory.save();
  // Images left from the last hour: copy them before the links expire.
  await copyMedia(25 * 60_000, true);

  console.log("summary", JSON.stringify({ ...stats, minutes: mins(Date.now() - started) }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
