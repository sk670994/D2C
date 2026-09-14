import "server-only";

import path from "node:path";
import { existsSync } from "node:fs";

import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import chromium from "@sparticuz/chromium-min";

import type { AdProvider, AdSearchInput, ProviderResult } from "../provider";
import type { AdCreativeType, CompetitorAd } from "../types";
import {
  normalizeExtractedText,
  normalizeWhitespace,
  repairMojibake,
} from "../meta/text";
import {
  calculateRunningDays,
  extractActiveStatus,
  extractAdvertiserIdentity,
  extractCallToAction,
  extractDateRange,
  extractOffer,
  extractPrimaryText,
  extractProductName,
  parsePrice,
} from "../meta/parser";

const META_LIBRARY_URL = "https://www.facebook.com/ads/library/";
const DEFAULT_COUNTRY = "IN";
const QUICK_MAX_SCROLLS = 14;
const QUICK_TARGET = 24;
const QUICK_STABLE_ROUNDS = 3;
const DEEP_MAX_SCROLLS = 360;
const DEEP_TARGET = 1200;
const DEEP_STABLE_ROUNDS = 18;
const NAV_TIMEOUT = 45_000;
const INITIAL_WAIT = 2_500;
const SCROLL_WAIT = 650;
const CTA_VALUES = [
  "Shop Now", "Learn More", "Sign Up", "Buy Now", "Install Now", "Book Now",
  "Contact Us", "Get Offer", "Apply Now", "Download", "Subscribe", "Order Now",
  "Message Now", "Send Message", "Get Directions", "Call Now", "Watch More",
  "Listen Now", "Play Game", "Use App", "अभी खरीदें", "और जानें", "साइन अप करें",
  "अभी इंस्टॉल करें", "संदेश भेजें",
] as const;

type RawCard = {
  id: string;
  rawLines: string[];
  links: Array<{ href: string; text: string }>;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  videoDurationSeconds: number | null;
  publisherPlatforms: string[];
};

let browser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

function getLocalExecutable(): string {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.EDGE_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  for (const candidate of candidates) {
    try {
      if (/^file:\/\//i.test(candidate)) continue;
      const resolved = path.resolve(candidate);
      if (existsSync(resolved)) return resolved;
    } catch {
      // try the next candidate
    }
  }

  throw new Error("No local Chrome/Edge executable found. Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH.");
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = null;
  if (!browserPromise) {
    browserPromise = (async () => {
      const local = process.platform === "win32" || process.env.IS_LOCAL === "true";
      let executablePath: string;
      let args: string[];
      if (local) {
        executablePath = getLocalExecutable();
        args = ["--disable-dev-shm-usage", "--disable-gpu"];
      } else {
        const packUrl = process.env.CHROMIUM_PACK_URL?.trim();
        if (!packUrl || !/^https?:\/\//i.test(packUrl)) {
          throw new Error("CHROMIUM_PACK_URL must be an HTTP/HTTPS URL in production.");
        }
        executablePath = await chromium.executablePath(packUrl);
        args = [...chromium.args, "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"];
      }
      const next = await playwrightChromium.launch({ executablePath, args, headless: true });
      next.on("disconnected", () => {
        if (browser === next) browser = null;
      });
      browser = next;
      return next;
    })().finally(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

function buildLibraryUrl(input: AdSearchInput): string {
  const country = (input.country ?? DEFAULT_COUNTRY).trim().toUpperCase();
  const activeStatus = input.collectionDepth === "deep" ? "all" : "active";
  const params = new URLSearchParams({
    active_status: activeStatus,
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
  });

  const pageId = input.advertiserPageId?.trim();
  if (pageId && /^\d+$/.test(pageId) && input.mode !== "keyword") {
    params.set("search_type", "page");
    params.set("view_all_page_id", pageId);
  } else {
    params.set("search_type", "keyword_unordered");
    params.set("q", input.query.trim());
  }
  return `${META_LIBRARY_URL}?${params.toString()}`;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedText(value: string | null | undefined): string {
return (repairMojibake(normalizeExtractedText(value ?? "")) ?? "").trim();
}

function normalizeMatch(value: string | null | undefined): string {
  return normalizedText(value).toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function isLikelyChallenge(text: string): boolean {
  const t = text.toLowerCase();
  return [
    "log in to facebook",
    "you must log in",
    "security check",
    "unusual activity",
    "confirm you are not a robot",
    "temporarily blocked",
  ].some((x) => t.includes(x));
}

async function extractVisibleCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const clean = (v: string) => v.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    const getId = (v: string) => v.match(/(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i)?.[1] ?? null;
    const countIds = (el: Element) => {
      const all = (el.textContent ?? "").match(/(?:Library ID|लाइब्रेरी ID):\s*\d+/gi) ?? [];
      return new Set(all.map((x) => x.match(/(\d+)/)?.[1] ?? "")).size;
    };
    const cards = new Map<string, Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const id = getId(node.textContent ?? "");
      if (id) {
        let el = node.parentElement;
        let best: Element | null = null;
        for (let depth = 0; depth < 16 && el; depth += 1) {
          const text = el.textContent?.trim() ?? "";
          const ids = countIds(el);
          if (ids === 1 && text.length >= 60 && text.length <= 30_000) best = el;
          if (ids > 1) break;
          el = el.parentElement;
        }
        if (best) cards.set(id, best);
      }
      node = walker.nextNode();
    }
    if (!cards.size) {
      for (const el of Array.from(document.querySelectorAll('article,[role="article"],[data-testid*="ad" i]'))) {
        const id = getId(el.textContent ?? "");
        if (id) cards.set(id, el);
      }
    }
    const platformNames = ["Facebook", "Instagram", "Messenger", "Audience Network", "Threads"];
    return Array.from(cards.entries()).map(([id, card]) => {
      const rawLines = ((card as HTMLElement).innerText ?? "").split(/\r?\n/).map(clean).filter(Boolean);
      const links = Array.from(card.querySelectorAll("a[href]"))
        .map((a) => {
          const href = a.getAttribute("href");
          if (!href || href.startsWith("javascript:")) return null;
          try {
            return { href: new URL(href, window.location.href).toString(), text: clean(a.textContent ?? "") };
          } catch { return null; }
        })
        .filter((x): x is { href: string; text: string } => Boolean(x));
      const video = card.querySelector("video") as HTMLVideoElement | null;
      const img = card.querySelector("img") as HTMLImageElement | null;
      const source = video?.querySelector("source[src]")?.getAttribute("src") ?? null;
      const imgCandidates = Array.from(card.querySelectorAll("img"))
        .map((x) => x.getAttribute("src") || x.getAttribute("data-src") || x.getAttribute("data-original"))
        .filter((x): x is string => Boolean(x));
      const joined = rawLines.join(" ").toLowerCase();
      return {
        id,
        rawLines,
        links,
        imageUrl: imgCandidates[0] ?? img?.currentSrc ?? img?.src ?? null,
        videoUrl: video?.currentSrc || source || video?.getAttribute("src") || null,
        thumbnailUrl: video?.poster || imgCandidates[0] || null,
        videoDurationSeconds: video && Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null,
        publisherPlatforms: platformNames.filter((name) => joined.includes(name.toLowerCase())),
      };
    });
  });
}

function destinationFromLinks(links: RawCard["links"]): string | null {
  for (const link of links) {
    const url = normalizeUrl(link.href);
    if (!url) continue;
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("facebook.com/ads") || host.includes("facebook.com")) continue;
    if (host.includes("instagram.com")) continue;
    return url;
  }
  return links.map((x) => normalizeUrl(x.href)).find(Boolean) ?? null;
}

function inferHeadline(lines: string[], primaryText: string | null, cta: string | null): string | null {
  for (const line of lines) {
    if (!line || line === primaryText || line === cta) continue;
    if (/^(Library ID|लाइब्रेरी ID):\s*\d+$/i.test(line)) continue;
    if (/^(Active|Inactive|Image|Video|Carousel)$/i.test(line)) continue;
    if (/^\d+:\d{2}\s*\/\s*\d+:\d{2}$/.test(line)) continue;
    if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 140) return line;
  }
  return null;
}

function normalizeCard(card: RawCard, input: AdSearchInput, sourceUrl: string): CompetitorAd | null {
  const lines = card.rawLines.map(normalizedText).filter(Boolean);
  if (!lines.length) return null;
  const identity = extractAdvertiserIdentity(lines);
  const primaryText = extractPrimaryText(lines) || null;
  const cta = extractCallToAction(lines, CTA_VALUES) || null;
  const dates = extractDateRange(lines);
  const isActive = extractActiveStatus(lines);
  const productName = extractProductName(lines) || null;
  const offer = extractOffer(primaryText,lines) || null;
  const landingPage = destinationFromLinks(card.links);
  const imageUrl = normalizeUrl(card.imageUrl);
  const videoUrl = normalizeUrl(card.videoUrl);
  const thumbnailUrl = normalizeUrl(card.thumbnailUrl) || imageUrl;
  const creativeType: AdCreativeType = videoUrl ? "video" : imageUrl ? "image" : "unknown";
  const runningDays = calculateRunningDays(dates.firstSeen, dates.lastSeen);
  const compactCopy = normalizeWhitespace(primaryText ?? "");
  const price = parsePrice(lines.join(" "));

  if (!identity.advertiserName && !primaryText && !landingPage) return null;

  return {
    id: card.id,
    platform: "meta",
    advertiserName: normalizedText(identity.advertiserName) || input.query.trim(),
    advertiserId: input.advertiserPageId ?? null,
    creatorName: normalizedText(identity.creatorName) || null,
    partnershipType: identity.partnershipType,
    country: (input.country ?? DEFAULT_COUNTRY).toUpperCase(),
    creativeType,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    videoDurationSeconds: card.videoDurationSeconds,
    primaryText: compactCopy || null,
    headline: inferHeadline(lines, primaryText, cta),
    description: null,
    callToAction: cta,
    firstSeen: dates.firstSeen,
    lastSeen: dates.lastSeen,
    isActive,
    publisherPlatforms: card.publisherPlatforms.length ? card.publisherPlatforms : ["Facebook", "Instagram"],
    landingPage,
    sourceUrl,
    productName,
    productPrice: price,
    currency: price != null ? "INR" : null,
    offer,
    runningDays,
    transcript: null,
    transcriptStatus: creativeType === "video" ? "unavailable" : "not_video",
    metricSources: {
      creativeScore: "derived",
      longevityScore: "derived",
      relevanceScore: "derived",
      engagementPotentialScore: "unavailable",
      reach: "unavailable",
      clicks: "unavailable",
      ctr: "unavailable",
      impressions: "unavailable",
    },
    longevityScore: Math.min(100, runningDays > 0 ? 25 + Math.min(75, runningDays * 1.25) : 0),
    relevanceScore: 0,
    engagementPotentialScore: 0,
    intelligence: { rankingReasons: [], badges: [] },
    metadata: {
      extractionMethod: "meta-library-dom-v3",
      providerSource: "meta_ad_library",
      collectedAt: new Date().toISOString(),
      searchMode: input.mode ?? "advertiser",
      collectionDepth: input.collectionDepth ?? "deep",
    },
  };
}

function isRelevant(ad: CompetitorAd, input: AdSearchInput): boolean {
  if (input.advertiserPageId) return true;
  if ((input.mode ?? "advertiser") === "keyword") return true;
  const q = normalizeMatch(input.query);
  if (!q) return true;
  const haystack = normalizeMatch([ad.advertiserName, ad.primaryText, ad.headline, ad.productName, ad.offer, ad.landingPage].filter(Boolean).join(" "));
  return haystack.includes(q) || q.split(" ").filter(Boolean).every((token) => haystack.includes(token));
}

function dedupeAds(ads: CompetitorAd[]): CompetitorAd[] {
  const seen = new Set<string>();
  const result: CompetitorAd[] = [];
  for (const ad of ads) {
    const fingerprint = [
      ad.id,
      ad.advertiserName,
      ad.headline,
      ad.primaryText,
      ad.callToAction,
      ad.landingPage,
      ad.creativeType,
      ad.imageUrl,
      ad.videoUrl,
    ].map((v) => normalizeMatch(String(v ?? ""))).join("|");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(ad);
  }
  return result;
}

async function clickPaginationControls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button, [role="button"], a[role="button"]',
      ),
    );

    const labels = [
      "see more ads",
      "load more ads",
      "more ads",
      "show more ads",
      "load more",
      "see more",
    ];

    let clicked = 0;
    for (const element of candidates) {
      const text = (element.innerText || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (!text || !labels.some((label) => text === label || text.includes(label))) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight;

      if (!visible) continue;

      element.click();
      clicked += 1;
      if (clicked >= 3) break;
    }

    return clicked;
  }).catch(() => 0);
}

async function scrollToRevealMore(page: Page): Promise<{
  moved: boolean;
  scrollHeight: number;
  maxScrollTop: number;
}> {
  return page.evaluate(() => {
    const beforeY = window.scrollY;
    const beforeHeight = document.documentElement.scrollHeight;

    const scrollables = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (!["auto", "scroll"].includes(style.overflowY)) return false;
        return element.scrollHeight > element.clientHeight + 240;
      })
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));

    const primary = scrollables[0];

    if (primary) {
      const nextTop = Math.min(
        primary.scrollTop + Math.max(primary.clientHeight * 0.82, 850),
        primary.scrollHeight - primary.clientHeight,
      );
      primary.scrollTop = nextTop;
    }

    window.scrollBy({
      top: Math.max(window.innerHeight * 0.92, 820),
      behavior: "instant",
    });

    const afterY = window.scrollY;
    const afterHeight = Math.max(
      document.documentElement.scrollHeight,
      primary?.scrollHeight ?? 0,
    );

    return {
      moved: afterY !== beforeY || afterHeight !== beforeHeight,
      scrollHeight: afterHeight,
      maxScrollTop: Math.max(
        0,
        afterHeight - window.innerHeight,
      ),
    };
  }).catch(() => ({
    moved: false,
    scrollHeight: 0,
    maxScrollTop: 0,
  }));
}

async function scrapeOnce(input: AdSearchInput): Promise<CompetitorAd[]> {
  const pageUrl = buildLibraryUrl(input);
  const quick = input.collectionDepth !== "deep";
  const maxScrolls = quick ? QUICK_MAX_SCROLLS : DEEP_MAX_SCROLLS;
  const target = quick ? QUICK_TARGET : DEEP_TARGET;
  const stableTarget = quick ? QUICK_STABLE_ROUNDS : DEEP_STABLE_ROUNDS;

  const b = await getBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await b.newContext({
      locale: "en-IN",
      viewport: { width: 1440, height: 1000 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
    });
    await context.route("**/*", async (route) => {
      const resource = route.request().resourceType();
      if (["font", "media"].includes(resource)) return route.continue();
      if (["websocket"].includes(resource)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(INITIAL_WAIT);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (isLikelyChallenge(bodyText)) {
      throw new Error("Meta Ad Library is not accessible from the collector session. The source returned a login/security/challenge page.");
    }

    const collected = new Map<string, CompetitorAd>();
    let stableRounds = 0;
    let previousCount = 0;
    let previousScrollHeight = 0;
    let previousMaxScrollTop = 0;
    let lastProgressAt = Date.now();

    for (let scroll = 0; scroll <= maxScrolls; scroll += 1) {
      // Meta's Ad Library can virtualize the results list. We therefore
      // accumulate IDs across scroll positions instead of assuming the
      // current DOM contains the whole dataset.
      const raw = await extractVisibleCards(page);

      let added = 0;
      for (const card of raw) {
        const ad = normalizeCard(card, input, page.url() || pageUrl);
        if (!ad || !isRelevant(ad, input)) continue;

        if (!collected.has(ad.id)) {
          collected.set(ad.id, ad);
          added += 1;
        }
      }

      // Some versions of the library expose an explicit paging control
      // instead of only lazy-loading when the scroll position changes.
      const clicked = quick ? 0 : await clickPaginationControls(page);
      if (clicked > 0) {
        await page.waitForTimeout(Math.min(900, SCROLL_WAIT));
      }

      if (collected.size >= target) break;

      const movement = await scrollToRevealMore(page);
      const madeProgress =
        added > 0 ||
        clicked > 0 ||
        movement.moved ||
        movement.scrollHeight > previousScrollHeight ||
        movement.maxScrollTop > previousMaxScrollTop;

      if (madeProgress) {
        stableRounds = 0;
        lastProgressAt = Date.now();
      } else if (collected.size === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previousCount = collected.size;
      previousScrollHeight = movement.scrollHeight;
      previousMaxScrollTop = movement.maxScrollTop;

      // Quick search should remain fast. Deep search should only stop after
      // a much longer genuine plateau, not after a handful of virtualized
      // DOM passes.
      if (quick && stableRounds >= stableTarget) break;

      if (
        !quick &&
        stableRounds >= stableTarget &&
        Date.now() - lastProgressAt > stableTarget * SCROLL_WAIT
      ) {
        break;
      }

      await page.waitForTimeout(SCROLL_WAIT);
    }

    // Final deep pass: a small extra tail sweep catches cards that were
    // inserted after the last scroll event or after a "See more" click.
    if (!quick) {
      for (let tail = 0; tail < 4; tail += 1) {
        await page.waitForTimeout(400);
        await clickPaginationControls(page);
        const tailRaw = await extractVisibleCards(page);
        for (const card of tailRaw) {
          const ad = normalizeCard(card, input, page.url() || pageUrl);
          if (ad && isRelevant(ad, input)) collected.set(ad.id, ad);
        }
        await scrollToRevealMore(page);
      }
    }

    const finalRaw = await extractVisibleCards(page);
    for (const card of finalRaw) {
      const ad = normalizeCard(card, input, page.url() || pageUrl);
      if (ad && isRelevant(ad, input)) collected.set(ad.id, ad);
    }

    return dedupeAds(Array.from(collected.values())).sort((a, b) => {
      const active = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
      if (active) return active;
      return Number(b.runningDays ?? 0) - Number(a.runningDays ?? 0);
    });
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

export const deepMetaProvider: AdProvider = {
  platform: "meta",
  async search(input: AdSearchInput): Promise<ProviderResult> {
    const normalized: AdSearchInput = {
      ...input,
      query: input.query.trim(),
      country: (input.country ?? DEFAULT_COUNTRY).trim().toUpperCase(),
      mode: input.mode === "keyword" ? "keyword" : "advertiser",
      collectionDepth: input.collectionDepth === "quick" ? "quick" : "deep",
      advertiserPageId: input.advertiserPageId?.trim() || null,
    };

    if (normalized.query.length < 2) return { ads: [] };

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const ads = await scrapeOnce(normalized);
        console.info("[MetaProvider] collection complete", {
          attempt,
          query: normalized.query,
          pageId: normalized.advertiserPageId ?? null,
          depth: normalized.collectionDepth,
          count: ads.length,
        });
        return { ads };
      } catch (error) {
        lastError = error;
        console.error("[MetaProvider] collection attempt failed", {
          attempt,
          query: normalized.query,
          pageId: normalized.advertiserPageId ?? null,
          depth: normalized.collectionDepth,
          error: error instanceof Error ? error.message : error,
        });
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Meta collection failed.");
  },
};
