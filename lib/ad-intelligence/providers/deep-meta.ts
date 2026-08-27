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
 * QUICK collection is intended for a user-triggered first search.
 *
 * It deliberately uses a small crawl budget so a previously unseen
 * brand can produce a useful first result set quickly.
 *
 * DEEP collection keeps the existing crawl ceiling below.
 */
const QUICK_INITIAL_WAIT_MS = 1000;
const QUICK_SCROLL_WAIT_MS = 225;
const QUICK_POST_SCROLL_WAIT_MS = 300;
const QUICK_MAX_SCROLLS = 14;
const QUICK_TARGET_LIBRARY_IDS = 24;
const QUICK_STABLE_ROUNDS = 3;

/*
 * Maximum target for one provider collection.
 *
 * This is a ceiling, not a guarantee that Meta will expose
 * this many unique creatives for every query.
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

let metaBrowserPromise:
  | Promise<Browser>
  | null = null;

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
    (
      value,
    ): value is string =>
      typeof value === "string" &&
      value.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      if (/^file:\/\//i.test(candidate)) {
        continue;
      }

      const resolved =
        path.resolve(candidate);

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
      if (
        metaBrowser.isConnected()
      ) {
        return metaBrowser;
      }
    } catch {
      // Continue and recreate.
    }

    metaBrowser = null;
  }

  if (!metaBrowserPromise) {
    metaBrowserPromise =
      (async () => {
        const isLocal =
          process.platform ===
            "win32" ||
          process.env.IS_LOCAL ===
            "true";

        let executablePath: string;

        let launchArgs: string[];

        if (isLocal) {
          executablePath =
            getLocalExecutable();

          launchArgs = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ];
        } else {
          const packUrl =
            process.env.CHROMIUM_PACK_URL?.trim();

          if (!packUrl) {
            throw new Error(
              "CHROMIUM_PACK_URL is required in production.",
            );
          }

          if (
            !/^https?:\/\//i.test(
              packUrl,
            )
          ) {
            throw new Error(
              "CHROMIUM_PACK_URL must be an HTTP/HTTPS URL.",
            );
          }

          executablePath =
            await chromium.executablePath(
              packUrl,
            );

          launchArgs = [
            ...chromium.args,
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ];
        }

        const nextBrowser =
          await playwrightChromium.launch(
            {
              executablePath,
              args: launchArgs,
              headless: true,
            },
          );

        nextBrowser.on(
          "disconnected",
          () => {
            if (
              metaBrowser ===
              nextBrowser
            ) {
              metaBrowser = null;
            }
          },
        );

        metaBrowser =
          nextBrowser;

        return nextBrowser;
      })().finally(
        () => {
          metaBrowserPromise =
            null;
        },
      );
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
  const params =
    new URLSearchParams({
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
    return new URL(
      value,
    ).toString();
  } catch {
    return null;
  }
}

/* =========================================================
 * QUERY NORMALIZATION
 * ======================================================= */

function normalizeMatchText(
  value:
    | string
    | null
    | undefined,
): string {
  return (
    value ?? ""
  )
    .toLowerCase()
    .normalize("NFKC")
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/* =========================================================
 * VISIBLE CARD EXTRACTION
 * ======================================================= */

async function extractVisibleCards(
  page: Page,
): Promise<RawCard[]> {
  return page.evaluate(
    (ctaValues) => {
      const normalize =
        (
          value: string,
        ): string =>
          value
            .replace(
              /[\u200B-\u200D\uFEFF]/g,
              "",
            )
            .replace(
              /\u00A0/g,
              " ",
            )
            .replace(
              /\r|\n/g,
              " ",
            )
            .replace(
              /\s+/g,
              " ",
            )
            .trim();

      const getLibraryId =
        (
          value: string,
        ): string | null =>
          value.match(
            /(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i,
          )?.[1] ?? null;

      const countLibraryIds =
        (
          element: Element,
        ): number => {
          const matches =
            (
              element.textContent ??
              ""
            ).match(
              /(?:Library ID|लाइब्रेरी ID):\s*\d+/gi,
            ) ?? [];

          return new Set(
            matches.map(
              (match) =>
                match.match(
                  /(\d+)/,
                )?.[1] ?? "",
            ),
          ).size;
        };

      const candidateCards =
        new Map<
          string,
          Element
        >();

      const walker =
        document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );

      let node =
        walker.nextNode();

      while (node) {
        const id =
          getLibraryId(
            node.textContent ??
              "",
          );

        if (id) {
          let current =
            node.parentElement;

          let best:
            | Element
            | null = null;

          for (
            let depth = 0;
            depth < 14 &&
            current;
            depth += 1
          ) {
            const text =
              current.textContent?.trim() ??
              "";

            const idCount =
              countLibraryIds(
                current,
              );

            if (
              idCount === 1 &&
              text.length >= 80 &&
              text.length <= 25000
            ) {
              best = current;
            }

            if (
              idCount > 1
            ) {
              break;
            }

            current =
              current.parentElement;
          }

          if (
            best &&
            !candidateCards.has(
              id,
            )
          ) {
            candidateCards.set(
              id,
              best,
            );
          }
        }

        node =
          walker.nextNode();
      }

      if (
        candidateCards.size ===
        0
      ) {
        const fallback =
          Array.from(
            document.querySelectorAll(
              [
                '[role="article"]',
                "article",
                '[data-testid*="ad" i]',
                '[data-testid*="card" i]',
              ].join(","),
            ),
          );

        for (
          const element of
            fallback
        ) {
          const id =
            getLibraryId(
              element.textContent ??
                "",
            );

          if (id) {
            candidateCards.set(
              id,
              element,
            );
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

      const results: RawCard[] =
        [];

      /*
       * ctaValues is intentionally passed into evaluate so
       * the browser-side extraction has the exact same CTA set.
       */
      void ctaValues;

      for (
        const [
          id,
          card,
        ] of candidateCards
      ) {
        const rawLines =
          (
            (
              card as HTMLElement
            ).innerText ??
            ""
          )
            .split(
              /\r?\n/,
            )
            .map(
              normalize,
            )
            .filter(
              Boolean,
            );

        const links =
          Array.from(
            card.querySelectorAll(
              "a[href]",
            ),
          )
            .map(
              (
                anchor,
              ) => {
                const href =
                  anchor.getAttribute(
                    "href",
                  );

                if (
                  !href ||
                  href.startsWith(
                    "javascript:",
                  )
                ) {
                  return null;
                }

                try {
                  return {
                    href:
                      new URL(
                        href,
                        window.location.href,
                      ).toString(),

                    text:
                      normalize(
                        anchor.textContent ??
                          "",
                      ),
                  };
                } catch {
                  return null;
                }
              },
            )
            .filter(
              (
                value,
              ): value is {
                href: string;
                text: string;
              } =>
                value !== null,
            );

        const video =
          card.querySelector(
            "video",
          ) as
            | HTMLVideoElement
            | null;

        const image =
          card.querySelector(
            "img",
          ) as
            | HTMLImageElement
            | null;

        const joined =
          rawLines
            .join(" ")
            .toLowerCase();

        results.push({
          id,

          rawLines,

          links,

          imageUrl:
            image?.getAttribute(
              "src",
            ) ?? null,

          videoUrl:
            video?.currentSrc ||
            video?.getAttribute(
              "src",
            ) ||
            null,

          thumbnailUrl:
            video?.getAttribute(
              "poster",
            ) ??
            image?.getAttribute(
              "src",
            ) ??
            null,

          videoDurationSeconds:
            video &&
            Number.isFinite(
              video.duration,
            ) &&
            video.duration > 0
              ? Math.round(
                  video.duration,
                )
              : null,

          publisherPlatforms:
            platformNames.filter(
              (
                platform,
              ) =>
                joined.includes(
                  platform.toLowerCase(),
                ),
            ),
        });
      }

      return results;
    },
    CTA_VALUES,
  );
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

  const candidates =
    links
      .map(
        (link) => {
          try {
            const url =
              new URL(
                link.href,
              );

            const host =
              url.hostname
                .replace(
                  /^www\./i,
                  "",
                )
                .toLowerCase();

            if (
              blockedHosts.some(
                (blocked) =>
                  host ===
                    blocked ||
                  host.endsWith(
                    `.${blocked}`,
                  ),
              )
            ) {
              return null;
            }

            let score =
              0;

            if (
              url.protocol ===
              "https:"
            ) {
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
              url:
                url.toString(),

              score,
            };
          } catch {
            return null;
          }
        },
      )
      .filter(
        (
          value,
        ): value is {
          url: string;
          score: number;
        } =>
          value !== null,
      );

  candidates.sort(
    (a, b) =>
      b.score -
      a.score,
  );

  return (
    candidates[0]?.url ??
    null
  );
}

/* =========================================================
 * RELEVANCE
 * ======================================================= */

function isRelevant(
  ad: CompetitorAd,
  query: string,
): boolean {
  const normalizedQuery =
    normalizeMatchText(
      query,
    );

  if (!normalizedQuery) {
    return false;
  }

  const compactQuery =
    normalizedQuery.replace(
      /\s+/g,
      "",
    );

  const haystack =
    [
      ad.advertiserName,
      ad.creatorName,
      ad.headline,
      ad.productName,
      ad.primaryText,
      ad.description,
      ad.landingPage,
    ]
      .map(
        normalizeMatchText,
      )
      .filter(
        Boolean,
      )
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
      .replace(
        /\s+/g,
        "",
      )
      .includes(
        compactQuery,
      )
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

  const creativeType:
    AdCreativeType =
      card.videoUrl
        ? "video"
        : card.imageUrl
          ? "image"
          : "unknown";

  /*
   * CompetitorAd requires advertiserName to be string.
   * The parser may legitimately return null, so normalize it.
   */
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
        /₹|INR|Rs\.?/i.test(
          line,
        ),
    ) ?? "";

  const productPrice =
    parsePrice(
      priceLine,
    );

  /*
   * Do NOT assign null to engagementPotentialScore.
   * CompetitorAd declares it as number | undefined.
   *
   * We therefore omit it when unavailable.
   */
  const baseAd: CompetitorAd = {
    id:
      card.id,

    platform:
      "meta",

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
      productPrice !==
      null ||
      /₹|INR|Rs\.?/i.test(
        card.rawLines.join(
          " ",
        ),
      )
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
        "meta-incremental-visible-card-v2",

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

  /*
   * Add a derived longevity score only when running days
   * actually exist.
   *
   * This avoids a null assignment to a number field.
   */
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

  /*
   * Relevance score is derived from the query match.
   * It is NOT platform performance.
   */
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

    ad.creativeType ??
      "",

    ad.imageUrl ??
      "",

    ad.videoUrl ??
      "",
  ].join("|");
}

/* =========================================================
 * DEDUPLICATION
 * ======================================================= */

function deduplicateAds(
  ads: CompetitorAd[],
): CompetitorAd[] {
  /*
   * First preserve provider/library identity.
   */
  const byId =
    new Map<
      string,
      CompetitorAd
    >();

  for (
    const ad of ads
  ) {
    const idKey =
      [
        ad.platform,
        ad.id,
      ].join(":");

    const existing =
      byId.get(
        idKey,
      );

    if (!existing) {
      byId.set(
        idKey,
        ad,
      );

      continue;
    }

    if (
      getAdQualityScore(ad) >
      getAdQualityScore(
        existing,
      )
    ) {
      byId.set(
        idKey,
        ad,
      );
    }
  }

  /*
   * Then collapse true identical creatives.
   */
  const byFingerprint =
    new Map<
      string,
      CompetitorAd
    >();

  for (
    const ad of byId.values()
  ) {
    const key =
      fingerprint(
        ad,
      );

    const existing =
      byFingerprint.get(
        key,
      );

    if (!existing) {
      byFingerprint.set(
        key,
        ad,
      );

      continue;
    }

    if (
      getAdQualityScore(ad) >
      getAdQualityScore(
        existing,
      )
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
 * SCRAPE ONCE
 * ======================================================= */

async function scrapeMetaOnce(
  query: string,
  country: string,
  collectionDepth: "quick" | "deep",
): Promise<CompetitorAd[]> {
  const currentBrowser =
    await getMetaBrowser();

  const context:
    | BrowserContext =
    await currentBrowser.newContext(
      {
        locale:
          "en-IN",

        viewport: {
          width: 1440,
          height: 1000,
        },

        extraHTTPHeaders: {
          "Accept-Language":
            "en-IN,en;q=0.9",
        },
      },
    );

  const page =
    await context.newPage();

  const collected =
    new Map<
      string,
      CompetitorAd
    >();

  let stableRounds = 0;

  let previousCount = 0;

  const isQuickCollection =
    collectionDepth === "quick";

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
    await page.goto(
      buildLibraryUrl(
        query,
        country,
      ),
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          60_000,
      },
    );

    await page.waitForTimeout(
      initialWaitMs,
    );

    for (
      let scroll = 0;
      scroll <
        maxScrolls;
      scroll += 1
    ) {
      const cards =
        await extractVisibleCards(
          page,
        );

      let added =
        0;

      for (
        const card of
          cards
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

        if (!existing) {
          collected.set(
            ad.id,
            ad,
          );

          added += 1;

          continue;
        }

        if (
          getAdQualityScore(
            ad,
          ) >
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
     * One final extraction after the last scroll.
     */
    await page.waitForTimeout(
      postScrollWaitMs,
    );

    const finalCards =
      await extractVisibleCards(
        page,
      );

    for (
      const card of
        finalCards
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
        getAdQualityScore(
          ad,
        ) >
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
    platform:
      "meta",

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
        attempt <=
        MAX_ATTEMPTS;
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
              (
                resolve,
              ) => {
                setTimeout(
                  resolve,
                  attempt *
                    1000,
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

;
