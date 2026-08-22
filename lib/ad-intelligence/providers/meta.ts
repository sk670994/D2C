import path from "node:path";
import { existsSync } from "node:fs";

import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
} from "playwright-core";

import chromium from "@sparticuz/chromium";

import type {
  AdProvider,
  AdSearchInput,
  ProviderResult,
} from "../provider";

import type {
  AdCreativeType,
  CompetitorAd,
} from "../types";

/* =========================================================
 * TYPES
 * ======================================================= */

type PartnershipType =
  | "direct"
  | "creator"
  | "unknown";

type DomLinkCandidate = {
  href: string;
  text: string;
};

type ScrapedMetaAd = {
  id: string;

  advertiserName?: string | null;
  creatorName?: string | null;
  partnershipType?: PartnershipType;

  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  callToAction?: string | null;

  firstSeen?: string | null;
  lastSeen?: string | null;

  landingPage?: string | null;
  isActive?: boolean;

  publisherPlatforms?: string[];

  productName?: string | null;
  productPrice?: number | null;
  offer?: string | null;

  creativeType?: AdCreativeType;

  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;

  hasVideo?: boolean;
  hasImage?: boolean;
  hasCarousel?: boolean;

  videoDurationSeconds?: number | null;

  rawLines: string[];
};

/* =========================================================
 * CONSTANTS
 * ======================================================= */

const META_LIB_EN_BASE_URL =
  "https://www.facebook.com/ads/library/";

const DEFAULT_COUNTRY = "IN";
const DEFAULT_MAX_SCROLLS = 14;
const TARGET_LIBRARY_IDS = 80;
const META_CACHE_TTL_MS = 5 * 60 * 1000;

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

const CTA_SET = new Set(
  CTA_VALUES.map((value) =>
    value.toLowerCase(),
  ),
);

/* =========================================================
 * BROWSER
 * ======================================================= */

function getLocalBrowserExecutable(): string {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.EDGE_EXECUTABLE_PATH,

    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",

    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0,
  );

  for (const candidate of candidates) {
    let absolutePath: string;

    try {
      if (/^file:\/\//i.test(candidate)) {
        console.warn(
          "[MetaProvider] Ignoring file:// browser path:",
          candidate,
        );

        continue;
      }

      absolutePath = path.resolve(candidate);
    } catch (error) {
      console.warn(
        "[MetaProvider] Invalid browser path candidate:",
        candidate,
        error,
      );

      continue;
    }

    try {
      if (existsSync(absolutePath)) {
        console.log(
          "[MetaProvider] Local browser executable:",
          absolutePath,
        );

        return absolutePath;
      }
    } catch (error) {
      console.warn(
        "[MetaProvider] Could not inspect browser path:",
        absolutePath,
        error,
      );
    }
  }

  throw new Error(
    [
      "No local Chrome/Edge executable found.",
      "Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH.",
      "",
      "Checked paths:",
      ...candidates,
    ].join("\n"),
  );
}

let metaBrowser: Browser | null = null;

let metaBrowserPromise:
  | Promise<Browser>
  | null = null;

async function getMetaBrowser(): Promise<Browser> {
  if (metaBrowser) {
    try {
      if (metaBrowser.isConnected()) {
        return metaBrowser;
      }
    } catch {
      // Browser is no longer usable.
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
        executablePath =
          getLocalBrowserExecutable();

        launchArgs = [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
        ];
      } else {
        executablePath =
          await chromium.executablePath();

        launchArgs = [
          ...chromium.args,
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ];
      }

      console.log(
        "[MetaProvider] Launching reusable Chromium",
      );

      console.log(
        "[MetaProvider] executablePath:",
        executablePath,
      );

      const browser =
        await playwrightChromium.launch({
          executablePath,
          args: launchArgs,
          headless: true,
        });

      browser.on(
        "disconnected",
        () => {
          console.log(
            "[MetaProvider] Chromium disconnected",
          );

          if (
            metaBrowser === browser
          ) {
            metaBrowser = null;
          }
        },
      );

      metaBrowser = browser;

      return browser;
    })().finally(() => {
      metaBrowserPromise = null;
    });
  }

  return metaBrowserPromise;
}

async function resetMetaBrowser(): Promise<void> {
  const browser = metaBrowser;

  metaBrowser = null;
  metaBrowserPromise = null;

  if (!browser) {
    return;
  }

  try {
    await browser.close();
  } catch (error) {
    console.warn(
      "[MetaProvider] Browser close failed:",
      error,
    );
  }
}

/* =========================================================
 * SAFE CONTEXT CLOSE
 * ======================================================= */

async function safeCloseContext(
  context: BrowserContext | null,
): Promise<void> {
  if (!context) {
    return;
  }

  try {
    await context.close();
  } catch (error) {
    console.warn(
      "[MetaProvider] Browser context close failed; ignoring:",
      error,
    );
  }
}

/* =========================================================
 * TEXT
 * ======================================================= */

function cleanText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function repairMojibake(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    !/[ÃÂà¤à¥]/.test(value) &&
    !value.includes("�")
  ) {
    return value;
  }

  try {
    const bytes =
      Uint8Array.from(
        Array.from(
          value,
          (character) =>
            character.charCodeAt(0) &
            0xff,
        ),
      );

    const repaired =
      new TextDecoder("utf-8", {
        fatal: false,
      }).decode(bytes);

    if (
      repaired &&
      repaired !== value &&
      !repaired.includes("�")
    ) {
      return repaired;
    }
  } catch {
    // Keep original value.
  }

  return value;
}

function normalizeExtractedText(
  value: unknown,
): string | null {
  return repairMojibake(
    cleanText(value),
  );
}

function normalizeWhitespace(
  value?: string | null,
): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
 * URL
 * ======================================================= */

function unwrapFacebookRedirect(
  value: string | null,
): string | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (
      url.hostname ===
        "l.facebook.com" &&
      url.pathname === "/l.php"
    ) {
      const destination =
        url.searchParams.get("u");

      if (destination) {
        try {
          return decodeURIComponent(
            destination,
          );
        } catch {
          return destination;
        }
      }
    }

    return url.toString();
  } catch {
    return text;
  }
}

function normalizeUrl(
  value: unknown,
): string | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  const unwrapped =
    unwrapFacebookRedirect(text);

  if (!unwrapped) {
    return null;
  }

  try {
    return new URL(unwrapped).toString();
  } catch {
    return null;
  }
}

function isFacebookInternalUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    const host =
      url.hostname.toLowerCase();

    return (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com")
    );
  } catch {
    return false;
  }
}

function isDomain(
  value: string,
): boolean {
  const text = value.trim();

  if (!text) {
    return false;
  }

  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(
    text,
  );
}

/* =========================================================
 * PRICE
 * ======================================================= */

function parsePrice(
  value: unknown,
): number | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  const match = text.match(
    /(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)/i,
  );

  if (!match) {
    return null;
  }

  const number = Number(
    match[1].replace(/,/g, ""),
  );

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
 * DATES
 * ======================================================= */

const MONTHS: Record<
  string,
  number
> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const HINDI_MONTHS: Record<
  string,
  number
> = {
  जनवरी: 0,
  फरवरी: 1,
  मार्च: 2,
  अप्रैल: 3,
  मई: 4,
  जून: 5,
  जुलाई: 6,
  अगस्त: 7,
  सितंबर: 8,
  सितम्बर: 8,
  अक्टूबर: 9,
  नवंबर: 10,
  नवम्बर: 10,
  दिसंबर: 11,
  दिसम्बर: 11,
};

function createValidDate(
  year: number,
  month: number,
  day: number,
): Date | null {
  const date = new Date(
    year,
    month,
    day,
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDate(
  value: string | null | undefined,
): Date | null {
  const cleaned =
    normalizeExtractedText(value);

  if (!cleaned) {
    return null;
  }

  let match = cleaned.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i,
  );

  if (match) {
    const month =
      MONTHS[
        match[2].toLowerCase()
      ];

    if (month !== undefined) {
      return createValidDate(
        Number(match[3]),
        month,
        Number(match[1]),
      );
    }
  }

  match = cleaned.match(
    /^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})$/u,
  );

  if (match) {
    const month =
      HINDI_MONTHS[match[2]];

    if (month !== undefined) {
      return createValidDate(
        Number(match[3]),
        month,
        Number(match[1]),
      );
    }
  }

  const native =
    new Date(cleaned);

  if (!Number.isNaN(native.getTime())) {
    return native;
  }

  return null;
}

function extractDateRange(
  lines: string[],
): {
  firstSeen: string | null;
  lastSeen: string | null;
} {
  const englishRange =
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;

  const hindiRange =
    /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/u;

  const englishStarted =
    /Started running on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;

  const hindiStarted =
    /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s+को\s+चलना\s+शुरू\s+हुआ/u;

  for (const rawLine of lines) {
    const line =
      normalizeExtractedText(
        rawLine,
      );

    if (!line) {
      continue;
    }

    let match =
      line.match(englishRange);

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: match[2],
      };
    }

    match =
      line.match(hindiRange);

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: match[2],
      };
    }

    match =
      line.match(englishStarted);

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: null,
      };
    }

    match =
      line.match(hindiStarted);

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: null,
      };
    }
  }

  return {
    firstSeen: null,
    lastSeen: null,
  };
}

function calculateRunningDays(
  firstSeen: string | null | undefined,
  lastSeen: string | null | undefined,
): number {
  const start =
    parseDate(firstSeen);

  if (!start) {
    return 0;
  }

  const end =
    parseDate(lastSeen) ??
    new Date();

  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );

  const endDay = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );

  const diff =
    endDay.getTime() -
    startDay.getTime();

  if (diff < 0) {
    return 0;
  }

  return (
    Math.floor(
      diff /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

/* =========================================================
 * LINE HELPERS
 * ======================================================= */

function isCTA(
  value: string,
): boolean {
  return CTA_SET.has(
    value.trim().toLowerCase(),
  );
}

function isLibraryIdLine(
  value: string,
): boolean {
  return /^(?:Library ID|लाइब्रेरी ID):\s*\d+$/i.test(
    value.trim(),
  );
}

function isVideoTimeLine(
  value: string,
): boolean {
  return /^\d+:\d{2}\s*\/\s*\d+:\d{2}$/i.test(
    value.trim(),
  );
}

function isStatusLine(
  value: string,
): boolean {
  return /^(?:Active|Inactive|Image|Video|Carousel|सक्रिय|निष्क्रिय)$/iu.test(
    value.trim(),
  );
}

function isDateOnly(
  value: string,
): boolean {
  const text =
    value.trim();

  return (
    /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
      text,
    ) ||
    /^\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
      text,
    ) ||
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i.test(
      text,
    ) ||
    /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/u.test(
      text,
    )
  );
}

function isPriceLine(
  value: string,
): boolean {
  return /^(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?$/i.test(
    value.trim(),
  );
}

function isSentenceLike(
  value: string,
): boolean {
  return (
    value.length > 120 ||
    /[.!?]\s+/.test(value)
  );
}

function isOfferLike(
  value: string,
): boolean {
  return (
    /\b\d{1,3}\s*%\s*(?:off|discount)\b/i.test(
      value,
    ) ||
    /\b(?:flat|upto|up to|save)\b.*?\d{1,3}\s*%/i.test(
      value,
    ) ||
    /\b(?:code|coupon)\s*[:\-]?\s*[A-Z0-9_-]+\b/i.test(
      value,
    ) ||
    /\bprice\s*drop\b/i.test(value) ||
    /\bfree\s+shipping\b/i.test(value)
  );
}

function looksLikePersonName(
  value: string,
): boolean {
  const text =
    value.trim();

  if (!text) {
    return false;
  }

  if (
    /^@[A-Za-z0-9._-]+$/.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /^[A-Za-z0-9._-]{3,40}$/.test(
      text,
    ) &&
    (
      text.includes("_") ||
      text.includes(".")
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
 * CTA
 * ======================================================= */

function extractCallToAction(
  lines: string[],
): string | null {
  for (const line of lines) {
    const cleaned =
      normalizeExtractedText(
        line,
      );

    if (!cleaned) {
      continue;
    }

    if (isCTA(cleaned)) {
      return (
        CTA_VALUES.find(
          (cta) =>
            cta.toLowerCase() ===
            cleaned.toLowerCase(),
        ) ?? cleaned
      );
    }
  }

  return null;
}

/* =========================================================
 * ACTIVE STATUS
 * ======================================================= */

function extractActiveStatus(
  lines: string[],
): boolean {
  const text = lines
    .map(
      (line) =>
        normalizeExtractedText(
          line,
        ) ?? "",
    )
    .join(" ")
    .toLowerCase();

  if (
    text.includes("inactive") ||
    text.includes("निष्क्रिय")
  ) {
    return false;
  }

  /*
   * Meta often does not expose the literal word "Active"
   * in the rendered ad card. Visibility in Ad Library is
   * therefore treated as active unless explicitly inactive.
   */
  return true;
}

/* =========================================================
 * ADVERTISER / CREATOR
 * ======================================================= */

function extractAdvertiserIdentity(
  lines: string[],
): {
  advertiserName: string | null;
  creatorName: string | null;
  partnershipType: PartnershipType;
} {
  const sponsoredIndex =
    lines.findIndex((line) => {
      const value =
        normalizeExtractedText(
          line,
        );

      return (
        value?.toLowerCase() ===
          "sponsored" ||
        value === "प्रायोजित"
      );
    });

  if (sponsoredIndex <= 0) {
    return {
      advertiserName: null,
      creatorName: null,
      partnershipType: "unknown",
    };
  }

  const candidate =
    normalizeExtractedText(
      lines[
        sponsoredIndex - 1
      ],
    );

  if (!candidate) {
    return {
      advertiserName: null,
      creatorName: null,
      partnershipType: "unknown",
    };
  }

  const creatorMatch =
    candidate.match(
      /^(.+?)\s+(?:के\s+साथ|with)\s+(.+)$/iu,
    );

  if (creatorMatch) {
    return {
      advertiserName:
        normalizeWhitespace(
          creatorMatch[1],
        ),
      creatorName:
        normalizeWhitespace(
          creatorMatch[2],
        ),
      partnershipType: "creator",
    };
  }

  return {
    advertiserName: candidate,
    creatorName: null,
    partnershipType: "direct",
  };
}

/* =========================================================
 * PRIMARY TEXT
 * ======================================================= */

function extractPrimaryText(
  lines: string[],
): string | null {
  const sponsoredIndex =
    lines.findIndex((line) => {
      const value =
        normalizeExtractedText(
          line,
        );

      return (
        value?.toLowerCase() ===
          "sponsored" ||
        value === "प्रायोजित"
      );
    });

  const start =
    sponsoredIndex >= 0
      ? sponsoredIndex + 1
      : 0;

  const parts: string[] = [];

  for (
    let i = start;
    i < lines.length;
    i++
  ) {
    const candidate =
      normalizeExtractedText(
        lines[i],
      );

    if (!candidate) {
      continue;
    }

    if (isDomain(candidate)) {
      break;
    }

    if (isPriceLine(candidate)) {
      continue;
    }

    if (
      isLibraryIdLine(candidate)
    ) {
      continue;
    }

    if (
      isVideoTimeLine(candidate)
    ) {
      continue;
    }

    if (isCTA(candidate)) {
      continue;
    }

    if (
      isStatusLine(candidate)
    ) {
      continue;
    }

    if (
      isDateOnly(candidate)
    ) {
      continue;
    }

    if (
      candidate.length >= 8 &&
      candidate.length <= 4000
    ) {
      parts.push(candidate);
    }

    if (
      parts.join(" ").length >=
      4000
    ) {
      break;
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return normalizeWhitespace(
    parts.join(" "),
  );
}

/* =========================================================
 * PRODUCT / HEADLINE
 *
 * Generic scoring.
 * No brand-specific hardcoding.
 * ======================================================= */

function scoreProductCandidate(
  value: string,
  links: DomLinkCandidate[],
  domainIndex: number,
  index: number,
): number {
  let score = 0;

  const text =
    normalizeWhitespace(value);

  const wordCount =
    text
      .split(/\s+/)
      .filter(Boolean)
      .length;

  const positionAfterDomain =
    domainIndex >= 0
      ? index - domainIndex - 1
      : 999;

  if (
    wordCount >= 2 &&
    wordCount <= 18
  ) {
    score += 20;
  }

  if (
    text.length >= 5 &&
    text.length <= 180
  ) {
    score += 15;
  }

  if (
    domainIndex >= 0 &&
    index > domainIndex
  ) {
    score += 40;
  }

  if (
    positionAfterDomain === 0
  ) {
    score += 15;
  } else if (
    positionAfterDomain === 1
  ) {
    score += 8;
  }

  const isLinkText =
    links.some(
      (link) =>
        link.text.toLowerCase() ===
        text.toLowerCase(),
    );

  if (isLinkText) {
    score += 20;
  }

  if (isCTA(text)) {
    score -= 100;
  }

  if (isDateOnly(text)) {
    score -= 100;
  }

  if (isStatusLine(text)) {
    score -= 100;
  }

  if (isDomain(text)) {
    score -= 100;
  }

  if (isLibraryIdLine(text)) {
    score -= 100;
  }

  if (isVideoTimeLine(text)) {
    score -= 100;
  }

  if (isPriceLine(text)) {
    score -= 100;
  }

  if (looksLikePersonName(text)) {
    score -= 60;
  }

  if (isSentenceLike(text)) {
    score -= 15;
  }

  if (isOfferLike(text)) {
    score -= 30;
  }

  if (
    /\b(?:ml|mg|gm|g|kg|oz|pack|pcs|piece|combo|kit)\b/i.test(
      text,
    )
  ) {
    score += 15;
  }

  /*
   * Generic product-category signals.
   * No brand names are hardcoded.
   */
  if (
    /\b(?:shampoo|conditioner|serum|cream|face\s*wash|facewash|lipstick|oil|cleanser|moisturizer|sunscreen|mask|scrub|toner|gel|lotion|body\s*wash|soap|perfume|fragrance|foundation|concealer|powder)\b/i.test(
      text,
    )
  ) {
    score += 20;
  }

  return score;
}

function extractProductName(
  lines: string[],
  links: DomLinkCandidate[] = [],
): string | null {
  const normalizedLines =
    lines
      .map(
        (line) =>
          normalizeExtractedText(
            line,
          ),
      )
      .filter(
        (
          line,
        ): line is string =>
          Boolean(line),
      );

  if (
    normalizedLines.length === 0
  ) {
    return null;
  }

  const domainIndex =
    normalizedLines.findIndex(
      isDomain,
    );

  const indexes =
    domainIndex >= 0
      ? Array.from(
          {
            length:
              normalizedLines.length -
              domainIndex -
              1,
          },
          (_, offset) =>
            domainIndex +
            1 +
            offset,
        )
      : Array.from(
          {
            length:
              normalizedLines.length,
          },
          (_, index) => index,
        );

  const candidates: Array<{
    text: string;
    score: number;
  }> = [];

  for (const index of indexes) {
    const candidate =
      normalizedLines[index];

    if (
      candidate.length < 3 ||
      candidate.length > 500
    ) {
      continue;
    }

    const score =
      scoreProductCandidate(
        candidate,
        links,
        domainIndex,
        index,
      );

    if (score >= 10) {
      candidates.push({
        text: candidate,
        score,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score,
  );

  return (
    candidates[0]?.text ??
    null
  );
}

/* =========================================================
 * OFFER
 * ======================================================= */

function extractOffer(
  primaryText: string | null,
  lines: string[],
): string | null {
  const text = [
    primaryText ?? "",
    ...lines,
  ]
    .map(
      (value) =>
        normalizeExtractedText(
          value,
        ) ?? "",
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  const patterns = [
    /\bflat\s+\d{1,3}%\s*off\b(?:\s*\|\s*code[:\s]*[A-Z0-9_-]+)?/i,
    /\bup\s*to\s+\d{1,3}%\s*off\b(?:\s*\|\s*code[:\s]*[A-Z0-9_-]+)?/i,
    /\bupto\s+\d{1,3}%\s*off\b(?:\s*\|\s*code[:\s]*[A-Z0-9_-]+)?/i,
    /\b\d{1,3}%\s*off\b(?:\s*\|\s*code[:\s]*[A-Z0-9_-]+)?/i,
    /\b\d{1,3}%\s*discount\b/i,
    /\buse\s+code[:\s]+[A-Z0-9_-]+\b/i,
    /\bprice\s*drop\b/i,
    /\bsale\s+is\s+live\b/i,
    /\bfree\s+shipping\b/i,
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match) {
      return (
        normalizeExtractedText(
          match[0],
        ) ?? null
      );
    }
  }

  return null;
}

/* =========================================================
 * LANDING PAGE
 * ======================================================= */

function extractLandingPageFromLinks(
  links: DomLinkCandidate[],
): string | null {
  const candidates: Array<{
    url: string;
    score: number;
  }> = [];

  for (const link of links) {
    if (!link.href) {
      continue;
    }

    const normalized =
      normalizeUrl(link.href);

    if (!normalized) {
      continue;
    }

    let score = 0;

    if (
      isFacebookInternalUrl(
        normalized,
      )
    ) {
      score -= 100;
    } else {
      score += 100;
    }

    if (isCTA(link.text)) {
      score += 20;
    }

    if (
      /\b(?:shop|buy|learn|order|offer)\b/i.test(
        link.text,
      )
    ) {
      score += 10;
    }

    candidates.push({
      url: normalized,
      score,
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score,
  );

  return (
    candidates[0]?.url ??
    null
  );
}

function extractLandingPage(
  lines: string[],
  links: DomLinkCandidate[] = [],
): string | null {
  const fromLinks =
    extractLandingPageFromLinks(
      links,
    );

  if (fromLinks) {
    return fromLinks;
  }

  for (const line of lines) {
    const text =
      normalizeExtractedText(
        line,
      );

    if (!text) {
      continue;
    }

    const explicit =
      text.match(
        /https?:\/\/[^\s]+/i,
      );

    if (explicit) {
      const normalized =
        normalizeUrl(
          explicit[0],
        );

      if (
        normalized &&
        !isFacebookInternalUrl(
          normalized,
        )
      ) {
        return normalized;
      }
    }

    if (isDomain(text)) {
      return `https://${text.toLowerCase()}/`;
    }
  }

  return null;
}

/* =========================================================
 * CREATIVE TYPE
 * ======================================================= */

function inferCreativeType(
  input: ScrapedMetaAd,
): AdCreativeType {
  if (input.hasVideo) {
    return "video";
  }

  if (input.hasCarousel) {
    return "carousel";
  }

  if (input.hasImage) {
    return "image";
  }

  const text =
    input.rawLines
      .map(
        (line) =>
          normalizeExtractedText(
            line,
          ) ?? "",
      )
      .join(" ")
      .toLowerCase();

  if (
    /\b\d+:\d{2}\s*\/\s*\d+:\d{2}\b/.test(
      text,
    )
  ) {
    return "video";
  }

  return "unknown";
}

/* =========================================================
 * CREATIVE SCORE
 * ======================================================= */

function calculateCreativeScore(
  ad: ScrapedMetaAd,
): number {
  let score = 40;

  if (ad.primaryText) {
    score += 10;
  }

  if (ad.headline) {
    score += 10;
  }

  if (ad.callToAction) {
    score += 5;
  }

  if (ad.productName) {
    score += 10;
  }

  if (ad.offer) {
    score += 10;
  }

  if (ad.landingPage) {
    score += 5;
  }

  if (ad.hasVideo) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

function normalizeScrapedAd(
  input: ScrapedMetaAd,
  query: string,
  country: string,
): CompetitorAd {
  const lines =
    input.rawLines ?? [];

  const identity =
    extractAdvertiserIdentity(
      lines,
    );

  const advertiser =
    normalizeExtractedText(
      input.advertiserName,
    ) ??
    identity.advertiserName ??
    "Unknown advertiser";

  const creatorName =
    normalizeExtractedText(
      input.creatorName,
    ) ??
    identity.creatorName;

  const partnershipType =
    input.partnershipType ??
    identity.partnershipType;

  const primaryText =
    normalizeExtractedText(
      input.primaryText,
    ) ??
    extractPrimaryText(lines);

  const productName =
    normalizeExtractedText(
      input.productName,
    ) ??
    extractProductName(
      lines,
    );

  const headline =
    normalizeExtractedText(
      input.headline,
    ) ??
    productName;

  const callToAction =
    normalizeExtractedText(
      input.callToAction,
    ) ??
    extractCallToAction(
      lines,
    );

  const dates =
    extractDateRange(lines);

  const firstSeen =
    normalizeExtractedText(
      input.firstSeen,
    ) ??
    dates.firstSeen;

  const lastSeen =
    normalizeExtractedText(
      input.lastSeen,
    ) ??
    dates.lastSeen;

  const landingPage =
    normalizeUrl(
      input.landingPage,
    ) ??
    extractLandingPage(
      lines,
    );

  const offer =
    normalizeExtractedText(
      input.offer,
    ) ??
    extractOffer(
      primaryText,
      lines,
    );

  const productPrice =
    typeof input.productPrice ===
    "number"
      ? input.productPrice
      : parsePrice(
          lines.find((line) =>
            /(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
              normalizeExtractedText(
                line,
              ) ?? "",
            ),
          ) ?? null,
        );

  const isActive =
    typeof input.isActive ===
    "boolean"
      ? input.isActive
      : extractActiveStatus(
          lines,
        );

  const creativeType =
    input.creativeType ??
    inferCreativeType(input);

  const runningDays =
    calculateRunningDays(
      firstSeen,
      lastSeen,
    );

  const normalizedInput: ScrapedMetaAd =
    {
      ...input,
      advertiserName:
        advertiser,
      primaryText,
      headline,
      productName,
      callToAction,
      offer,
      landingPage,
      rawLines: lines,
    };

  return {
    id: input.id,

    platform: "meta",

    advertiserName: advertiser,

    advertiserId: null,

    ...(creatorName
      ? { creatorName }
      : {}),

    ...(partnershipType !==
    "unknown"
      ? {
          partnershipType,
        }
      : {}),

    country,

    creativeType,

    imageUrl:
      input.imageUrl ?? null,

    videoUrl:
      input.videoUrl ?? null,

    thumbnailUrl:
      input.thumbnailUrl ?? null,

    primaryText,

    headline,

    description:
      normalizeExtractedText(
        input.description,
      ),

    callToAction,

    firstSeen,

    lastSeen,

    isActive,

    publisherPlatforms:
      input.publisherPlatforms ??
      [],

    landingPage,

    sourceUrl:
      buildLibraryUrl(
        query,
        country,
      ),

    productName,

    productPrice,

    currency:
      productPrice !== null
        ? "INR"
        : null,

    offer,

    runningDays,

    creativeScore:
      calculateCreativeScore(
        normalizedInput,
      ),

    videoDurationSeconds:
      input.videoDurationSeconds ??
      null,

    transcript: null,

    transcriptStatus:
      creativeType === "video"
        ? "pending"
        : "not_video",

    metricSources: {
      creativeScore:
        "estimated",

      longevityScore:
        "derived",

      relevanceScore:
        "derived",

      engagementPotentialScore:
        "estimated",

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
        "playwright-rendered-meta-library",

      searchQuery: query,

      country,

      rawLines: lines,
    },
  };
}

/* =========================================================
 * SEARCH RELEVANCE
 * ======================================================= */

function normalizeQueryForMatch(
  value: string,
): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactMatch(
  value: string,
): string {
  return normalizeQueryForMatch(
    value,
  ).replace(/\s+/g, "");
}

function hostContainsQuery(
  url:
    | string
    | null
    | undefined,
  query: string,
): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    const host =
      parsed.hostname
        .replace(/^www\./i, "")
        .toLowerCase();

    const compactQuery =
      compactMatch(query);

    return (
      compactQuery.length >= 3 &&
      host.includes(compactQuery)
    );
  } catch {
    return false;
  }
}

function isRelevantToAdvertiser(
  ad: CompetitorAd,
  query: string,
): boolean {
  const normalize = (
    value:
      | string
      | null
      | undefined,
  ) =>
    normalizeQueryForMatch(
      value ?? "",
    );

  const q = normalize(query);

  if (!q) {
    return false;
  }

  const advertiser =
    normalize(
      ad.advertiserName,
    );

  const creator =
    normalize(
      ad.creatorName,
    );

  if (
    advertiser &&
    advertiser !==
      "unknown advertiser" &&
    (
      advertiser === q ||
      advertiser.includes(q) ||
      q.includes(advertiser)
    )
  ) {
    return true;
  }

  if (
    creator &&
    (
      creator === q ||
      creator.includes(q) ||
      q.includes(creator)
    )
  ) {
    return true;
  }

  if (
    hostContainsQuery(
      ad.landingPage,
      query,
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
 * LIBRARY URL
 * ======================================================= */

export function buildLibraryUrl(
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

  return `${META_LIB_EN_BASE_URL}?${params.toString()}`;
}

/* =========================================================
 * SCRAPER
 * ======================================================= */

async function scrapeMetaAdLibraryOnce(
  query: string,
  country: string,
  maxScrolls = DEFAULT_MAX_SCROLLS,
): Promise<ScrapedMetaAd[]> {
  const browser =
    await getMetaBrowser();

  let context:
    | BrowserContext
    | null = null;

  try {
    context =
      await browser.newContext({
        locale: "en-IN",

        viewport: {
          width: 1440,
          height: 1000,
        },

        extraHTTPHeaders: {
          "Accept-Language":
            "en-IN,en;q=0.9",
        },
      });

    const page =
      await context.newPage();

    const url =
      buildLibraryUrl(
        query,
        country,
      );

    console.log(
      "[MetaProvider] Opening:",
      url,
    );

    const response =
      await page.goto(url, {
        waitUntil:
          "domcontentloaded",
        timeout: 60_000,
      });

    console.log(
      "[MetaProvider] HTTP status:",
      response?.status(),
    );

    console.log(
      "[MetaProvider] Page title:",
      await page.title(),
    );

    console.log(
      "[MetaProvider] Final URL:",
      page.url(),
    );

    /*
     * Meta may return HTTP 403 while still rendering
     * usable Ad Library content in Chromium.
     */
    await page.waitForTimeout(
      2500,
    );

    /* -----------------------------------------------------
     * SCROLL
     * --------------------------------------------------- */

    let previousCount = 0;
    let stableRounds = 0;

    for (
      let i = 0;
      i < maxScrolls;
      i++
    ) {
      await page.mouse.wheel(
        0,
        2200,
      );

      await page.waitForTimeout(
        650,
      );

      const count =
        await page.evaluate(() => {
          const bodyText =
            document.body?.innerText ??
            "";

          const matches =
            bodyText.match(
              /(?:Library ID|लाइब्रेरी ID):\s*\d+/gi,
            ) ?? [];

          /*
           * Use the numeric IDs rather than the complete
           * "Library ID: ..." strings.
           */
          const ids =
            matches
              .map((value) => {
                const match =
                  value.match(
                    /(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i,
                  );

                return (
                  match?.[1] ??
                  null
                );
              })
              .filter(
                (
                  value,
                ): value is string =>
                  value !== null,
              );

          return new Set(ids).size;
        });

      console.log(
        `[MetaProvider] Scroll ${
          i + 1
        }: ${count} library IDs`,
      );

      if (
        count ===
        previousCount
      ) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }

      previousCount = count;

      if (
        count >= TARGET_LIBRARY_IDS
      ) {
        console.log(
          "[MetaProvider] Target library ID count reached:",
          count,
        );

        break;
      }

      if (
        stableRounds >= 4 &&
        count > 0
      ) {
        console.log(
          "[MetaProvider] Library ID count stabilized:",
          count,
        );

        break;
      }
    }

    await page.waitForTimeout(
      700,
    );

    /* -----------------------------------------------------
     * EXTRACTION
     *
     * IMPORTANT:
     * Every helper used here must exist INSIDE page.evaluate()
     * because evaluate executes in the browser context.
     * --------------------------------------------------- */

    const ads =
      await page.evaluate(
       (ctaValues: readonly string[]) => {
          const CTA_SET =
            new Set(
              ctaValues.map(
                (value) =>
                  value.toLowerCase(),
              ),
            );

          /* ---------------------------------------------
           * BROWSER-SCOPE HELPERS
           * ------------------------------------------- */

          const normalizeText = (
            value: string,
          ): string =>
            value
              .replace(
                /\u200B/g,
                "",
              )
              .replace(
                /\u200C/g,
                "",
              )
              .replace(
                /\u200D/g,
                "",
              )
              .replace(
                /\uFEFF/g,
                "",
              )
              .replace(
                /\u00A0/g,
                " ",
              )
              .replace(
                /\r/g,
                " ",
              )
              .replace(
                /\n/g,
                " ",
              )
              .replace(
                /\s+/g,
                " ",
              )
              .trim();

          const getLibraryId = (
            text: string,
          ): string | null => {
            const match =
              text.match(
                /(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i,
              );

            return (
              match?.[1] ??
              null
            );
          };

          const containsLibraryId = (
            text: string,
          ): boolean =>
            /(?:Library ID|लाइब्रेरी ID):\s*\d+/i.test(
              text,
            );

          const isDomain = (
            value: string,
          ): boolean =>
            /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(
              value.trim(),
            );

          const isCTA = (
            value: string,
          ): boolean =>
            CTA_SET.has(
              value
                .trim()
                .toLowerCase(),
            );

          const isDateOnly = (
            value: string,
          ): boolean => {
            const text =
              value.trim();

            return (
              /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
                text,
              ) ||
              /^\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
                text,
              ) ||
              /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i.test(
                text,
              ) ||
              /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/u.test(
                text,
              )
            );
          };

          const isStatus = (
            value: string,
          ): boolean =>
            /^(?:Active|Inactive|Image|Video|Carousel|सक्रिय|निष्क्रिय)$/iu.test(
              value.trim(),
            );

          const isVideoTime = (
            value: string,
          ): boolean =>
            /^\d+:\d{2}\s*\/\s*\d+:\d{2}$/i.test(
              value.trim(),
            );

          const isLibraryLine = (
            value: string,
          ): boolean =>
            /^(?:Library ID|लाइब्रेरी ID):\s*\d+$/i.test(
              value.trim(),
            );

          /*
           * IMPORTANT:
           * This helper is duplicated inside evaluate on purpose.
           * The page context cannot access Node.js functions.
           */
          const looksLikePersonName = (
            value: string,
          ): boolean => {
            const text =
              value.trim();

            if (!text) {
              return false;
            }

            if (
              /^@[A-Za-z0-9._-]+$/.test(
                text,
              )
            ) {
              return true;
            }

            if (
              /^[A-Za-z0-9._-]{3,40}$/.test(
                text,
              ) &&
              (
                text.includes("_") ||
                text.includes(".")
              )
            ) {
              return true;
            }

            return false;
          };

          /*
           * Same reason: this must be available inside evaluate.
           */
          const extractPlatformNames = (
            text: string,
          ): string[] => {
            const platforms = [
              "Facebook",
              "Instagram",
              "Messenger",
              "Audience Network",
              "Threads",
            ];

            const normalized =
              text.toLowerCase();

            return platforms.filter(
              (platform) =>
                normalized.includes(
                  platform.toLowerCase(),
                ),
            );
          };

          const detectHasCarousel = (
            card: Element,
          ): boolean => {
            const selectors = [
              '[aria-label*="carousel" i]',
              '[data-testid*="carousel" i]',
              '[role="group"][aria-roledescription="carousel"]',
            ];

            return Boolean(
              card.querySelector(
                selectors.join(","),
              ),
            );
          };

          const isFacebookInternalUrl = (
            href: string,
          ): boolean => {
            try {
              const url =
                new URL(href);

              const host =
                url.hostname.toLowerCase();

              return (
                host ===
                  "facebook.com" ||
                host.endsWith(
                  ".facebook.com",
                ) ||
                host ===
                  "instagram.com" ||
                host.endsWith(
                  ".instagram.com",
                )
              );
            } catch {
              return false;
            }
          };

          /* ---------------------------------------------
           * FIND CARD CONTAINERS
           * ------------------------------------------- */

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

          let currentNode =
            walker.nextNode();

          while (currentNode) {
            const rawText =
              currentNode.textContent ??
              "";

            if (
              rawText &&
              containsLibraryId(
                rawText,
              )
            ) {
              let current =
                currentNode.parentElement;

              let best:
                | Element
                | null = null;

              for (
                let depth = 0;
                depth < 12 &&
                current;
                depth++
              ) {
                const text =
                  current.textContent?.trim() ??
                  "";

                if (
                  text.length >=
                    100 &&
                  text.length <=
                    30_000 &&
                  containsLibraryId(
                    text,
                  )
                ) {
                  best = current;
                }

                current =
                  current.parentElement;
              }

              if (best) {
                const libraryId =
                  getLibraryId(
                    best.textContent ??
                      "",
                  );

                if (
                  libraryId &&
                  !candidateCards.has(
                    libraryId,
                  )
                ) {
                  candidateCards.set(
                    libraryId,
                    best,
                  );
                }
              }
            }

            currentNode =
              walker.nextNode();
          }

          /* ---------------------------------------------
           * FALLBACK CARD DETECTION
           * ------------------------------------------- */

          if (
            candidateCards.size ===
            0
          ) {
            const possibleContainers =
              Array.from(
                document.querySelectorAll(
                  [
                    '[data-testid]',
                    '[role="article"]',
                    "article",
                  ].join(","),
                ),
              );

            for (const element of possibleContainers) {
              const text =
                element.textContent?.trim() ??
                "";

              if (
                text.length >=
                  100 &&
                text.length <=
                  30_000 &&
                containsLibraryId(
                  text,
                )
              ) {
                const libraryId =
                  getLibraryId(text);

                if (
                  libraryId &&
                  !candidateCards.has(
                    libraryId,
                  )
                ) {
                  candidateCards.set(
                    libraryId,
                    element,
                  );
                }
              }
            }
          }

          /* ---------------------------------------------
           * EXTRACT ADS
           * ------------------------------------------- */

          const seen =
            new Set<string>();

          const results:
            Array<{
              id: string;

              advertiserName:
                | string
                | null;

              creatorName:
                | string
                | null;

              partnershipType:
                PartnershipType;

              primaryText:
                | string
                | null;

              headline:
                | string
                | null;

              productName:
                | string
                | null;

              callToAction:
                | string
                | null;

              firstSeen:
                | string
                | null;

              lastSeen:
                | string
                | null;

              landingPage:
                | string
                | null;

              isActive: boolean;

              publisherPlatforms:
                string[];

              hasVideo: boolean;

              hasImage: boolean;

              hasCarousel: boolean;

              videoUrl:
                | string
                | null;

              imageUrl:
                | string
                | null;

              thumbnailUrl:
                | string
                | null;

              videoDurationSeconds:
                | number
                | null;

              rawLines: string[];
            }> = [];

          for (const card of Array.from(
            candidateCards.values(),
          )) {
            const rawText =
              card.textContent?.trim() ??
              "";

            const id =
              getLibraryId(
                rawText,
              );

            if (!id) {
              continue;
            }

            if (
              seen.has(id)
            ) {
              continue;
            }

            seen.add(id);

            const htmlCard =
              card as HTMLElement;

            const rawLines =
              htmlCard.innerText
                .split(/\r?\n/)
                .map(
                  normalizeText,
                )
                .filter(Boolean);

            /* -------------------------------------------
             * ADVERTISER
             * ----------------------------------------- */

            const sponsoredIndex =
              rawLines.findIndex(
                (line) =>
                  line.toLowerCase() ===
                    "sponsored" ||
                  line ===
                    "प्रायोजित",
              );

            const advertiserLine =
              sponsoredIndex > 0
                ? rawLines[
                    sponsoredIndex - 1
                  ] ?? null
                : null;

            let advertiserName =
              advertiserLine;

            let creatorName:
              | string
              | null = null;

            let partnershipType:
              PartnershipType =
              "direct";

            if (
              advertiserLine
            ) {
              const creatorMatch =
                advertiserLine.match(
                  /^(.+?)\s+(?:के\s+साथ|with)\s+(.+)$/iu,
                );

              if (
                creatorMatch
              ) {
                advertiserName =
                  creatorMatch[1].trim();

                creatorName =
                  creatorMatch[2].trim();

                partnershipType =
                  "creator";
              }
            }

            if (
              !advertiserName
            ) {
              partnershipType =
                "unknown";
            }

            /* -------------------------------------------
             * PRIMARY TEXT
             * ----------------------------------------- */

            const startIndex =
              sponsoredIndex >= 0
                ? sponsoredIndex + 1
                : 0;

            const primaryParts: string[] =
              [];

            for (
              let i = startIndex;
              i < rawLines.length;
              i++
            ) {
              const line =
                rawLines[i];

              if (
                isDomain(line)
              ) {
                break;
              }

              if (
                /^(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
                  line,
                )
              ) {
                continue;
              }

              if (
                isLibraryLine(line)
              ) {
                continue;
              }

              if (
                isVideoTime(line)
              ) {
                continue;
              }

              if (
                isCTA(line)
              ) {
                continue;
              }

              if (
                isStatus(line)
              ) {
                continue;
              }

              if (
                isDateOnly(line)
              ) {
                continue;
              }

              if (
                line.length >= 8 &&
                line.length <= 4000
              ) {
                primaryParts.push(
                  line,
                );
              }

              if (
                primaryParts
                  .join(" ")
                  .length >=
                4000
              ) {
                break;
              }
            }

            const primaryText =
              primaryParts.length > 0
                ? primaryParts.join(
                    " ",
                  )
                : null;

            /* -------------------------------------------
             * LINKS
             * ----------------------------------------- */

            const links: DomLinkCandidate[] =
              Array.from(
                card.querySelectorAll(
                  "a[href]",
                ),
              )
                .map((anchor) => {
                  const href =
                    anchor.getAttribute(
                      "href",
                    );

                  if (!href) {
                    return null;
                  }

                  if (
                    href.startsWith(
                      "javascript:",
                    )
                  ) {
                    return null;
                  }

                  try {
                    const absoluteUrl =
                      new URL(
                        href,
                        window.location.href,
                      ).toString();

                    return {
                      href: absoluteUrl,
                      text:
                        normalizeText(
                          anchor.textContent ??
                            "",
                        ),
                    };
                  } catch {
                    return null;
                  }
                })
                .filter(
                  (
                    value,
                  ): value is DomLinkCandidate =>
                    value !== null,
                );

            /* -------------------------------------------
             * PRODUCT
             * ----------------------------------------- */

            const domainIndex =
              rawLines.findIndex(
                isDomain,
              );

            const candidateIndexes =
              domainIndex >= 0
                ? Array.from(
                    {
                      length:
                        rawLines.length -
                        domainIndex -
                        1,
                    },
                    (_, offset) =>
                      domainIndex +
                      1 +
                      offset,
                  )
                : Array.from(
                    {
                      length:
                        rawLines.length,
                    },
                    (_, index) =>
                      index,
                  );

            const productCandidates: Array<{
              text: string;
              score: number;
            }> = [];

            for (const index of candidateIndexes) {
              const line =
                rawLines[index];

              if (
                !line ||
                line.length < 3 ||
                line.length > 500
              ) {
                continue;
              }

              let score = 0;

              const wordCount =
                line
                  .split(/\s+/)
                  .filter(Boolean)
                  .length;

              const linkText =
                links.some(
                  (link) =>
                    link.text.toLowerCase() ===
                    line.toLowerCase(),
                );

              const positionAfterDomain =
                domainIndex >= 0
                  ? index -
                    domainIndex -
                    1
                  : 999;

              if (
                wordCount >= 2 &&
                wordCount <= 18
              ) {
                score += 20;
              }

              if (
                line.length >= 5 &&
                line.length <= 180
              ) {
                score += 15;
              }

              if (
                domainIndex >= 0 &&
                index > domainIndex
              ) {
                score += 40;
              }

              if (linkText) {
                score += 20;
              }

              if (
                positionAfterDomain ===
                0
              ) {
                score += 15;
              } else if (
                positionAfterDomain ===
                1
              ) {
                score += 8;
              }

              if (isCTA(line)) {
                score -= 100;
              }

              if (
                isDateOnly(line)
              ) {
                score -= 100;
              }

              if (
                isStatus(line)
              ) {
                score -= 100;
              }

              if (
                isDomain(line)
              ) {
                score -= 100;
              }

              if (
                isLibraryLine(line)
              ) {
                score -= 100;
              }

              if (
                isVideoTime(line)
              ) {
                score -= 100;
              }

              if (
                /^(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
                  line,
                )
              ) {
                score -= 100;
              }

              /*
               * FIX:
               * This function now exists inside page.evaluate().
               */
              if (
                looksLikePersonName(
                  line,
                )
              ) {
                score -= 60;
              }

              if (
                line.length > 120 ||
                /[.!?]\s+/.test(
                  line,
                )
              ) {
                score -= 15;
              }

              if (
                /\b\d{1,3}\s*%\s*(?:off|discount)\b/i.test(
                  line,
                ) ||
                /\b(?:price\s*drop|free\s+shipping)\b/i.test(
                  line,
                )
              ) {
                score -= 30;
              }

              if (
                /\b(?:ml|mg|gm|g|kg|oz|pack|pcs|piece|combo|kit)\b/i.test(
                  line,
                )
              ) {
                score += 15;
              }

              if (
                /\b(?:shampoo|conditioner|serum|cream|face\s*wash|facewash|lipstick|oil|cleanser|moisturizer|sunscreen|mask|scrub|toner|gel|lotion|body\s*wash|soap|perfume|fragrance|foundation|concealer|powder)\b/i.test(
                  line,
                )
              ) {
                score += 20;
              }

              if (score >= 10) {
                productCandidates.push(
                  {
                    text: line,
                    score,
                  },
                );
              }
            }

            productCandidates.sort(
              (a, b) =>
                b.score - a.score,
            );

            const productName =
              productCandidates[0]
                ?.text ??
              null;

            /* -------------------------------------------
             * CTA
             * ----------------------------------------- */

            const callToAction =
              rawLines.find(
                isCTA,
              ) ?? null;

            /* -------------------------------------------
             * DATES
             * ----------------------------------------- */

            let firstSeen:
              | string
              | null = null;

            let lastSeen:
              | string
              | null = null;

            for (const line of rawLines) {
              const englishRange =
                line.match(
                  /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
                );

              if (
                englishRange
              ) {
                firstSeen =
                  englishRange[1];

                lastSeen =
                  englishRange[2];

                break;
              }

              const hindiRange =
                line.match(
                  /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/u,
                );

              if (
                hindiRange
              ) {
                firstSeen =
                  hindiRange[1];

                lastSeen =
                  hindiRange[2];

                break;
              }

              const startedEnglish =
                line.match(
                  /Started running on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
                );

              if (
                startedEnglish
              ) {
                firstSeen =
                  startedEnglish[1];

                break;
              }

              const startedHindi =
                line.match(
                  /(.+)\s+को\s+चलना\s+शुरू\s+हुआ/u,
                );

              if (
                startedHindi
              ) {
                firstSeen =
                  startedHindi[1];

                break;
              }
            }

            /* -------------------------------------------
             * LANDING PAGE
             * ----------------------------------------- */

            let landingPage:
              | string
              | null = null;

            const scoredLinks =
              links
                .map((link) => {
                  try {
                    const url =
                      new URL(
                        link.href,
                        window.location.href,
                      );

                    const isInternal =
                      isFacebookInternalUrl(
                        url.toString(),
                      );

                    let score =
                      isInternal
                        ? -100
                        : 100;

                    if (
                      CTA_SET.has(
                        link.text
                          .toLowerCase(),
                      )
                    ) {
                      score += 20;
                    }

                    if (
                      /\b(?:shop|buy|learn|order|offer)\b/i.test(
                        link.text,
                      )
                    ) {
                      score += 10;
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
                  } =>
                    value !== null,
                )
                .sort(
                  (a, b) =>
                    b.score -
                    a.score,
                );

            if (
              scoredLinks.length > 0 &&
              scoredLinks[0].score >
                0
            ) {
              landingPage =
                scoredLinks[0].url;
            }

            if (!landingPage) {
              for (const line of rawLines) {
                const explicit =
                  line.match(
                    /https?:\/\/[^\s]+/i,
                  );

                if (explicit) {
                  try {
                    const url =
                      new URL(
                        explicit[0],
                      );

                    const host =
                      url.hostname
                        .toLowerCase();

                    if (
                      !host.includes(
                        "facebook.com",
                      ) &&
                      !host.includes(
                        "instagram.com",
                      )
                    ) {
                      landingPage =
                        url.toString();

                      break;
                    }
                  } catch {
                    // Ignore invalid URL.
                  }
                }

                if (
                  isDomain(line)
                ) {
                  landingPage =
                    `https://${line.toLowerCase()}/`;

                  break;
                }
              }
            }

            /* -------------------------------------------
             * MEDIA
             * ----------------------------------------- */

            const videos =
              Array.from(
                card.querySelectorAll(
                  "video",
                ),
              );

            const images =
              Array.from(
                card.querySelectorAll(
                  "img",
                ),
              );

            const hasVideo =
              videos.length > 0;

            const hasImage =
              images.length > 0;

            const hasCarousel =
              detectHasCarousel(
                card,
              );

            const video =
              videos[0] as
                | HTMLVideoElement
                | undefined;

            const image =
              images[0] as
                | HTMLImageElement
                | undefined;

            const videoUrl =
              video
                ? video.currentSrc ||
                  video.getAttribute(
                    "src",
                  )
                : null;

            const thumbnailUrl =
              video?.getAttribute(
                "poster",
              ) ??
              image?.getAttribute(
                "src",
              ) ??
              null;

            const imageUrl =
              image?.getAttribute(
                "src",
              ) ?? null;

            let videoDurationSeconds:
              | number
              | null = null;

            if (
              video &&
              Number.isFinite(
                video.duration,
              ) &&
              video.duration > 0
            ) {
              videoDurationSeconds =
                Math.round(
                  video.duration,
                );
            }

            /* -------------------------------------------
             * STATUS / PLATFORMS
             * ----------------------------------------- */

            const joinedText =
              rawLines
                .join(" ")
                .toLowerCase();

            /*
             * Meta may omit an explicit "Active" label.
             * Only explicit "inactive" should make it false.
             */
            const isActive =
              !joinedText.includes(
                "inactive",
              ) &&
              !joinedText.includes(
                "निष्क्रिय",
              );

            /*
             * FIX:
             * This helper also exists inside evaluate.
             */
            const publisherPlatforms =
              extractPlatformNames(
                joinedText,
              );

            /* -------------------------------------------
             * PUSH RESULT
             * ----------------------------------------- */

            results.push({
              id,

              advertiserName,

              creatorName,

              partnershipType,

              primaryText,

              headline:
                productName,

              productName,

              callToAction,

              firstSeen,

              lastSeen,

              landingPage,

              isActive,

              publisherPlatforms,

              hasVideo,

              hasImage,

              hasCarousel,

              videoUrl,

              imageUrl,

              thumbnailUrl,

              videoDurationSeconds,

              rawLines,
            });
          }

          return results;
        },
        CTA_VALUES,
      );

    console.log(
      "[MetaProvider] Extracted ad containers:",
      ads.length,
    );

    return ads;
  } finally {
    await safeCloseContext(
      context,
    );
  }
}

/* =========================================================
 * SCRAPER WITH RETRY
 * ======================================================= */

async function scrapeMetaAdLibrary(
  query: string,
  country: string,
  maxScrolls = DEFAULT_MAX_SCROLLS,
): Promise<ScrapedMetaAd[]> {
  const maxAttempts = 3;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    console.log(
      `[MetaProvider] Scrape attempt ${attempt}/${maxAttempts}: ${query}`,
    );

    try {
      const ads =
        await scrapeMetaAdLibraryOnce(
          query,
          country,
          maxScrolls,
        );

      if (ads.length > 0) {
        console.log(
          `[MetaProvider] Successful scrape on attempt ${attempt}: ${ads.length} ads`,
        );

        return ads;
      }

      console.warn(
        `[MetaProvider] Attempt ${attempt} returned 0 ads.`,
      );
    } catch (error) {
      console.error(
        `[MetaProvider] Attempt ${attempt} failed`,
      );

      if (error instanceof Error) {
        console.error(
          "name:",
          error.name,
        );

        console.error(
          "message:",
          error.message,
        );

        console.error(
          "code:",
          (error as NodeJS.ErrnoException)
            .code,
        );

        console.error(
          "stack:",
          error.stack,
        );

        console.error(
          "cause:",
          error.cause,
        );
      } else {
        console.error(
          "unknown error:",
          error,
        );
      }
    }

    if (
      attempt < maxAttempts
    ) {
      console.log(
        "[MetaProvider] Resetting Chromium before retry...",
      );

      await resetMetaBrowser();

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            1500 * attempt,
          ),
      );
    }
  }

  console.warn(
    `[MetaProvider] All ${maxAttempts} scrape attempts returned 0 ads.`,
  );

  return [];
}

/* =========================================================
 * TEST HELPER
 * ======================================================= */

export async function scrapeMetaAdLibraryForTest(
  query: string,
  country = DEFAULT_COUNTRY,
): Promise<CompetitorAd[]> {
  const normalizedQuery =
    query.trim();

  const normalizedCountry =
    country
      .trim()
      .toUpperCase() ||
    DEFAULT_COUNTRY;

  if (!normalizedQuery) {
    return [];
  }

  const scraped =
    await scrapeMetaAdLibrary(
      normalizedQuery,
      normalizedCountry,
    );

  return scraped.map((ad) =>
    normalizeScrapedAd(
      ad,
      normalizedQuery,
      normalizedCountry,
    ),
  );
}

/* =========================================================
 * CACHE
 * ======================================================= */

type MetaProviderCacheEntry = {
  ads: CompetitorAd[];
  createdAt: number;
};

const metaProviderCache =
  new Map<
    string,
    MetaProviderCacheEntry
  >();

function getMetaCacheKey(
  query: string,
  country: string,
  mode: string,
): string {
  return [
    "meta",
    country
      .trim()
      .toUpperCase(),
    mode,
    query
      .trim()
      .toLowerCase(),
  ].join(":");
}

function getCachedMetaAds(
  key: string,
): CompetitorAd[] | null {
  const cached =
    metaProviderCache.get(key);

  if (!cached) {
    return null;
  }

  const age =
    Date.now() -
    cached.createdAt;

  if (
    age > META_CACHE_TTL_MS
  ) {
    metaProviderCache.delete(
      key,
    );

    return null;
  }

  return cached.ads;
}

function setCachedMetaAds(
  key: string,
  ads: CompetitorAd[],
): void {
  metaProviderCache.set(key, {
    ads,
    createdAt: Date.now(),
  });
}

/* =========================================================
 * DEDUPLICATION
 * ======================================================= */

function normalizeFingerprintPart(
  value:
    | string
    | null
    | undefined,
): string {
  return (
    value ?? ""
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildCreativeFingerprint(
  ad: CompetitorAd,
): string {
  return [
    normalizeFingerprintPart(
      ad.advertiserName,
    ),

    normalizeFingerprintPart(
      ad.headline,
    ),

    normalizeFingerprintPart(
      ad.productName,
    ),

    normalizeFingerprintPart(
      ad.primaryText,
    ),

    normalizeFingerprintPart(
      ad.callToAction,
    ),

    normalizeFingerprintPart(
      ad.landingPage,
    ),

    ad.creativeType ?? "",
  ].join("|");
}

/* =========================================================
 * PROVIDER
 * ======================================================= */

export const metaProvider: AdProvider =
  {
    platform: "meta",

    async search(
      input: AdSearchInput,
    ): Promise<ProviderResult> {
      const query =
        input.query?.trim();

      if (!query) {
        return {
          ads: [],
        };
      }

      const country =
        input.country
          ?.trim()
          .toUpperCase() ||
        DEFAULT_COUNTRY;

      const mode =
        input.mode ??
        "advertiser";

      const cacheKey =
        getMetaCacheKey(
          query,
          country,
          mode,
        );

      /* -----------------------------------------------
       * CACHE HIT
       * --------------------------------------------- */

      const cached =
        getCachedMetaAds(
          cacheKey,
        );

      if (cached) {
        console.log(
          "[MetaProvider] Cache hit:",
          query,
          "total:",
          cached.length,
        );

        return {
          ads: cached,
        };
      }

      /* -----------------------------------------------
       * SCRAPE
       * --------------------------------------------- */

      console.log(
        "[MetaProvider] Cache miss:",
        query,
      );

      const scraped =
        await scrapeMetaAdLibrary(
          query,
          country,
        );

      console.log(
        "[MetaProvider] Scraped count:",
        scraped.length,
      );

      console.log(
        "[MetaProvider] Sample advertisers:",
        scraped
          .slice(0, 10)
          .map((ad) => ({
            id: ad.id,
            advertiserName:
              ad.advertiserName,
            creatorName:
              ad.creatorName,
            headline:
              ad.headline,
            productName:
              ad.productName,
          })),
      );

      /* -----------------------------------------------
       * NORMALIZE
       * --------------------------------------------- */

      let ads =
        scraped.map((ad) =>
          normalizeScrapedAd(
            ad,
            query,
            country,
          ),
        );

      console.log(
        "[MetaProvider] Normalized sample:",
        ads
          .slice(0, 10)
          .map((ad) => ({
            id: ad.id,
            advertiserName:
              ad.advertiserName,
            landingPage:
              ad.landingPage,
            headline:
              ad.headline,
            productName:
              ad.productName,
          })),
      );

      /* -----------------------------------------------
       * ADVERTISER RELEVANCE
       * --------------------------------------------- */

      if (
        mode === "advertiser"
      ) {
        const matchingAds =
          ads.filter((ad) =>
            isRelevantToAdvertiser(
              ad,
              query,
            ),
          );

        console.log(
          "[MetaProvider] Advertiser matches:",
          matchingAds
            .slice(0, 10)
            .map((ad) => ({
              id: ad.id,
              advertiserName:
                ad.advertiserName,
              landingPage:
                ad.landingPage,
            })),
        );

        ads =
          matchingAds;

        console.log(
          "[MetaProvider] Ads after relevance filter:",
          ads.length,
        );
      }

      /* -----------------------------------------------
       * DEDUPE
       * --------------------------------------------- */

      const unique =
        new Map<
          string,
          CompetitorAd
        >();

      for (const ad of ads) {
        const fingerprint =
          buildCreativeFingerprint(
            ad,
          );

        const existing =
          unique.get(
            fingerprint,
          );

        if (!existing) {
          unique.set(
            fingerprint,
            ad,
          );

          continue;
        }

        const existingScore =
          (existing.creativeScore ??
            0) +
          (existing.runningDays ??
            0) *
            0.1;

        const newScore =
          (ad.creativeScore ??
            0) +
          (ad.runningDays ??
            0) *
            0.1;

        if (
          newScore >
          existingScore
        ) {
          unique.set(
            fingerprint,
            ad,
          );
        }
      }

      ads =
        Array.from(
          unique.values(),
        );

      console.log(
        "[MetaProvider] Ads after deduplication:",
        ads.length,
      );

      /* -----------------------------------------------
       * SORT
       * --------------------------------------------- */

      ads.sort((a, b) => {
        const aScore =
          (a.creativeScore ?? 0) +
          (a.runningDays ?? 0) *
            0.5 +
          (a.isActive ? 20 : 0);

        const bScore =
          (b.creativeScore ?? 0) +
          (b.runningDays ?? 0) *
            0.5 +
          (b.isActive ? 20 : 0);

        return bScore - aScore;
      });

      /* -----------------------------------------------
       * CACHE ONLY NON-EMPTY RESULTS
       * --------------------------------------------- */

      if (ads.length > 0) {
        setCachedMetaAds(
          cacheKey,
          ads,
        );

        console.log(
          "[MetaProvider] Cached normalized ads:",
          ads.length,
        );
      } else {
        console.warn(
          "[MetaProvider] NOT caching empty result:",
          query,
        );
      }

      /* -----------------------------------------------
       * RETURN
       * --------------------------------------------- */

      console.log(
        "[MetaProvider] Returning full result set:",
        ads.length,
      );

      return {
        ads,
      };
    },
  };

export default metaProvider;