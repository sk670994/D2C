/**
 * Meta ad API proof of concept: SearchApi and/or ScrapeCreators, compared.
 * READ-ONLY: calls SearchApi and reads our database; writes nothing.
 *
 *   npx tsx scripts/ops/searchapi-benchmark.ts
 *   npx tsx scripts/ops/searchapi-benchmark.ts --page 619181354927737 --brand "boAt" --brand "Minimalist"
 *   npx tsx scripts/ops/searchapi-benchmark.ts --max-pages 10      # cap billed calls per brand
 *   npx tsx scripts/ops/searchapi-benchmark.ts --source scrapecreators   # or searchapi (default: every source with a key)
 *
 * Needs SEARCHAPI_API_KEY and/or SCRAPECREATORS_API_KEY plus the Supabase keys in worker\.env.
 * Default brands: Mamaearth (exact page) + boAt + Minimalist (resolved by name).
 * Uses about 20-60 calls in total; the free trial has 100.
 *
 * For each brand it prints: Meta's total vs what SearchApi returned, active
 * count, formats, how often media/copy/CTA/link/dates are present, duplicates,
 * calls, seconds, overlap with the ads we already hold, and a monthly cost
 * estimate. Writes the same as JSON to qa-report/searchapi-benchmark.json.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  fetchSearchApiPage,
  matchesBrandName,
  resolvePageViaSearchApi,
  searchApiRequestBody,
  sourceUrlFor,
  toLibraryNode,
  type SearchApiPage,
} from "../../lib/ad-intelligence/sources/searchapi-meta";
import {
  fetchScrapeCreatorsPage,
  resolvePageViaScrapeCreators,
  scrapeCreatorsRequest,
} from "../../lib/ad-intelligence/sources/scrapecreators-meta";
import { libraryNodeToAd } from "../../lib/ad-intelligence/meta/node-to-ad";
import type { CompetitorAd } from "../../lib/ad-intelligence/types";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadEnvFile(join(process.cwd(), "worker", ".env"));
loadEnvFile(join(process.cwd(), ".env.local"));

const args = process.argv.slice(2);
const values = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const MAX_PAGES = Number(values("--max-pages")[0]) || 25;
const COUNTRY = (values("--country")[0] || "IN").toUpperCase();
const pages = values("--page");
const names = values("--brand");
const targets: Array<{ label: string; pageId: string | null; name: string | null }> =
  pages.length || names.length
    ? [...pages.map((p) => ({ label: `page ${p}`, pageId: p, name: null })), ...names.map((n) => ({ label: n, pageId: null, name: n }))]
    : [
        { label: "Mamaearth", pageId: "619181354927737", name: null },
        { label: "boAt", pageId: null, name: "boAt" },
        { label: "Minimalist", pageId: null, name: "Minimalist" },
      ];

const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "") || null;
const keys = { searchapi: clean(process.env.SEARCHAPI_API_KEY), scrapecreators: clean(process.env.SCRAPECREATORS_API_KEY) };
type SourceName = keyof typeof keys;
type Source = {
  name: SourceName;
  resolve: (name: string, country: string) => Promise<{ pageId: string; name: string } | null>;
  page: (input: { query: string; country: string; advertiserPageId: string | null }, token: string | null) => Promise<SearchApiPage>;
};
const SOURCES: Record<SourceName, (key: string) => Source> = {
  searchapi: (apiKey) => ({
    name: "searchapi",
    resolve: (n, c) => resolvePageViaSearchApi(n, c, { apiKey }),
    page: (input, token) => fetchSearchApiPage(searchApiRequestBody(input, { activeStatus: "all", nextPageToken: token }), { apiKey }),
  }),
  scrapecreators: (apiKey) => ({
    name: "scrapecreators",
    resolve: (n, c) => resolvePageViaScrapeCreators(n, c, { apiKey }),
    page: (input, token) => fetchScrapeCreatorsPage(scrapeCreatorsRequest(input, { activeStatus: "all", cursor: token }), { apiKey }),
  }),
};
const wanted = values("--source")[0] as SourceName | undefined;
const sources = (Object.keys(keys) as SourceName[]).filter((n) => keys[n] && (!wanted || n === wanted)).map((n) => SOURCES[n](keys[n]!));
if (!sources.length) {
  console.error("Add SEARCHAPI_API_KEY and/or SCRAPECREATORS_API_KEY to worker\\.env (no quotes).");
  process.exit(1);
}
const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = supaUrl && supaKey ? createClient(supaUrl, supaKey, { auth: { persistSession: false } }) : null;

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");

type BrandReport = Record<string, unknown>;

async function benchmark(source: Source, target: (typeof targets)[number]): Promise<BrandReport> {
  let calls = 0;
  let pageId = target.pageId;
  let resolvedName: string | null = null;
  if (!pageId && target.name) {
    calls += 1;
    const page = await source.resolve(target.name, COUNTRY);
    pageId = page?.pageId ?? null;
    resolvedName = page?.name ?? null;
  }
  const input = { query: target.name ?? target.label, country: COUNTRY, mode: "advertiser" as const, advertiserPageId: pageId };
  const sourceUrl = sourceUrlFor(input);

  const started = Date.now();
  const callMs: number[] = [];
  const ads: CompetitorAd[] = [];
  const ids = new Set<string>();
  let duplicates = 0;
  let dropped = 0;
  let total: number | null = null;
  let token: string | null = null;
  let stoppedBy = "exhausted";
  let error: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    try {
      const res = await source.page(input, token);
      calls += 1;
      callMs.push(res.ms);
      if (res.totalResults != null) total = res.totalResults;
      for (const raw of res.ads) {
        const ad = libraryNodeToAd(toLibraryNode(raw), input, sourceUrl, total, { providerSource: source.name });
        if (!ad || !matchesBrandName(ad, input)) {
          dropped += 1;
          continue;
        }
        if (ids.has(ad.id)) duplicates += 1;
        else {
          ids.add(ad.id);
          ads.push(ad);
        }
      }
      token = res.nextPageToken;
      if (!token || res.ads.length === 0) break;
      if (page === MAX_PAGES - 1) stoppedBy = `max_pages (${MAX_PAGES})`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      stoppedBy = "error";
      break;
    }
  }
  const seconds = (Date.now() - started) / 1000;

  // What we already hold for this page (read-only).
  let ours: number | null = null;
  let overlap: number | null = null;
  if (db && pageId) {
    const { count } = await db.from("ad_intelligence_creatives").select("id", { count: "exact", head: true }).eq("platform", "meta").eq("advertiser_id", pageId);
    ours = count ?? null;
    const keys = Array.from(ids).map((id) => `meta:${id}`);
    let found = 0;
    for (let i = 0; i < keys.length; i += 200) {
      const { count: c } = await db.from("ad_intelligence_creatives").select("id", { count: "exact", head: true }).in("external_ad_key", keys.slice(i, i + 200));
      found += c ?? 0;
    }
    overlap = found;
  }

  const n = ads.length;
  const has = (f: (a: CompetitorAd) => unknown) => ads.filter((a) => Boolean(f(a))).length;
  const formats = ads.reduce<Record<string, number>>((m, a) => ((m[a.creativeType ?? "unknown"] = (m[a.creativeType ?? "unknown"] ?? 0) + 1), m), {});
  const avgMs = callMs.length ? Math.round(callMs.reduce((a, b) => a + b, 0) / callMs.length) : null;
  // Nightly refresh ~ one full read per brand per day (upper bound).
  const callsPerMonth = Math.max(1, calls) * 30;

  return {
    source: source.name,
    brand: target.label,
    pageId,
    resolvedName,
    metaTotal: total,
    searchApiAds: n,
    completeness: total ? pct(n, total) : "-",
    active: has((a) => a.isActive === true),
    formats,
    withMedia: pct(has((a) => a.imageUrl || a.videoUrl || a.thumbnailUrl), n),
    withVideoFile: pct(has((a) => a.videoUrl), n),
    withCopy: pct(has((a) => a.primaryText), n),
    withCta: pct(has((a) => a.callToAction), n),
    withLanding: pct(has((a) => a.landingPage), n),
    withStartDate: pct(has((a) => a.firstSeen), n),
    duplicates,
    droppedOtherAdvertisers: dropped,
    calls,
    seconds: Math.round(seconds),
    avgMsPerCall: avgMs,
    stoppedBy,
    error,
    oursIndexed: ours,
    overlapWithOurs: overlap,
    newToUs: overlap == null ? null : n - overlap,
    estCallsPerMonthDailyFullRead: callsPerMonth,
    // SearchApi Developer ≈ $4 / 1k calls; ScrapeCreators ≈ $1.88 / 1k credits.
    estUsdPerMonth: Math.round(callsPerMonth * (source.name === "scrapecreators" ? 0.00188 : 0.004) * 100) / 100,
    sample: ads.slice(0, 2).map((a) => ({ id: a.id, type: a.creativeType, text: (a.primaryText ?? "").slice(0, 80), cta: a.callToAction, start: a.firstSeen, active: a.isActive })),
  };
}

async function main() {
  console.log(`SearchApi benchmark · country ${COUNTRY} · max ${MAX_PAGES} pages per brand\n`);
  const reports: BrandReport[] = [];
  for (const source of sources) for (const target of targets) {
    process.stdout.write(`${source.name} · ${target.label} ... `);
    const r = await benchmark(source, target);
    reports.push(r);
    console.log(`${r.searchApiAds} ads of Meta's ${r.metaTotal ?? "?"} in ${r.calls} calls, ${r.seconds}s${r.error ? ` · ERROR ${r.error}` : ""}`);
  }
  console.log("");
  console.table(
    reports.map((r) => ({
      source: r.source,
      brand: r.brand,
      meta: r.metaTotal,
      got: r.searchApiAds,
      complete: r.completeness,
      active: r.active,
      media: r.withMedia,
      copy: r.withCopy,
      cta: r.withCta,
      link: r.withLanding,
      dates: r.withStartDate,
      calls: r.calls,
      secs: r.seconds,
      ours: r.oursIndexed,
      overlap: r.overlapWithOurs,
      new: r.newToUs,
    })),
  );
  const totalCalls = reports.reduce((s, r) => s + Number(r.calls ?? 0), 0);
  console.log(`Calls used: ${totalCalls}. Full JSON: qa-report/searchapi-benchmark.json`);
  mkdirSync("qa-report", { recursive: true });
  writeFileSync("qa-report/searchapi-benchmark.json", JSON.stringify({ at: new Date().toISOString(), country: COUNTRY, maxPages: MAX_PAGES, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
