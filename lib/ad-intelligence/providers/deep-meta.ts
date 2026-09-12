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
const QUICK_INITIAL_WAIT_MS = 650;
const QUICK_SCROLL_WAIT_MS = 120;
const QUICK_POST_SCROLL_WAIT_MS = 150;
const QUICK_MAX_SCROLLS = 4;
const QUICK_TARGET_LIBRARY_IDS = 24;
const QUICK_STABLE_ROUNDS = 1;

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
  advertiserPageId?: string | null,
): string {
  const params = new URLSearchParams();

  params.set("active_status", "active");
  params.set("ad_type", "all");
  params.set("country", country);
  params.set("is_targeted_country", "false");
  params.set("media_type", "all");

  if (
    advertiserPageId &&
    /^\d+$/.test(advertiserPageId)
  ) {
    params.set("search_type", "page");
    params.set(
      "view_all_page_id",
      advertiserPageId,
    );
  } else {
    params.set(
      "search_type",
      "keyword_unordered",
    );
    params.set("q", query);
  }

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
  await page
    .waitForLoadState(
      "domcontentloaded",
      {
        timeout: 10_000,
      },
    )
    .catch(
      () => undefined,
    );

  await page.waitForTimeout(
    750,
  );

  return page.evaluate(() => {
      const normalize = (
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

      const extractAdIdFromUrl = (
        value: string,
      ): string | null => {
        try {
          const url =
            new URL(
              value,
              window.location.href,
            );

          const id =
            url.searchParams.get(
              "id",
            );

          return id &&
            /^\d{6,}$/.test(id)
            ? id
            : null;
        } catch {
          return (
            value.match(
              /[?&]id=(\d{6,})/i,
            )?.[1] ??
            null
          );
        }
      };

      const extractLibraryId = (
        value: string,
      ): string | null =>
        value.match(
          /(?:Library ID|लाइब्रेरी ID)\s*:?\s*(\d{6,})/i,
        )?.[1] ??
        null;

      const countAdLinks = (
        element: Element,
      ): number => {
        return Array.from(
          element.querySelectorAll(
            "a[href]",
          ),
        ).filter(
          (anchor) =>
            Boolean(
              extractAdIdFromUrl(
                anchor.getAttribute(
                  "href",
                ) ?? "",
              ),
            ),
        ).length;
      };

      const countLibraryIds = (
        element: Element,
      ): number => {
        const text =
          element.textContent ??
          "";

        return new Set(
          Array.from(
            text.matchAll(
              /(?:Library ID|लाइब्रेरी ID)\s*:?\s*(\d{6,})/gi,
            ),
          ).map(
            (match) =>
              match[1],
          ),
        ).size;
      };

      const findCardRoot = (
        anchor: Element,
      ): Element | null => {
        let current:
          | Element
          | null =
          anchor;

        let best:
          | Element
          | null =
          null;

        for (
          let depth = 0;
          depth < 18 &&
          current;
          depth += 1
        ) {
          const adLinkCount =
            countAdLinks(
              current,
            );

          const libraryIdCount =
            countLibraryIds(
              current,
            );

          const text =
            (
              current as HTMLElement
            ).innerText ??
            current.textContent ??
            "";

          const normalized =
            normalize(text);

          if (
            normalized.length >=
              80 &&
            normalized.length <=
              30000 &&
            (
              adLinkCount ===
                1 ||
              libraryIdCount ===
                1
            )
          ) {
            best =
              current;
          }

          if (
            adLinkCount > 1 ||
            libraryIdCount > 1
          ) {
            break;
          }

          current =
            current.parentElement;
        }

        return best;
      };

      const candidateRoots =
        new Map<
          string,
          Element
        >();

      /*
       * ---------------------------------------------------------
       * PRIMARY DISCOVERY:
       *
       * Find actual Ad Library detail links.
       *
       * This does NOT require the text "Library ID" to exist.
       * ---------------------------------------------------------
       */
      const adAnchors =
        Array.from(
          document.querySelectorAll(
            "a[href]",
          ),
        );

      for (
        const anchor of
          adAnchors
      ) {
        const href =
          anchor.getAttribute(
            "href",
          );

        if (!href) {
          continue;
        }

        const id =
          extractAdIdFromUrl(
            href,
          );

        if (!id) {
          continue;
        }

        const root =
          findCardRoot(
            anchor,
          );

        if (
          root &&
          !candidateRoots.has(
            id,
          )
        ) {
          candidateRoots.set(
            id,
            root,
          );
        }
      }

      /*
       * ---------------------------------------------------------
       * SECONDARY DISCOVERY:
       *
       * Search visible text for Library IDs.
       * ---------------------------------------------------------
       */
      if (
        candidateRoots.size ===
        0
      ) {
        const root =
          document.body ??
          document.documentElement;

        if (root) {
          const walker =
            document.createTreeWalker(
              root,
              NodeFilter.SHOW_TEXT,
            );

          let node =
            walker.nextNode();

          while (node) {
            const id =
              extractLibraryId(
                node.textContent ??
                  "",
              );

            if (id) {
              const element =
                node.parentElement;

              if (element) {
                const card =
                  findCardRoot(
                    element,
                  );

                if (
                  card &&
                  !candidateRoots.has(
                    id,
                  )
                ) {
                  candidateRoots.set(
                    id,
                    card,
                  );
                }
              }
            }

            node =
              walker.nextNode();
          }
        }
      }

      /*
       * ---------------------------------------------------------
       * THIRD DISCOVERY:
       *
       * Article / role based fallback.
       * ---------------------------------------------------------
       */
      if (
        candidateRoots.size ===
        0
      ) {
        const fallbackCards =
          Array.from(
            document.querySelectorAll(
              [
                '[role="article"]',
                "article",
              ].join(","),
            ),
          );

        for (
          const card of
            fallbackCards
        ) {
          const text =
            (
              card as HTMLElement
            ).innerText ??
            "";

          const id =
            extractLibraryId(
              text,
            );

          if (id) {
            candidateRoots.set(
              id,
              card,
            );
            continue;
          }

          const link =
            Array.from(
              card.querySelectorAll(
                "a[href]",
              ),
            ).find(
              (anchor) =>
                Boolean(
                  extractAdIdFromUrl(
                    anchor.getAttribute(
                      "href",
                    ) ?? "",
                  ),
                ),
            );

          if (link) {
            const href =
              link.getAttribute(
                "href",
              );

            const linkId =
              extractAdIdFromUrl(
                href ?? "",
              );

            if (
              linkId &&
              !candidateRoots.has(
                linkId,
              )
            ) {
              candidateRoots.set(
                linkId,
                card,
              );
            }
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

      for (
        const [
          discoveredId,
          card,
        ] of candidateRoots
      ) {
        const element =
          card as HTMLElement;

        const rawText =
          element.innerText ??
          element.textContent ??
          "";

        const rawLines =
          rawText
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

        let id = discoveredId;

        if (!id && rawLines.length) {
          const extractedId = extractLibraryId(
            rawLines.join(" "),
          );

          if (extractedId) {
            id = extractedId;
          }
        }

        if (!id) {
          continue;
        }

        /*
         * Ensure the parser always receives a canonical
         * Library ID line even if Meta hides that text.
         */
        if (
          !rawLines.some(
            (line) =>
              /^(?:Library ID|लाइब्रेरी ID)\s*:/i.test(
                line,
              ),
          )
        ) {
          rawLines.unshift(
            `Library ID: ${id}`,
          );
        }

        /*
         * Ensure advertiser parsing sees Sponsored as a
         * structural boundary when the rendered DOM provides it.
         */
        const hasSponsored =
          rawLines.some(
            (line) =>
              /^Sponsored$/i.test(
                line,
              ) ||
              /^प्रायोजित$/u.test(
                line,
              ),
          );

        if (!hasSponsored) {
          const sponsoredIndex =
            rawLines.findIndex(
              (line) =>
                /sponsored/i.test(
                  line,
                ),
            );

          if (
            sponsoredIndex >=
              0
          ) {
            rawLines[
              sponsoredIndex
            ] = "Sponsored";
          }
        }

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

        const videoUrl =
          video?.currentSrc ||
          video?.getAttribute(
            "src",
          ) ||
          null;

        const imageUrl =
          image?.currentSrc ||
          image?.getAttribute(
            "src",
          ) ||
          null;

        const thumbnailUrl =
          video?.getAttribute(
            "poster",
          ) ??
          imageUrl ??
          null;

        const videoDurationSeconds =
          video &&
          Number.isFinite(
            video.duration,
          ) &&
          video.duration > 0
            ? Math.round(
                video.duration,
              )
            : null;

        results.push({
          id,

          rawLines,

          links,

          imageUrl,

          videoUrl,

          thumbnailUrl,

          videoDurationSeconds,

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

      /*
       * Deduplicate inside the browser.
       */
      const unique =
        new Map<
          string,
          RawCard
        >();

      for (
        const card of
          results
      ) {
        if (
          !unique.has(
            card.id,
          )
        ) {
          unique.set(
            card.id,
            card,
          );
        }
      }

      return Array.from(
        unique.values(),
      );
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
      ad.landingPage ?? "",
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

  if (ad.landingPage ?? "") {
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
  advertiserPageId?: string | null,
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
        advertiserPageId,
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
  advertiserPageId?: string | null,
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
    const targetUrl =
  buildLibraryUrl(
    query,
    country,
    advertiserPageId,
  );

console.info(
  "[DeepMetaProvider] Navigating Meta Ad Library:",
  {
    query,
    country,
    advertiserPageId:
      advertiserPageId ??
      null,
    targetUrl,
  },
);

const navigationResponse =
  await page.goto(
    targetUrl,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        60_000,
    },
  );

console.info(
  "[DeepMetaProvider] Meta navigation response:",
  {
    status:
      navigationResponse?.status() ??
      null,

    url:
      page.url(),

    title:
      await page.title().catch(
        () => "",
      ),
  },
);

await page.waitForTimeout(
  2_500,
);
 
/*
 * Meta often continues its client-side navigation after the
 * initial document is available. Wait for the load state when
 * possible, but do not fail the scrape when Meta never reaches
 * a clean "load" state.
 */
await page.waitForLoadState(
  "load",
  {
    timeout: 15_000,
  },
).catch(
  () => undefined,
);

await page.waitForTimeout(
  initialWaitMs,
);

/*
 * Capture diagnostics before the first extraction.
 */
console.info(
  "[DeepMetaProvider] Meta page ready:",
  {
    url:
      page.url(),

    title:
      await page.title().catch(
        () => "",
      ),
  },
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
            advertiserPageId,
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

      /*
       * Quick search is for the user's first-page experience.
       * Stop as soon as we have a useful initial batch.
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
     * A final extraction is useful for deep collection, but it is
     * intentionally skipped for the quick first-page path.
     * That keeps the user-triggered request as fast as possible.
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
        const card of
          finalCards
      ) {
        const ad =
          normalizeCard(
            card,
            query,
            country,
            advertiserPageId,
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
              input.advertiserPageId ??
              undefined,
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
    advertiserPageId:
      input.advertiserPageId ??
      null,
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
