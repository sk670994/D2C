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

import type {
  AdProvider,
  AdSearchInput,
  ProviderResult,
} from "../provider";

import type {
  AdCreativeType,
  CompetitorAd,
} from "../types";

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

/* =========================================================
 * CONSTANTS
 * ======================================================= */

const DEFAULT_COUNTRY = "IN";

const INITIAL_WAIT_MS = 1800;
const SCROLL_WAIT_MS = 375;
const POST_SCROLL_WAIT_MS = 500;

const DEFAULT_MAX_SCROLLS = 90;

/*
 * QUICK collection is intended for user-triggered searches.
 */
const QUICK_INITIAL_WAIT_MS = 650;
const QUICK_SCROLL_WAIT_MS = 120;
const QUICK_POST_SCROLL_WAIT_MS = 150;
const QUICK_MAX_SCROLLS = 4;
const QUICK_TARGET_LIBRARY_IDS = 24;
const QUICK_STABLE_ROUNDS = 1;

/*
 * Deep collection ceiling.
 */
const TARGET_LIBRARY_IDS = 600;
const STABLE_ROUNDS = 8;

const MAX_ATTEMPTS = 3;

/* =========================================================
 * CTA
 * ======================================================= */

const CTA_VALUES = [
  "Shop Now",
  "Learn More",
  "Sign Up",
  "Buy Now",
  "Install Now",
  "Book Now",
  "Contact Us",
  "Get Offer",
  "Apply Now",
  "Download",
  "Subscribe",
  "Order Now",
  "Message Now",
  "Send Message",
  "Get Directions",
  "Call Now",
  "Watch More",
  "Listen Now",
  "Play Game",
  "Use App",

  "अभी खरीदें",
  "और जानें",
  "साइन अप करें",
  "अभी इंस्टॉल करें",
  "संदेश भेजें",
] as const;

/* =========================================================
 * RAW CARD
 * ======================================================= */

type RawCard = {
  id: string;

  rawLines: string[];

  links: Array<{
    href: string;
    text: string;
  }>;

  imageUrl: string | null;

  videoUrl: string | null;

  thumbnailUrl: string | null;

  videoDurationSeconds: number | null;

  publisherPlatforms: string[];
};

/* =========================================================
 * BROWSER SINGLETON
 * ======================================================= */

let metaBrowser: Browser | null = null;

let metaBrowserPromise: Promise<Browser> | null = null;

/* =========================================================
 * LOCAL EXECUTABLE
 * ======================================================= */

function getLocalExecutable(): string {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.EDGE_EXECUTABLE_PATH,

    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",

    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      if (/^file:\/\//i.test(candidate)) {
        continue;
      }

      const resolved = path.resolve(candidate);

      if (existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // Continue checking candidates.
    }
  }

  throw new Error(
    [
      "No local Chrome/Edge executable found.",
      "Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH.",
    ].join(" "),
  );
}

/* =========================================================
 * BROWSER
 * ======================================================= */

async function getMetaBrowser(): Promise<Browser> {
  if (metaBrowser) {
    try {
      if (metaBrowser.isConnected()) {
        return metaBrowser;
      }
    } catch {
      // Recreate browser below.
    }

    metaBrowser = null;
  }

  if (!metaBrowserPromise) {
    metaBrowserPromise = (async () => {
      const isLocal =
        process.platform === "win32" ||
        process.env.IS_LOCAL === "true";

      let executablePath: string;
      let launchArgs: string[];

      if (isLocal) {
        executablePath = getLocalExecutable();

        launchArgs = [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-features=IsolateOrigins,site-per-process",
        ];
      } else {
        const packUrl = process.env.CHROMIUM_PACK_URL?.trim();

        if (!packUrl) {
          throw new Error(
            "CHROMIUM_PACK_URL is required in production.",
          );
        }

        if (!/^https?:\/\//i.test(packUrl)) {
          throw new Error(
            "CHROMIUM_PACK_URL must be an HTTP/HTTPS URL.",
          );
        }

        executablePath = await chromium.executablePath(packUrl);

        launchArgs = [
          ...chromium.args,
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ];
      }

      const nextBrowser = await playwrightChromium.launch({
        executablePath,
        args: launchArgs,
        headless: !isLocal,
      });

      nextBrowser.on("disconnected", () => {
        if (metaBrowser === nextBrowser) {
          metaBrowser = null;
        }
      });

      metaBrowser = nextBrowser;

      return nextBrowser;
    })().finally(() => {
      metaBrowserPromise = null;
    });
  }

  return metaBrowserPromise;
}

/* =========================================================
 * URL
 * ======================================================= */

function buildLibraryUrl(
  query: string,
  country: string,
): string {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    q: query,
  });

  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/* =========================================================
 * URL NORMALIZATION
 * ======================================================= */

function normalizeUrl(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

/* =========================================================
 * QUERY NORMALIZATION
 * ======================================================= */

function normalizeMatchText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
 * HASH
 *
 * Used only when Meta's rendered card does not expose a
 * Library ID in the DOM.
 * ======================================================= */

function simpleHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

/* =========================================================
 * VISIBLE CARD EXTRACTION
 *
 * Important:
 *
 * We do NOT depend on createTreeWalker().
 *
 * Meta changes the rendered DOM frequently and the previous
 * implementation was returning zero cards / throwing:
 *
 *   TypeError: Failed to execute 'createTreeWalker'
 *
 * This implementation uses:
 *
 * 1. Library-ID based semantic containers.
 * 2. article / role=article / card selectors.
 * 3. Sponsored/ad text heuristics.
 * 4. Synthetic IDs when Library ID is not rendered.
 * ======================================================= */

async function extractVisibleCards(
  page: Page,
): Promise<RawCard[]> {
  return page.evaluate(() => {
    const normalize = (value: string): string =>
      value
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\r|\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const getText = (element: Element): string =>
      normalize(
        (element as HTMLElement).innerText ??
          element.textContent ??
          "",
      );

    const getLibraryIds = (value: string): string[] => {
      const matches =
        value.match(
          /(?:Library ID|Library\s*ID|लाइब्रेरी ID)\s*[:#]?\s*(\d{6,})/gi,
        ) ?? [];

      return Array.from(
        new Set(
          matches
            .map((match) => match.match(/(\d{6,})/)?.[1] ?? "")
            .filter(Boolean),
        ),
      );
    };

    const getFirstLibraryId = (
      element: Element,
    ): string | null => {
      return getLibraryIds(getText(element))[0] ?? null;
    };

    const candidateCards = new Map<string, Element>();

    /* -------------------------------------------------------
     * 1. Explicit semantic card candidates.
     * ----------------------------------------------------- */

    const semanticSelectors = [
      '[role="article"]',
      "article",
      '[data-testid*="ad" i]',
      '[data-testid*="card" i]',
      '[aria-label*="Sponsored" i]',
      '[aria-label*="sponsored" i]',
    ];

    const semanticCandidates = Array.from(
      document.querySelectorAll(
        semanticSelectors.join(","),
      ),
    );

    /* -------------------------------------------------------
     * 2. Find explicit Library-ID containers.
     *
     * We avoid TreeWalker and inspect block-like elements.
     * ----------------------------------------------------- */

    const libraryCandidates = Array.from(
      document.querySelectorAll(
        "article, section, div",
      ),
    );

    for (const element of libraryCandidates) {
      const text = getText(element);

      if (
        text.length < 60 ||
        text.length > 25_000
      ) {
        continue;
      }

      const ids = getLibraryIds(text);

      if (ids.length !== 1) {
        continue;
      }

      const id = ids[0];

      /*
       * Keep the smallest usable container. When several nested
       * elements contain the same ID, replacing the entry when
       * the new element is smaller gives us the card instead of
       * the whole feed.
       */
      const existing = candidateCards.get(id);

      if (!existing) {
        candidateCards.set(id, element);
        continue;
      }

      const existingText = getText(existing);

      if (text.length < existingText.length) {
        candidateCards.set(id, element);
      }
    }

    /* -------------------------------------------------------
     * 3. Semantic fallback.
     *
     * This is important because some Meta responses render ad
     * cards without exposing Library ID in visible text.
     * ----------------------------------------------------- */

    const adSignals = [
      "sponsored",
      "library id",
      "लाइब्रेरी id",
      "shop now",
      "learn more",
      "buy now",
      "sign up",
      "install now",
      "contact us",
      "get offer",
      "order now",
      "message now",
      "send message",
    ];

    for (const element of semanticCandidates) {
      const text = getText(element);

      if (
        text.length < 80 ||
        text.length > 15_000
      ) {
        continue;
      }

      const lowerText = text.toLowerCase();

      const hasAdSignal = adSignals.some((signal) =>
        lowerText.includes(signal),
      );

      if (!hasAdSignal) {
        continue;
      }

      const explicitId = getFirstLibraryId(element);

      /*
       * Prefer the real Meta Library ID.
       */
      if (explicitId) {
        const existing = candidateCards.get(explicitId);

        if (!existing) {
          candidateCards.set(explicitId, element);
        } else if (
          getText(element).length <
          getText(existing).length
        ) {
          candidateCards.set(explicitId, element);
        }

        continue;
      }

      /*
       * No visible Library ID.
       *
       * Build a stable synthetic identity from the card's
       * normalized content and media URLs.
       */
      const firstImage =
        element.querySelector("img")?.getAttribute("src") ?? "";

      const firstVideo =
        element.querySelector("video")?.getAttribute("src") ?? "";

      const fingerprintSource = [
        text.slice(0, 5000),
        firstImage,
        firstVideo,
      ].join("|");

      const syntheticId =
        `synthetic-${simpleHash(fingerprintSource)}`;

      if (!candidateCards.has(syntheticId)) {
        candidateCards.set(
          syntheticId,
          element,
        );
      }
    }

    /* -------------------------------------------------------
     * 4. Last-resort generic fallback.
     *
     * Search only reasonably sized divs so we don't mistake
     * the entire page/feed for one ad.
     * ----------------------------------------------------- */

    if (candidateCards.size === 0) {
      const genericCandidates = Array.from(
        document.querySelectorAll("div"),
      );

      for (const element of genericCandidates) {
        const text = getText(element);

        if (
          text.length < 120 ||
          text.length > 8_000
        ) {
          continue;
        }

        const lowerText = text.toLowerCase();

        const hasBusinessSignal =
          lowerText.includes("sponsored") ||
          lowerText.includes("shop now") ||
          lowerText.includes("learn more") ||
          lowerText.includes("buy now") ||
          lowerText.includes("sign up");

        if (!hasBusinessSignal) {
          continue;
        }

        const id = getFirstLibraryId(element);

        if (id) {
          candidateCards.set(id, element);
          continue;
        }

        const image =
          element.querySelector("img")?.getAttribute("src") ?? "";

        const video =
          element.querySelector("video")?.getAttribute("src") ?? "";

        const syntheticId =
          `synthetic-${simpleHash(
            [
              text.slice(0, 5000),
              image,
              video,
            ].join("|"),
          )}`;

        candidateCards.set(
          syntheticId,
          element,
        );

        /*
         * Avoid filling the result set with every nested div.
         * A handful of best candidates is enough for fallback.
         */
        if (candidateCards.size >= 30) {
          break;
        }
      }
    }

    const platformNames = [
      "Facebook",
      "Instagram",
      "Messenger",
      "Audience Network",
      "Threads",
    ];

    const results: RawCard[] = [];

    for (const [id, card] of candidateCards) {
      const rawLines = (
        (card as HTMLElement).innerText ??
        card.textContent ??
        ""
      )
        .split(/\r?\n/)
        .map(normalize)
        .filter(Boolean);

      if (rawLines.length === 0) {
        continue;
      }

      const links = Array.from(
        card.querySelectorAll("a[href]"),
      )
        .map((anchor) => {
          const href =
            anchor.getAttribute("href");

          if (
            !href ||
            href.startsWith("javascript:")
          ) {
            return null;
          }

          try {
            return {
              href: new URL(
                href,
                window.location.href,
              ).toString(),

              text: normalize(
                anchor.textContent ?? "",
              ),
            };
          } catch {
            return null;
          }
        })
        .filter(
          (
            value,
          ): value is {
            href: string;
            text: string;
          } => value !== null,
        );

      const video =
        card.querySelector("video") as
          | HTMLVideoElement
          | null;

      const image =
        card.querySelector("img") as
          | HTMLImageElement
          | null;

      const joined =
        rawLines.join(" ").toLowerCase();

      const imageUrl =
        image?.getAttribute("src") ??
        image?.getAttribute("data-src") ??
        null;

      const videoUrl =
        video?.currentSrc ||
        video?.getAttribute("src") ||
        null;

      const thumbnailUrl =
        video?.getAttribute("poster") ??
        imageUrl ??
        null;

      results.push({
        id,

        rawLines,

        links,

        imageUrl,

        videoUrl,

        thumbnailUrl,

        videoDurationSeconds:
          video &&
          Number.isFinite(video.duration) &&
          video.duration > 0
            ? Math.round(video.duration)
            : null,

        publisherPlatforms:
          platformNames.filter((platform) =>
            joined.includes(
              platform.toLowerCase(),
            ),
          ),
      });
    }

    return results;
  });
}

/* =========================================================
 * DESTINATION
 * ======================================================= */

function destinationFromLinks(
  links: RawCard["links"],
): string | null {
  const blockedHosts = [
    "facebook.com",
    "instagram.com",
    "doubleclick.net",
    "googleadservices.com",
  ];

  const candidates = links
    .map((link) => {
      try {
        const url = new URL(link.href);

        const host = url.hostname
          .replace(/^www\./i, "")
          .toLowerCase();

        if (
          blockedHosts.some(
            (blocked) =>
              host === blocked ||
              host.endsWith(`.${blocked}`),
          )
        ) {
          return null;
        }

        let score = 0;

        if (url.protocol === "https:") {
          score += 5;
        }

        if (
          /\b(?:shop|buy|learn|order|get|offer|visit|discover)\b/i.test(
            link.text,
          )
        ) {
          score += 20;
        }

        return {
          url: url.toString(),
          score,
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        value,
      ): value is {
        url: string;
        score: number;
      } => value !== null,
    );

  candidates.sort(
    (a, b) => b.score - a.score,
  );

  return candidates[0]?.url ?? null;
}

/* =========================================================
 * RELEVANCE
 * ======================================================= */

function isRelevant(
  ad: CompetitorAd,
  query: string,
): boolean {
  const normalizedQuery =
    normalizeMatchText(query);

  if (!normalizedQuery) {
    return false;
  }

  const compactQuery =
    normalizedQuery.replace(/\s+/g, "");

  const haystack = [
    ad.advertiserName,
    ad.creatorName,
    ad.headline,
    ad.productName,
    ad.primaryText,
    ad.description,
    ad.landingPage,
  ]
    .map(normalizeMatchText)
    .filter(Boolean)
    .join(" ");

  if (!haystack) {
    return false;
  }

  if (
    haystack.includes(
      normalizedQuery,
    )
  ) {
    return true;
  }

  if (
    compactQuery.length >= 3 &&
    haystack
      .replace(/\s+/g, "")
      .includes(compactQuery)
  ) {
    return true;
  }

  return false;
}

/* =========================================================
 * AD QUALITY
 * ======================================================= */

function getAdQualityScore(
  ad: CompetitorAd,
): number {
  let score = 0;

  if (
    ad.advertiserName &&
    ad.advertiserName !==
      "Unknown advertiser"
  ) {
    score += 10;
  }

  if (ad.creatorName) {
    score += 3;
  }

  if (ad.primaryText) {
    score += 5;
  }

  if (ad.headline) {
    score += 5;
  }

  if (ad.callToAction) {
    score += 3;
  }

  if (ad.landingPage) {
    score += 5;
  }

  if (ad.imageUrl) {
    score += 4;
  }

  if (ad.videoUrl) {
    score += 6;
  }

  if (ad.thumbnailUrl) {
    score += 3;
  }

  if (ad.firstSeen) {
    score += 2;
  }

  if (ad.lastSeen) {
    score += 2;
  }

  if (ad.offer) {
    score += 2;
  }

  return score;
}

/* =========================================================
 * NORMALIZE CARD
 * ======================================================= */

function normalizeCard(
  card: RawCard,
  query: string,
  country: string,
): CompetitorAd {
  const identity =
    extractAdvertiserIdentity(
      card.rawLines,
    );

  const primaryText =
    extractPrimaryText(
      card.rawLines,
      CTA_VALUES,
    );

  const productName =
    extractProductName(
      card.rawLines,
      card.links,
      CTA_VALUES,
    );

  const callToAction =
    extractCallToAction(
      card.rawLines,
      CTA_VALUES,
    );

  const dates =
    extractDateRange(
      card.rawLines,
    );

  const offer =
    extractOffer(
      primaryText,
      card.rawLines,
    );

  const firstSeen =
    dates.firstSeen;

  const lastSeen =
    dates.lastSeen;

  const creativeType: AdCreativeType =
    card.videoUrl
      ? "video"
      : card.imageUrl
        ? "image"
        : "unknown";

  const advertiserName =
    repairMojibake(
      normalizeWhitespace(
        identity.advertiserName ??
          "Unknown advertiser",
      ),
    ) ??
    "Unknown advertiser";

  const creatorName =
    identity.creatorName
      ? repairMojibake(
          normalizeWhitespace(
            identity.creatorName,
          ),
        )
      : null;

  const normalizedPrimaryText =
    primaryText
      ? repairMojibake(
          normalizeExtractedText(
            primaryText,
          ),
        )
      : null;

  const normalizedProductName =
    productName
      ? repairMojibake(
          normalizeWhitespace(
            productName,
          ),
        )
      : null;

  const normalizedCta =
    callToAction
      ? repairMojibake(
          normalizeWhitespace(
            callToAction,
          ),
        )
      : null;

  const priceLine =
    card.rawLines.find(
      (line) =>
        /₹|INR|Rs\.?/i.test(line),
    ) ?? "";

  const productPrice =
    parsePrice(priceLine);

  const containsInr =
    productPrice !== null ||
    /₹|INR|Rs\.?/i.test(
      card.rawLines.join(" "),
    );

  const baseAd: CompetitorAd = {
    id: card.id,

    platform: "meta",

    advertiserName,

    creatorName,

    partnershipType:
      identity.partnershipType,

    country,

    creativeType,

    imageUrl:
      normalizeUrl(
        card.imageUrl,
      ),

    videoUrl:
      normalizeUrl(
        card.videoUrl,
      ),

    thumbnailUrl:
      normalizeUrl(
        card.thumbnailUrl,
      ),

    videoDurationSeconds:
      card.videoDurationSeconds,

    primaryText:
      normalizedPrimaryText,

    headline:
      normalizedProductName,

    description:
      null,

    callToAction:
      normalizedCta,

    firstSeen,

    lastSeen,

    isActive:
      extractActiveStatus(
        card.rawLines,
      ),

    publisherPlatforms:
      card.publisherPlatforms,

    landingPage:
      destinationFromLinks(
        card.links,
      ),

    sourceUrl:
      buildLibraryUrl(
        query,
        country,
      ),

    productName:
      normalizedProductName,

    productPrice,

    currency:
      containsInr
        ? "INR"
        : null,

    offer,

    runningDays:
      calculateRunningDays(
        firstSeen,
        lastSeen,
      ),

    creativeScore:
      null,

    transcript:
      null,

    transcriptStatus:
      creativeType === "video"
        ? "pending"
        : "not_video",

    metricSources: {
      creativeScore:
        "unavailable",

      longevityScore:
        "derived",

      relevanceScore:
        "derived",

      engagementPotentialScore:
        "unavailable",

      reach:
        "unavailable",

      clicks:
        "unavailable",

      ctr:
        "unavailable",

      impressions:
        "unavailable",
    },

    metadata: {
      extractionMethod:
        "meta-incremental-visible-card-v3",

      searchQuery:
        query,

      country,

      rawLines:
        card.rawLines,

      mediaSource:
        card.videoUrl
          ? "video"
          : card.imageUrl
            ? "image"
            : "unknown",

      languageSource:
        "heuristic",

      geographySource:
        "unavailable",

      providerSource:
        "meta_ad_library",
    },
  };

  if (
    typeof baseAd.runningDays ===
      "number" &&
    baseAd.runningDays > 0
  ) {
    baseAd.longevityScore =
      Math.min(
        100,
        Math.round(
          baseAd.runningDays /
            3.65,
        ),
      );
  }

  baseAd.relevanceScore =
    isRelevant(
      baseAd,
      query,
    )
      ? 100
      : 0;

  return baseAd;
}

/* =========================================================
 * FINGERPRINT
 * ======================================================= */

function fingerprint(
  ad: CompetitorAd,
): string {
  return [
    ad.platform,

    normalizeMatchText(
      ad.advertiserName,
    ),

    normalizeMatchText(
      ad.headline,
    ),

    normalizeMatchText(
      ad.primaryText,
    ),

    normalizeMatchText(
      ad.callToAction,
    ),

    normalizeMatchText(
      ad.landingPage,
    ),

    ad.creativeType ?? "",

    ad.imageUrl ?? "",

    ad.videoUrl ?? "",
  ].join("|");
}

/* =========================================================
 * DEDUPLICATION
 * ======================================================= */

function deduplicateAds(
  ads: CompetitorAd[],
): CompetitorAd[] {
  const byId =
    new Map<
      string,
      CompetitorAd
    >();

  for (const ad of ads) {
    const idKey = [
      ad.platform,
      ad.id,
    ].join(":");

    const existing =
      byId.get(idKey);

    if (!existing) {
      byId.set(
        idKey,
        ad,
      );

      continue;
    }

    if (
      getAdQualityScore(ad) >
      getAdQualityScore(existing)
    ) {
      byId.set(
        idKey,
        ad,
      );
    }
  }

  const byFingerprint =
    new Map<
      string,
      CompetitorAd
    >();

  for (const ad of byId.values()) {
    const key =
      fingerprint(ad);

    const existing =
      byFingerprint.get(key);

    if (!existing) {
      byFingerprint.set(
        key,
        ad,
      );

      continue;
    }

    if (
      getAdQualityScore(ad) >
      getAdQualityScore(existing)
    ) {
      byFingerprint.set(
        key,
        ad,
      );
    }
  }

  return Array.from(
    byFingerprint.values(),
  );
}

/* =========================================================
 * PAGE SNAPSHOT
 *
 * Kept INSIDE scrapeMetaOnce so `page` is always in scope.
 * ======================================================= */

async function getPageSnapshot(
  page: Page,
): Promise<{
  url: string;
  title: string;
  bodyTextLength: number;
  bodyText: string;
  htmlLength: number;
  articleCount: number;
  roleArticleCount: number;
  imageCount: number;
  videoCount: number;
  linkCount: number;
  libraryIdCount: number;
}> {
  return page.evaluate(() => {
    const bodyText =
      document.body?.innerText ??
      "";

    const libraryMatches =
      bodyText.match(
        /(?:Library ID|लाइब्रेरी ID)\s*[:#]?\s*\d{6,}/gi,
      ) ?? [];

    return {
      url:
        window.location.href,

      title:
        document.title,

      bodyTextLength:
        bodyText.length,

      bodyText:
        bodyText.slice(0, 3000),

      htmlLength:
        document.body?.innerHTML
          ?.length ?? 0,

      articleCount:
        document.querySelectorAll(
          "article",
        ).length,

      roleArticleCount:
        document.querySelectorAll(
          '[role="article"]',
        ).length,

      imageCount:
        document.querySelectorAll(
          "img",
        ).length,

      videoCount:
        document.querySelectorAll(
          "video",
        ).length,

      linkCount:
        document.querySelectorAll(
          "a",
        ).length,

      libraryIdCount:
        libraryMatches.length,
    };
  });
}

/* =========================================================
 * SCRAPE ONCE
 * ======================================================= */

async function scrapeMetaOnce(
  query: string,
  country: string,
  collectionDepth:
    | "quick"
    | "deep",
): Promise<CompetitorAd[]> {
  const currentBrowser =
    await getMetaBrowser();

  const context:
    | BrowserContext =
    await currentBrowser.newContext({
      locale:
        "en-IN",

      viewport: {
        width: 1440,
        height: 1000,
      },

      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

      extraHTTPHeaders: {
        "Accept-Language":
          "en-IN,en;q=0.9",
      },
    });

  await context.addInitScript(() => {
    Object.defineProperty(
      navigator,
      "webdriver",
      {
        get: () => undefined,
      },
    );

    Object.defineProperty(
      navigator,
      "platform",
      {
        get: () => "Win32",
      },
    );

    Object.defineProperty(
      navigator,
      "languages",
      {
        get: () => [
          "en-IN",
          "en",
        ],
      },
    );

    if (!("chrome" in window)) {
      Object.defineProperty(
        window,
        "chrome",
        {
          value: {
            runtime: {},
          },
          configurable: true,
        },
      );
    }
  });

  const page =
    await context.newPage();

  page.setDefaultTimeout(
    30_000,
  );

  page.setDefaultNavigationTimeout(
    60_000,
  );

  const collected =
    new Map<
      string,
      CompetitorAd
    >();

  let stableRounds = 0;

  let previousCount = 0;

  const isQuickCollection =
    collectionDepth ===
    "quick";

  const initialWaitMs =
    isQuickCollection
      ? QUICK_INITIAL_WAIT_MS
      : INITIAL_WAIT_MS;

  const scrollWaitMs =
    isQuickCollection
      ? QUICK_SCROLL_WAIT_MS
      : SCROLL_WAIT_MS;

  const postScrollWaitMs =
    isQuickCollection
      ? QUICK_POST_SCROLL_WAIT_MS
      : POST_SCROLL_WAIT_MS;

  const maxScrolls =
    isQuickCollection
      ? QUICK_MAX_SCROLLS
      : DEFAULT_MAX_SCROLLS;

  const targetLibraryIds =
    isQuickCollection
      ? QUICK_TARGET_LIBRARY_IDS
      : TARGET_LIBRARY_IDS;

  const stableRoundLimit =
    isQuickCollection
      ? QUICK_STABLE_ROUNDS
      : STABLE_ROUNDS;

  try {
    const targetUrl =
      buildLibraryUrl(
        query,
        country,
      );

    console.info(
      "[DeepMetaProvider] Opening Meta Ad Library:",
      {
        query,
        country,
        collectionDepth,
        targetUrl,
      },
    );

    const response =
      await page.goto(
        targetUrl,
        {
          waitUntil:
            "commit",

          timeout:
            60_000,
        },
      );

    console.info(
      "[DeepMetaProvider] Meta navigation response:",
      {
        status:
          response?.status() ??
          null,

        contentType:
          response?.headers()[
            "content-type"
          ] ?? null,

        url:
          response?.url() ??
          targetUrl,
      },
    );

    await page.waitForLoadState(
      "domcontentloaded",
      {
        timeout: 30_000,
      },
    ).catch(() => undefined);

    /*
     * Meta can commit the navigation before the client-rendered
     * document is populated. Wait briefly for a real DOM before
     * taking the diagnostic snapshot.
     */
    try {
      await page.waitForFunction(
        () =>
          Boolean(
            document.body &&
            document.body.innerHTML.length > 100,
          ),
        {
          timeout:
            isQuickCollection
              ? 10_000
              : 20_000,
        },
      );
    } catch {
      // Snapshot below records the actual state when rendering
      // does not complete in time.
    }

    await page.waitForTimeout(
      initialWaitMs,
    );

    /*
     * Debug snapshot is intentionally here.
     * Never place it in search() where `page` does not exist.
     */
    try {
      const snapshot =
        await getPageSnapshot(
          page,
        );

      console.info(
        "[DeepMetaProvider] PAGE SNAPSHOT:",
        snapshot,
      );
    } catch (snapshotError) {
      console.warn(
        "[DeepMetaProvider] Failed to create page snapshot:",
        snapshotError,
      );
    }

    /*
     * Handle pages that have not rendered meaningful content yet.
     */
    try {
      await page.waitForLoadState(
        "networkidle",
        {
          timeout: 4_000,
        },
      );
    } catch {
      // Meta can keep network requests open indefinitely.
    }

    for (
      let scroll = 0;
      scroll < maxScrolls;
      scroll += 1
    ) {
      const cards =
        await extractVisibleCards(
          page,
        );

      let added = 0;

      for (
        const card of cards
      ) {
        const ad =
          normalizeCard(
            card,
            query,
            country,
          );

        /*
         * Exact advertiser/content relevance filter.
         *
         * Synthetic IDs are allowed here; relevance is based on
         * extracted card content, not the ID format.
         */
        if (
          !isRelevant(
            ad,
            query,
          )
        ) {
          continue;
        }

        const existing =
          collected.get(
            ad.id,
          );

        if (!existing) {
          collected.set(
            ad.id,
            ad,
          );

          added += 1;

          continue;
        }

        if (
          getAdQualityScore(ad) >
          getAdQualityScore(
            existing,
          )
        ) {
          collected.set(
            ad.id,
            ad,
          );
        }
      }

      const currentCount =
        collected.size;

      console.info(
        "[DeepMetaProvider] Collection progress:",
        {
          query,
          country,
          collectionDepth,
          scroll:
            scroll + 1,
          visible:
            cards.length,
          added,
          collected:
            currentCount,
        },
      );

      /*
       * Quick search:
       * stop after a useful initial result set.
       */
      if (
        isQuickCollection &&
        currentCount >= 12
      ) {
        break;
      }

      if (
        currentCount >=
        targetLibraryIds
      ) {
        break;
      }

      if (
        currentCount ===
        previousCount
      ) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previousCount =
        currentCount;

      if (
        stableRounds >=
          stableRoundLimit &&
        currentCount > 0
      ) {
        break;
      }

      await page.mouse.wheel(
        0,
        2400,
      );

      await page.waitForTimeout(
        scrollWaitMs,
      );
    }

    /*
     * Final extraction for deep mode.
     */
    if (!isQuickCollection) {
      await page.waitForTimeout(
        postScrollWaitMs,
      );

      const finalCards =
        await extractVisibleCards(
          page,
        );

      for (
        const card of finalCards
      ) {
        const ad =
          normalizeCard(
            card,
            query,
            country,
          );

        if (
          !isRelevant(
            ad,
            query,
          )
        ) {
          continue;
        }

        const existing =
          collected.get(
            ad.id,
          );

        if (
          !existing ||
          getAdQualityScore(ad) >
            getAdQualityScore(
              existing,
            )
        ) {
          collected.set(
            ad.id,
            ad,
          );
        }
      }
    }

    console.info(
      "[DeepMetaProvider] Collection complete:",
      {
        query,
        country,
        collectionDepth,
        ads:
          collected.size,
      },
    );

    return Array.from(
      collected.values(),
    );
  } finally {
    await context
      .close()
      .catch(
        () => undefined,
      );
  }
}

/* =========================================================
 * PROVIDER
 * ======================================================= */

export const deepMetaProvider:
  AdProvider = {
  platform: "meta",

  async search(
    input: AdSearchInput,
  ): Promise<ProviderResult> {
    const query =
      input.query?.trim();

    const country =
      input.country
        ?.trim()
        .toUpperCase() ||
      DEFAULT_COUNTRY;

    if (!query) {
      return {
        ads: [],
      };
    }

    for (
      let attempt = 1;
      attempt <= MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const startedAt =
          Date.now();

        const collectionDepth =
          input.collectionDepth ===
          "quick"
            ? "quick"
            : "deep";

        const scraped =
          await scrapeMetaOnce(
            query,
            country,
            collectionDepth,
          );

        const ads =
          deduplicateAds(
            scraped,
          );

        ads.sort(
          (a, b) => {
            const activeDifference =
              Number(
                b.isActive ??
                  false,
              ) -
              Number(
                a.isActive ??
                  false,
              );

            if (
              activeDifference !==
              0
            ) {
              return activeDifference;
            }

            return (
              (b.runningDays ??
                0) -
              (a.runningDays ??
                0)
            );
          },
        );

        console.info(
          "[DeepMetaProvider] Collection complete:",
          {
            query,
            country,
            collectionDepth,
            ads:
              ads.length,
            attempt,
            durationMs:
              Date.now() -
              startedAt,
          },
        );

        return {
          ads,
        };
      } catch (error) {
        console.error(
          "[DeepMetaProvider] Attempt failed:",
          {
            attempt,
            query,
            country,
            error:
              error instanceof
              Error
                ? {
                    name:
                      error.name,

                    message:
                      error.message,

                    stack:
                      error.stack,
                  }
                : error,
          },
        );

        if (
          attempt <
          MAX_ATTEMPTS
        ) {
          await new Promise<void>(
            (resolve) => {
              setTimeout(
                resolve,
                attempt * 1000,
              );
            },
          );
        }
      }
    }

    console.warn(
      "[DeepMetaProvider] All attempts failed:",
      {
        query,
        country,
      },
    );

    return {
      ads: [],
    };
  },
};