/**
 * Nightly AdSpy pre-fill (runs on GitHub Actions, not Vercel).
 *
 * 1. Refreshes every brand users track/watch (replaces the Vercel cron).
 * 2. Walks scripts/adspy-seed-brands.json, resolves each brand to its exact
 *    Meta Page ID, and collects its full public ad library ("deep").
 *
 * Runs collections in-process, one brand at a time, longest-unread first,
 * inside a time budget, so the 60-second Vercel limit does not apply. A
 * brand starts only when its full per-brand budget (ADSPY_WORKER_BUDGET_MS)
 * plus the final image copy still fit. Failed brands get one retry at the
 * end. Brands collected recently are skipped, so consecutive nights cover
 * different brands.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      ADSPY_SYSTEM_USER_ID, ADSPY_BROWSER=playwright,
 *      ADSPY_PREFILL_MINUTES (default 50), ADSPY_PREFILL_LIMIT (optional).
 */
import seed from "./adspy-seed-brands.json";

import { collectAdIntelligence } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import { setAdSpyInlineRunner } from "@/lib/ad-intelligence/jobs/dispatch-adspy-collection";
import type { CollectionResult } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import { startAdSpyCollection, type StartCollectionResult } from "@/lib/ad-intelligence/jobs/start-collection";
import { listTrackedAdSpyTargets, recoverAdSpyQueue, type TrackedTarget } from "@/lib/ad-intelligence/jobs/refresh-tracked-ad-spy";
import { sortOldestFirst } from "@/lib/ad-intelligence/global/scan-rules";
import { normalizeAdvertiserName, searchMetaPages } from "@/lib/ad-intelligence/global/meta-page-search";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { backfillAdMedia } from "@/lib/ad-intelligence/jobs/media-backfill";
import { pickBrandPage } from "@/lib/ad-intelligence/discovery/pick-page";
import { PageMemory, type MatchReason } from "@/lib/ad-intelligence/worker/page-memory";
import { notifyBrandReady } from "@/lib/ad-intelligence/jobs/notify-ready";

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
      // One indexed row, not count:"exact" (which counted the whole table).
      .select("id")
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
/** People already emailed "your brand is ready" in this run (max one each). */
const mailedTonight = new Set<string>();
const nameKey = (name: string) => `name:${normalizeAdvertiserName(name)}`;
/**
 * With a page ID, only that page counts: one brand can run ads from several
 * pages (Kapiva: 3), and each page needs its own full read. The name is
 * only used when the page is not known yet.
 */
const collectedTonight = (pageId: string | null | undefined, name: string) =>
  pageId ? doneTonight.has(`page:${pageId}`) : doneTonight.has(nameKey(name));

type DrainResult = { ok: boolean; failed: CollectionEvent[]; partial: boolean };

/**
 * Run what the last start queued (one brand). Success = every queued
 * collection was claimed here and finished without throwing. Only then is
 * the brand "done tonight"; a failure keeps its payload for one retry.
 */
async function drain(): Promise<DrainResult> {
  const out: DrainResult = { ok: false, failed: [], partial: false };
  let succeeded = 0;
  while (pending.length) {
    const payload = pending.shift()!;
    const result = await runPayload(payload);
    if (!result) {
      out.failed.push(payload);
      continue;
    }
    succeeded += 1;
    if (result.complete === false) out.partial = true;
  }
  out.ok = succeeded > 0 && out.failed.length === 0;
  return out;
}

async function runPayload(payload: CollectionEvent): Promise<CollectionResult | null> {
  // The scan itself must end in time for the final image copy.
  const deadlineAt = Date.now() + Math.max(60_000, timeLeft() - FINAL_RESERVE_MS);
  const result = await collectAdIntelligence(payload, { deadlineAt }).catch((error) => {
    console.error("  collection failed:", error instanceof Error ? error.message : error);
    return null;
  });
  if (!result || !result.claimed) {
    if (result && !result.claimed) console.warn("  collection not claimed (held elsewhere or already finished)");
    return null;
  }
  doneTonight.add(nameKey(payload.query));
  const pageId = result.pageId ?? payload.advertiserPageId ?? null;
  if (pageId) doneTonight.add(`page:${pageId}`);
  // Tell people who searched this brand for the first time that it's complete.
  if (pageId) {
    const mailed = await notifyBrandReady({ pageId, name: payload.query, country: payload.country || "IN", systemUserId: userId, mailedTonight }).catch(() => 0);
    if (mailed) console.log(`  emailed ${mailed} user(s): ${payload.query} is ready`);
  }
  return result;
}

const timeLeft = () => budgetMs - (Date.now() - started);
/** Per-brand scan budget (same env the collector uses; the PC sets 40 min). */
const BRAND_BUDGET_MS = Number(process.env.ADSPY_WORKER_BUDGET_MS) || 40 * 60_000;
/** Kept free at the end of the night for the last image copy. */
const FINAL_RESERVE_MS = 25 * 60_000;
/**
 * A new brand starts only if a full per-brand budget still fits before the
 * final image copy; otherwise Windows' task limit or the night's budget
 * would cut a scan (and its stop-marking) in half.
 */
const canStartBrand = () => timeLeft() > BRAND_BUDGET_MS + FINAL_RESERVE_MS;

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

type Outcome = "collected" | "skipped" | "failed";

/** A failed brand: tried once more at the end of the night if time remains. */
type Retry = { label: string; payloads: CollectionEvent[]; restart: () => Promise<StartCollectionResult> };

async function main() {
  if (!userId) throw new Error("Missing ADSPY_SYSTEM_USER_ID.");
  await patchBrowserForTsx();
  const stats = { tracked: 0, collected: 0, partial: 0, skippedRecent: 0, noPage: 0, lookupFailed: 0, remembered: 0, rechecked: 0, retried: 0, errors: 0 };
  const memory = new PageMemory();
  console.log(`page memory: ${memory.size} brands`);
  if (!(await databaseReady())) {
    console.error("! database unavailable for ~15 min at start: nothing collected tonight");
    console.log("summary", JSON.stringify({ ...stats, errors: 1, minutes: mins(Date.now() - started) }));
    return;
  }
  const retries: Retry[] = [];
  let stopReason: string | null = null;

  /** Before each brand: enough night left, and the database answering. */
  const mayStart = async (): Promise<boolean> => {
    if (stopReason) return false;
    if (!canStartBrand()) {
      stopReason = `time budget: ${mins(timeLeft())} min left, a brand needs ${mins(BRAND_BUDGET_MS + FINAL_RESERVE_MS)}`;
      console.log(`${stopReason} (after ${mins(Date.now() - started)} min)`);
      return false;
    }
    if (!(await databaseReady())) {
      stats.errors += 1;
      stopReason = "database unavailable";
      console.error("! database unavailable for ~15 min: stopping; the remaining brands run next night");
      return false;
    }
    return true;
  };

  /**
   * Start ONE brand and read it to the end before the next one. Counted as
   * collected only when the collection was claimed and finished here.
   */
  const runBrand = async (
    label: string,
    pageId: string | null,
    name: string,
    start: () => Promise<StartCollectionResult>,
  ): Promise<Outcome> => {
    if (collectedTonight(pageId, name)) {
      stats.skippedRecent += 1;
      console.log(`- ${label}: already read tonight`);
      return "skipped";
    }
    const t0 = Date.now();
    let result: StartCollectionResult;
    try {
      pending.length = 0;
      result = await start();
    } catch (error) {
      stats.errors += 1;
      console.error(`! ${label}: could not start:`, error instanceof Error ? error.message : error);
      retries.push({ label, payloads: [], restart: start });
      return "failed";
    }
    if (result.outcome !== "dispatched") {
      stats.skippedRecent += 1;
      console.log(`- ${label}: ${result.outcome}`);
      return "skipped";
    }
    const drained = await drain();
    if (!drained.ok) {
      stats.errors += 1;
      console.log(`! ${label}: failed after ${mins(Date.now() - t0)} min; one retry at the end if time remains`);
      retries.push({ label, payloads: drained.failed, restart: start });
      return "failed";
    }
    stats.collected += 1;
    if (drained.partial) stats.partial += 1;
    console.log(`+ ${label} in ${mins(Date.now() - t0)} min${drained.partial ? " (partial: read again first next time)" : ""}`);
    await copyMediaIfDue();
    return "collected";
  };

  // 1) Tracked / watched brands first — these are what paying users look at.
  //    One at a time, the longest-unread first, until the night runs out.
  //    (Skipped on a test run limited to a few brands.)
  if (!only.size) {
    let targets: TrackedTarget[] = [];
    try {
      await recoverAdSpyQueue();
      targets = await listTrackedAdSpyTargets();
    } catch (error) {
      stats.errors += 1;
      console.error("tracked brands could not be listed:", error instanceof Error ? error.message : error);
    }
    let done = 0;
    for (const target of targets) {
      if (!(await mayStart())) break;
      try {
        const outcome = await runBrand(
          `${target.query}${target.pageId ? ` (${target.pageId})` : ""} [${target.source}]`,
          target.pageId,
          target.query,
          () =>
            startAdSpyCollection({
              userId: target.userId,
              query: target.query,
              country: target.country,
              platform: "meta",
              mode: "advertiser",
              pageId: target.pageId,
              // Not again if read in full in the last 12 h (by any step).
              minIntervalMs: Math.min(12 * 60 * 60_000, RECENT_MS),
              reason: "scheduled",
              depth: "deep",
            }),
        );
        if (outcome === "collected") done += 1;
      } catch (error) {
        stats.errors += 1;
        console.error(`! tracked ${target.query}:`, error instanceof Error ? error.message : error);
      }
    }
    stats.tracked = done;
    console.log(`tracked brands read in full: ${done}/${targets.length}`);
  }

  // 1b) Brands users looked up in the last day. On the site they got a quick
  //     first look (or were deferred by the credit guard); read them in full now.
  if (!only.size && !stopReason) {
    let rows: Array<{ query: string; country: string; collection_key: string; user_id: string | null }> = [];
    try {
      const since = new Date(Date.now() - 26 * 60 * 60_000).toISOString();
      const { data, error } = await createGlobalServiceClient()
        .from("ad_intelligence_collection_jobs")
        .select("query,country,collection_key,user_id")
        .eq("platform", "meta")
        .eq("mode", "advertiser")
        .gte("last_requested_at", since)
        // .neq alone drops rows whose user_id is NULL (shared jobs).
        .or(`user_id.is.null,user_id.neq.${userId}`)
        .order("last_requested_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      rows = (data ?? []) as typeof rows;
    } catch (error) {
      stats.errors += 1;
      console.error("user look-ups could not be listed:", error instanceof Error ? error.message : error);
    }
    let done = 0;
    for (const row of rows) {
      const pageId = /\|page:(\d+)$/.exec(row.collection_key)?.[1] ?? null;
      if (collectedTonight(pageId, row.query)) continue; // tracked step just read it
      if (!(await mayStart())) break;
      try {
        const outcome = await runBrand(`${row.query}${pageId ? ` (${pageId})` : ""} [look-up]`, pageId, row.query, () =>
          startAdSpyCollection({
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
          }),
        );
        if (outcome === "collected") done += 1;
      } catch (error) {
        stats.errors += 1;
        console.error(`! look-up ${row.query}:`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`user look-ups read in full: ${done}/${rows.length}`);
  }

  // 2) Seed list, the longest-unread pages first.
  const seedData = seed as { country: string; brands: string[]; pages?: Record<string, string[]> };
  const country = seedData.country || "IN";
  // Brand -> Meta Page IDs checked by hand. Wins over name matching and lets
  // one brand cover several pages (Kapiva runs ads from 3 pages).
  const pinned = seedData.pages ?? {};
  const byName = process.env.ADSPY_PREFILL_BY_NAME === "1";
  const wanted = seedData.brands.filter((b) => !only.size || only.has(normalizeAdvertiserName(b)));
  const order = await seedOrder(wanted, pinned, memory, country);
  if (only.size) console.log(`only: ${order.join(", ") || "(no seed brand matched)"}`);

  const collect = (brand: string, page: Page | null) =>
    runBrand(`${brand} (${page?.pageId ?? "by name"})`, page?.pageId ?? null, page?.name ?? brand, () =>
      startAdSpyCollection({
        userId,
        query: page?.name ?? brand,
        country,
        platform: "meta",
        mode: "advertiser",
        pageId: page?.pageId ?? null,
        minIntervalMs: RECENT_MS,
        reason: "scheduled",
        depth: "deep",
      }),
    );

  let attempted = 0;
  for (const brand of order) {
    if (attempted >= limit) break;
    if (!(await mayStart())) break;
    attempted += 1;

    try {
      const ids = pinned[brand];
      if (ids?.length) {
        for (const pageId of ids) {
          if (!(await mayStart())) break;
          await collect(brand, { pageId, name: brand });
        }
        continue;
      }

      // Page memory first: a page this brand matched before is reused, so a
      // failed look-up tonight never costs us the brand. Pinned pages win.
      // Non-exact matches are checked again every 14 days.
      const key = normalizeAdvertiserName(brand);
      const known = memory.lookup(key);
      if (known && !known.recheck) {
        stats.remembered += 1;
        await collect(brand, { pageId: known.page.pageId, name: known.page.name });
        continue;
      }
      if (known?.recheck) stats.rechecked += 1;

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
        memory.remember(key, { pageId: page.pageId, name: page.name, reason: matchReason(match.reason, page) });
        memory.save();
        if (match.reason !== "exact") console.log(`  ${brand} -> ${page.name} (${page.pageId}) [${match.reason}]`);
        if (known && known.page.pageId !== page.pageId) console.log(`  ${brand}: page changed on re-check ${known.page.pageId} -> ${page.pageId}`);
      }
      // Re-check found nothing (look-up failed or no clear page): keep using
      // the remembered page rather than losing the brand.
      if (!page && known) {
        console.log(`  ${brand}: re-check inconclusive, keeping remembered page ${known.page.pageId}`);
        page = { pageId: known.page.pageId, name: known.page.name };
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
          await logUnresolved(brand, "lookup_failed");
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
        await logUnresolved(brand, match.candidates.length ? `ambiguous: ${match.candidates.map((c) => c.pageId).join(",")}` : "no_page");
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

  // 3) One more try for brands that failed tonight, while time remains.
  for (const retry of retries) {
    if (!(await mayStart())) break;
    stats.retried += 1;
    try {
      const t0 = Date.now();
      // The failed request usually waits as "retrying": run it again as is.
      let ok = false;
      let partial = false;
      if (retry.payloads.length) {
        pending.length = 0;
        let claimedAll = true;
        for (const payload of retry.payloads) {
          const result = await runPayload(payload);
          if (!result) claimedAll = false;
          else if (result.complete === false) partial = true;
        }
        ok = claimedAll;
      }
      // Not claimable (request closed): start it afresh.
      if (!ok) {
        pending.length = 0;
        const result = await retry.restart();
        if (result.outcome === "dispatched") {
          const drained = await drain();
          ok = drained.ok;
          partial = drained.partial;
        } else {
          console.log(`- retry ${retry.label}: ${result.outcome}`);
          continue;
        }
      }
      if (ok) {
        stats.collected += 1;
        if (partial) stats.partial += 1;
        console.log(`+ retry ${retry.label} in ${mins(Date.now() - t0)} min`);
        await copyMediaIfDue();
      } else {
        console.log(`! retry ${retry.label}: failed again; next night`);
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`! retry ${retry.label}:`, error instanceof Error ? error.message : error);
    }
  }

  memory.save();
  // Images left from the last hour: copy them before the links expire,
  // within what is left of the night (2 min kept for the summary/exit).
  await copyMedia(Math.min(FINAL_RESERVE_MS, timeLeft() - 2 * 60_000), true);

  console.log("summary", JSON.stringify({ ...stats, minutes: mins(Date.now() - started) }));
}

/** pickBrandPage's reason -> what page memory keeps ("exact" is never re-checked). */
function matchReason(reason: string, page: Page): MatchReason {
  if (reason === "exact") return "exact";
  return page.verification ? "verified" : "lead";
}

/**
 * Seed brands ordered by their pages' last finished read, oldest (or never)
 * first, instead of a daily rotation. One read: the system user's finished
 * page collections (index on user_id). A failed read keeps the file order.
 */
async function seedOrder(
  brands: string[],
  pinned: Record<string, string[]>,
  memory: PageMemory,
  country: string,
): Promise<string[]> {
  const byPage = new Map<string, string>();
  const byName = new Map<string, string>();
  try {
    const client = createGlobalServiceClient();
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error } = await client
        .from("ad_intelligence_collection_jobs")
        .select("collection_key,completed_at")
        .eq("user_id", userId)
        .eq("platform", "meta")
        .eq("mode", "advertiser")
        .eq("country", country)
        .not("completed_at", "is", null)
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ collection_key: string; completed_at: string }>;
      for (const row of rows) {
        const pageId = /\|page:(\d+)$/.exec(row.collection_key)?.[1];
        const map = pageId ? byPage : byName;
        const key = pageId ?? normalizeAdvertiserName(row.collection_key.split("|")[3] ?? "");
        const prev = map.get(key);
        if (!prev || row.completed_at > prev) map.set(key, row.completed_at);
      }
      if (rows.length < 1000) break;
    }
  } catch (error) {
    console.warn("  seed order: last read times unavailable, using file order:", error instanceof Error ? error.message : error);
    return brands;
  }
  const lastRead = (brand: string): string | null => {
    const pages = pinned[brand]?.length ? pinned[brand] : [memory.get(normalizeAdvertiserName(brand))?.pageId].filter((p): p is string => Boolean(p));
    if (!pages.length) return byName.get(normalizeAdvertiserName(brand)) ?? null;
    // Several pages: the brand is as old as its oldest page.
    let oldest: string | null = null;
    for (const pageId of pages) {
      const at = byPage.get(pageId);
      if (!at) return null;
      if (!oldest || at < oldest) oldest = at;
    }
    return oldest;
  };
  return sortOldestFirst(brands, lastRead);
}

/** Seed brands with no page: listed for the founder page later. Best effort. */
async function logUnresolved(name: string, reason: string): Promise<void> {
  try {
    const { error } = await createGlobalServiceClient()
      .from("adspy_unresolved_brands")
      .upsert({ name: name.slice(0, 200), reason: reason.slice(0, 500), last_seen_at: new Date().toISOString() }, { onConflict: "name" });
    if (error && !/42P01|PGRST205|does not exist|could not find the table/i.test(`${error.code ?? ""} ${error.message}`)) {
      console.warn(`  unresolved brand not logged (${name}):`, error.message);
    }
  } catch {
    // never fails the night
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
