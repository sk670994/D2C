
import type {
  AdProvider,
  AdSearchInput,
  ProviderResult,
} from "../provider";

import type {
  AdCreativeType,
  CompetitorAd,
} from "../types";

import { chromium as playwrightChromium } from "playwright-core";
import chromium from "@sparticuz/chromium";

function getLocalBrowserExecutable(): string {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.EDGE_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
   const fs = require("node:fs");

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No local Chrome/Edge executable found. Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH."
  );
}
const META_LIB_EN_BASE_URL =
  "https://www.facebook.com/ads/library/";

const DEFAULT_COUNTRY = "IN";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
];

type PartnershipType =
  | "direct"
  | "creator"
  | "unknown";

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

function cleanText(value: unknown): string | null {
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

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Some Meta pages currently return mojibake such as:
 * "à¤®à¤¾..." instead of Hindi.
 *
 * The string may have been decoded as UTF-8 bytes using
 * Latin-1/Windows-1252. This function attempts a conservative
 * repair and leaves normal text untouched.
 */
function repairMojibake(value: string | null): string | null {
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
    const bytes = Uint8Array.from(
      Array.from(value, (character) =>
        character.charCodeAt(0) & 0xff
      )
    );

    const repaired = new TextDecoder("utf-8", {
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
    // Preserve original text.
  }

  return value;
}

function normalizeExtractedText(
  value: unknown
): string | null {
  return repairMojibake(
    cleanText(value)
  );
}

/* =========================================================
 * URL
 * ======================================================= */

function unwrapFacebookRedirect(
  value: string | null
): string | null {
  const text = normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (
      url.hostname === "l.facebook.com" &&
      url.pathname === "/l.php"
    ) {
      const destination =
        url.searchParams.get("u");

      if (destination) {
        try {
          return decodeURIComponent(destination);
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
  value: unknown
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

/* =========================================================
 * PRICE
 * ======================================================= */

function parsePrice(
  value: unknown
): number | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  const match = text.match(
    /(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)/i
  );

  if (!match) {
    return null;
  }

  const number = Number(
    match[1].replace(/,/g, "")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
 * DATES
 * ======================================================= */

const MONTHS: Record<string, number> = {
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

const HINDI_MONTHS: Record<string, number> = {
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

const HINDI_MONTHS_MOJIBAKE: Record<
  string,
  number
> = {
  "à¤œà¤¨à¤µà¤°à¥€": 0,
  "à¤«à¤¼à¤°à¤µà¤°à¥€": 1,
  "à¤®à¤¾à¤°à¥à¤š": 2,
  "à¤…à¤ªà¥à¤°à¥ˆà¤²": 3,
  "à¤®à¤ˆ": 4,
  "à¤œà¥‚à¤¨": 5,
  "à¤œà¥‚à¤²à¤¾à¤ˆ": 6,
  "à¤…à¤—à¤¸à¥à¤¤": 7,
  "à¤¸à¤¿à¤¤à¤‚à¤¬à¤°": 8,
  "à¤¸à¤¿à¤¤à¤®à¥à¤¬à¤°": 8,
  "à¤…à¤•à¥à¤¤à¥‚à¤¬à¤°": 9,
  "à¤¨à¤µà¤‚à¤¬à¤°": 10,
  "à¤¨à¤µà¤®à¥à¤¬à¤°": 10,
  "à¤¦à¤¿à¤¸à¤‚à¤¬à¤°": 11,
  "à¤¦à¤¿à¤¸à¤®à¥à¤¬à¤°": 11,
};

function createValidDate(
  year: number,
  month: number,
  day: number
): Date | null {
  const date = new Date(
    year,
    month,
    day
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
  value: string | null | undefined
): Date | null {
  const cleaned =
    normalizeExtractedText(value);

  if (!cleaned) {
    return null;
  }

  let match = cleaned.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i
  );

  if (match) {
    const month =
      MONTHS[match[2].toLowerCase()];

    if (month !== undefined) {
      return createValidDate(
        Number(match[3]),
        month,
        Number(match[1])
      );
    }
  }

  match = cleaned.match(
    /^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})$/
  );

  if (match) {
    const month =
      HINDI_MONTHS[match[2]] ??
      HINDI_MONTHS_MOJIBAKE[match[2]];

    if (month !== undefined) {
      return createValidDate(
        Number(match[3]),
        month,
        Number(match[1])
      );
    }
  }

  const native = new Date(cleaned);

  if (!Number.isNaN(native.getTime())) {
    return native;
  }

  return null;
}

function extractDateRange(
  lines: string[]
): {
  firstSeen: string | null;
  lastSeen: string | null;
} {
  const englishRange =
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;

  const hindiRange =
    /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/;

  const englishStarted =
    /Started running on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;

  const hindiStarted =
    /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s+को\s+चलना\s+शुरू\s+हुआ/;

  for (const rawLine of lines) {
    const line =
      normalizeExtractedText(rawLine);

    if (!line) {
      continue;
    }

    let match = line.match(
      englishRange
    );

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: match[2],
      };
    }

    match = line.match(
      hindiRange
    );

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: match[2],
      };
    }

    match = line.match(
      englishStarted
    );

    if (match) {
      return {
        firstSeen: match[1],
        lastSeen: null,
      };
    }

    match = line.match(
      hindiStarted
    );

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
  lastSeen: string | null | undefined
): number {
  const start = parseDate(firstSeen);

  if (!start) {
    return 0;
  }

  const end =
    parseDate(lastSeen) ??
    new Date();

  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );

  const endDay = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate()
  );

  const diff =
    endDay.getTime() -
    startDay.getTime();

  if (diff < 0) {
    return 0;
  }

  return (
    Math.floor(
      diff / (1000 * 60 * 60 * 24)
    ) + 1
  );
}

/* =========================================================
 * STATUS
 * ======================================================= */

function extractActiveStatus(
  lines: string[]
): boolean {
  const text = lines
    .map(
      (line) =>
        normalizeExtractedText(line) ?? ""
    )
    .join(" ")
    .toLowerCase();

  if (
    text.includes("inactive") ||
    text.includes("निष्क्रिय")
  ) {
    return false;
  }

  if (
    text.includes("active") ||
    text.includes("सक्रिय")
  ) {
    return true;
  }

  return false;
}

/* =========================================================
 * CTA
 * ======================================================= */

function extractCallToAction(
  lines: string[]
): string | null {
  for (const line of lines) {
    const cleaned =
      normalizeExtractedText(line);

    if (!cleaned) {
      continue;
    }

    const found = CTA_VALUES.find(
      (cta) =>
        cta.toLowerCase() ===
        cleaned.toLowerCase()
    );

    if (found) {
      return found;
    }
  }

  return null;
}

/* =========================================================
 * DOMAIN
 * ======================================================= */

function isDomain(
  value: string
): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(
    value.trim()
  );
}

/* =========================================================
 * ADVERTISER / CREATOR
 * ======================================================= */

function extractAdvertiserIdentity(
  lines: string[]
): {
  advertiserName: string | null;
  creatorName: string | null;
  partnershipType: PartnershipType;
} {
  const sponsoredIndex =
    lines.findIndex((line) => {
      const value =
        normalizeExtractedText(line);

      return (
        value === "Sponsored" ||
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
      lines[sponsoredIndex - 1]
    );

  if (!candidate) {
    return {
      advertiserName: null,
      creatorName: null,
      partnershipType: "unknown",
    };
  }

  const creatorMatch = candidate.match(
    /^(.+?)\s+(?:के\s+साथ|with)\s+(.+)$/i
  );

  if (creatorMatch) {
    return {
      advertiserName:
        cleanText(creatorMatch[1]),
      creatorName:
        cleanText(creatorMatch[2]),
      partnershipType: "creator",
    };
  }

  return {
    advertiserName: candidate,
    creatorName: null,
    partnershipType: "direct",
  };
}

function extractAdvertiser(
  lines: string[]
): string | null {
  const identity =
    extractAdvertiserIdentity(lines);

  return identity.advertiserName;
}

/* =========================================================
 * PRIMARY TEXT
 * ======================================================= */

function extractPrimaryText(
  lines: string[]
): string | null {
  const sponsoredIndex =
    lines.findIndex((line) => {
      const value =
        normalizeExtractedText(line);

      return (
        value === "Sponsored" ||
        value === "प्रायोजित"
      );
    });

  const start =
    sponsoredIndex >= 0
      ? sponsoredIndex + 1
      : 0;

  for (
    let i = start;
    i < lines.length;
    i++
  ) {
    const candidate =
      normalizeExtractedText(lines[i]);

    if (!candidate) {
      continue;
    }

    if (isDomain(candidate)) {
      break;
    }

    if (
      /^(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      /^Library ID:/i.test(candidate) ||
      /^लाइब्रेरी ID:/i.test(candidate)
    ) {
      continue;
    }

    if (
      candidate === "Sponsored" ||
      candidate === "प्रायोजित"
    ) {
      continue;
    }

    if (
      /^0:00\s*\/\s*(?:0:\d{2}|\d+:\d{2})$/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      CTA_VALUES.some(
        (cta) =>
          cta.toLowerCase() ===
          candidate.toLowerCase()
      )
    ) {
      continue;
    }

    if (
      candidate.length >= 8 &&
      candidate.length <= 4000
    ) {
      return candidate;
    }
  }

  return null;
}

/* =========================================================
 * PRODUCT / HEADLINE
 * ======================================================= */

function extractProductName(
  lines: string[]
): string | null {
  const domainIndex = lines.findIndex((line) => {
    const value = normalizeExtractedText(line);
    return value ? isDomain(value) : false;
  });

  const startIndex =
    domainIndex >= 0
      ? domainIndex + 1
      : 0;

  const ignoredExact = new Set([
    "Mamaearth",
    "Nykaa",
    "Beardo",
    "BEARDO for Men",
    "Nike",
    "Sponsored",
    "प्रायोजित",
    "Shop Now",
    "Learn More",
    "Buy Now",
    "Sign Up",
    "अभी खरीदें",
    "और जानें",
  ]);

  const candidates: string[] = [];

  for (
    let i = startIndex;
    i < lines.length;
    i++
  ) {
    const candidate =
      normalizeExtractedText(lines[i]);

    if (!candidate) {
      continue;
    }

    if (ignoredExact.has(candidate)) {
      continue;
    }

    if (isDomain(candidate)) {
      continue;
    }

    if (
      /^(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      /^Library ID:/i.test(candidate) ||
      /^लाइब्रेरी ID:/i.test(candidate)
    ) {
      continue;
    }

    if (
      /^(?:0:00)\s*\/\s*(?:0:\d{2}|\d+:\d{2})$/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      CTA_VALUES.some(
        (cta) =>
          cta.toLowerCase() ===
          candidate.toLowerCase()
      )
    ) {
      continue;
    }

    // Skip obvious UI/status/date metadata.
    if (
      /^(?:Active|Inactive|Image|Video|Carousel)$/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
        candidate
      )
    ) {
      continue;
    }

    if (
      /^\d{1,2}\s+[^\d\s]+\s+\d{4}$/.test(
        candidate
      )
    ) {
      continue;
    }

    if (candidate.length < 3 || candidate.length > 500) {
      continue;
    }

    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return null;
  }

  // Prefer concise product/title-like strings.
  const titleLike = candidates.find((candidate) => {
    const wordCount =
      candidate.split(/\s+/).length;

    return (
      wordCount >= 2 &&
      wordCount <= 18 &&
      candidate.length <= 180 &&
      !/[.!?]{2,}/.test(candidate)
    );
  });

  if (titleLike) {
    return titleLike;
  }

  // Fall back to the first usable candidate.
  return candidates[0] ?? null;
}
/* =========================================================
 * OFFER
 * ======================================================= */

function extractOffer(
  primaryText: string | null,
  lines: string[]
): string | null {
  const text = [
    primaryText ?? "",
    ...lines,
  ]
    .map(
      (value) =>
        normalizeExtractedText(value) ?? ""
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  const patterns = [
    /\bflat\s+\d{1,3}%\s*off\b[^.!?\n]*/i,
    /\bup\s*to\s+\d{1,3}%\s*off\b[^.!?\n]*/i,
    /\bupto\s+\d{1,3}%\s*off\b[^.!?\n]*/i,
    /\b\d{1,3}%\s*off\b[^.!?\n]*/i,
    /\b\d{1,3}%\s*discount\b[^.!?\n]*/i,
    /\buse\s+code[:\s]+[A-Z0-9_-]+\b/i,
    /\bprice\s*drop\b[^.!?\n]*/i,
    /\bsale\s+is\s+live\b[^.!?\n]*/i,
    /\bfree\s+shipping\b[^.!?\n]*/i,
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match) {
      const result =
        normalizeExtractedText(
          match[0]
        );

      if (result) {
        return result;
      }
    }
  }

  return null;
}

/* =========================================================
 * CREATIVE TYPE
 * ======================================================= */

function inferCreativeType(
  input: ScrapedMetaAd
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

  const text = input.rawLines
    .map(
      (line) =>
        normalizeExtractedText(line) ?? ""
    )
    .join(" ")
    .toLowerCase();

  if (
    /\b0:00\s*\/\s*(?:0:\d{2}|\d+:\d{2})\b/.test(
      text
    )
  ) {
    return "video";
  }

  return "unknown";
}

/* =========================================================
 * LANDING PAGE
 * ======================================================= */

function extractLandingPage(
  lines: string[]
): string | null {
  for (const line of lines) {
    const text =
      normalizeExtractedText(line);

    if (!text) {
      continue;
    }

    const explicit =
      text.match(
        /https?:\/\/[^\s]+/i
      );

    if (explicit) {
      const normalized =
        normalizeUrl(explicit[0]);

      if (normalized) {
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
 * CREATIVE SCORE
 * ======================================================= */

function calculateCreativeScore(
  ad: ScrapedMetaAd
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

  return Math.min(100, score);
}

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

function normalizeScrapedAd(
  input: ScrapedMetaAd,
  query: string,
  country: string
): CompetitorAd {
  const lines = input.rawLines ?? [];

  const identity =
    extractAdvertiserIdentity(lines);

  const advertiser =
    normalizeExtractedText(
      input.advertiserName
    ) ??
    identity.advertiserName ??
    "Unknown advertiser";

  const creatorName =
    normalizeExtractedText(
      input.creatorName
    ) ??
    identity.creatorName;

  const partnershipType =
    input.partnershipType ??
    identity.partnershipType;

  const primaryText =
    normalizeExtractedText(
      input.primaryText
    ) ??
    extractPrimaryText(lines);

  const headline =
    normalizeExtractedText(
      input.headline
    ) ??
    extractProductName(lines);

  const productName =
    normalizeExtractedText(
      input.productName
    ) ??
    headline;

  const callToAction =
    normalizeExtractedText(
      input.callToAction
    ) ??
    extractCallToAction(lines);

  const dates =
    extractDateRange(lines);

  const firstSeen =
    normalizeExtractedText(
      input.firstSeen
    ) ??
    dates.firstSeen;

  const lastSeen =
    normalizeExtractedText(
      input.lastSeen
    ) ??
    dates.lastSeen;

  const landingPage =
    normalizeUrl(
      input.landingPage
    ) ??
    extractLandingPage(lines);

  const offer =
    normalizeExtractedText(
      input.offer
    ) ??
    extractOffer(
      primaryText,
      lines
    );

  const productPrice =
    typeof input.productPrice ===
      "number"
      ? input.productPrice
      : parsePrice(
          lines.find((line) =>
            /(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
              normalizeExtractedText(line) ?? ""
            )
          ) ?? null
        );

  const isActive =
    typeof input.isActive ===
      "boolean"
      ? input.isActive
      : extractActiveStatus(lines);

  const creativeType =
    input.creativeType ??
    inferCreativeType(input);

  const runningDays =
    calculateRunningDays(
      firstSeen,
      lastSeen
    );

  const normalizedInput: ScrapedMetaAd =
    {
      ...input,
      advertiserName: advertiser,
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

    ...(partnershipType !== "unknown"
      ? { partnershipType }
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
        input.description
      ),

    callToAction,

    firstSeen,
    lastSeen,

    isActive,

    publisherPlatforms:
      input.publisherPlatforms ?? [],

    landingPage,

    sourceUrl:
      buildLibraryUrl(
        query,
        country
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
        normalizedInput
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
      creativeScore: "estimated",
      longevityScore: "derived",
      relevanceScore: "derived",
      engagementPotentialScore:
        "estimated",
      reach: "unavailable",
      clicks: "unavailable",
      ctr: "unavailable",
      impressions: "unavailable",
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

function normalizeQueryForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactMatch(value: string): string {
  return normalizeQueryForMatch(value).replace(/\s+/g, "");
}

function hostContainsQuery(
  url: string | null | undefined,
  query: string
): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    const host = parsed.hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    const compactQuery = compactMatch(query);

    return (
      compactQuery.length >= 3 &&
      host.includes(compactQuery)
    );
  } catch {
    return false;
  }
}

function textContainsQuery(
  value: string | null | undefined,
  query: string
): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue =
    normalizeQueryForMatch(value);

  const normalizedQuery =
    normalizeQueryForMatch(query);

  if (!normalizedQuery) {
    return false;
  }

  if (
    normalizedValue === normalizedQuery ||
    normalizedValue.includes(normalizedQuery)
  ) {
    return true;
  }

  return compactMatch(value).includes(
    compactMatch(query)
  );
}

function normalizeSearchText(
  value: string | null | undefined
): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isRelevantToAdvertiser(
  ad: CompetitorAd,
  query: string
): boolean {
  const normalize = (
    value: string | null | undefined
  ): string => {
    return (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const q = normalize(query);

  if (!q) {
    return false;
  }

  const advertiser = normalize(
    ad.advertiserName
  );

  const creator = normalize(
    ad.creatorName
  );

  /*
   * 1. Strong advertiser identity match.
   */
  if (
    advertiser &&
    advertiser !== "unknown advertiser" &&
    (
      advertiser === q ||
      advertiser.includes(q) ||
      q.includes(advertiser)
    )
  ) {
    return true;
  }

  /*
   * 2. Creator partnership match.
   *
   * Example:
   * Search: Mamaearth
   * Advertiser: Mamaearth
   * Creator: some_creator
   *
   * The advertiser match above handles this normally.
   *
   * We only use creator matching when the creator itself
   * is clearly the searched entity.
   */
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

  /*
   * 3. Landing-domain match.
   *
   * Only use the actual landing page.
   * NEVER use sourceUrl because sourceUrl is the
   * Meta Ad Library search URL and contains the query.
   */
  if (
    hostContainsQuery(
      ad.landingPage,
      query
    )
  ) {
    return true;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT match productName, headline, or primaryText
   * here.
   *
   * Those fields can mention another brand.
   *
   * Example:
   * Advertiser: Foot Locker India
   * Headline: Nike Air Jordan
   *
   * That is a Foot Locker ad, NOT a Nike advertiser ad.
   */

  return false;
}
/* =========================================================
 * LIBRARY URL
 * ======================================================= */

export function buildLibraryUrl(
  query: string,
  country: string
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

let metaBrowser:
  | Awaited<ReturnType<typeof playwrightChromium.launch>>
  | null = null;

let metaBrowserPromise:
  | Promise<
      Awaited<
        ReturnType<
          typeof playwrightChromium.launch
        >
      >
    >
  | null = null;

async function getMetaBrowser() {
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
    metaBrowserPromise =
      (async () => {
        const isLocal =
          process.platform === "win32" ||
          process.env.IS_LOCAL ===
            "true";

        const executablePath =
          isLocal
            ? getLocalBrowserExecutable()
            : await chromium.executablePath();

        console.log(
          "[MetaProvider] Launching reusable Chromium"
        );

        const browser =
          await playwrightChromium.launch({
            args: isLocal
              ? []
              : chromium.args,
            executablePath,
            headless: true,
          });

        browser.on(
          "disconnected",
          () => {
            console.log(
              "[MetaProvider] Chromium disconnected"
            );

            if (
              metaBrowser ===
              browser
            ) {
              metaBrowser = null;
            }
          }
        );

        metaBrowser = browser;

        return browser;
      })().finally(() => {
        metaBrowserPromise = null;
      });
  }

  return metaBrowserPromise;
}
/* =========================================================
 * SCRAPER
 * ======================================================= */
async function scrapeMetaAdLibrary(
  query: string,
  country: string,
  maxScrolls = 14
): Promise<ScrapedMetaAd[]> {
  const browser =
    await getMetaBrowser();

  const context =
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

  try {
    const url =
      buildLibraryUrl(
        query,
        country
      );

    console.log(
      "[MetaProvider] Opening:",
      url
    );

    const response =
      await page.goto(url, {
        waitUntil:
          "domcontentloaded",
        timeout: 60_000,
      });

    console.log(
      "[MetaProvider] HTTP status:",
      response?.status()
    );

    console.log(
      "[MetaProvider] Page title:",
      await page.title()
    );

    console.log(
      "[MetaProvider] Final URL:",
      page.url()
    );

    /*
     * Initial settle.
     */
    await page.waitForTimeout(
      2500
    );

    /*
     * Controlled scrolling.
     */
    const TARGET_LIBRARY_IDS = 80;

    let previousCount = 0;
    let stableRounds = 0;

    for (
      let i = 0;
      i < maxScrolls;
      i++
    ) {
      await page.mouse.wheel(
        0,
        2200
      );

      await page.waitForTimeout(
        650
      );

      const count =
        await page.evaluate(() => {
          const text =
            document.body?.innerText ??
            "";

          const matches =
            text.match(
              /(?:Library ID|लाइब्रेरी ID):\s*\d+/gi
            );

          return new Set(
            matches ?? []
          ).size;
        });

      console.log(
        `[MetaProvider] Scroll ${
          i + 1
        }: ${count} library IDs`
      );

      if (
        count === previousCount
      ) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previousCount = count;

      if (
        count >=
        TARGET_LIBRARY_IDS
      ) {
        console.log(
          "[MetaProvider] Target library ID count reached:",
          count
        );

        break;
      }

      if (
        stableRounds >= 4
      ) {
        console.log(
          "[MetaProvider] Library ID count stabilized:",
          count
        );

        break;
      }
    }

    await page.waitForTimeout(
      700
    );

    /*
     * IMPORTANT:
     *
     * Keep the exact page.evaluate(...) extraction code
     * from your current optimized version here.
     *
     * It should end with:
     *
     * const ads = await page.evaluate(
     *   (ctaValues: string[]) => {
     *     ...
     *   },
     *   CTA_VALUES
     * );
     */

    const ads =
      await page.evaluate(
        (ctaValues: string[]) => {
          const isLibraryIdText =
            (text: string): boolean =>
              /(?:Library ID|लाइब्रेरी ID):\s*\d+/i.test(
                text
              );

          const getLibraryId =
            (
              text: string
            ): string | null => {
              const match =
                text.match(
                  /(?:Library ID|लाइब्रेरी ID):\s*(\d+)/i
                );

              return (
                match?.[1] ?? null
              );
            };

          const normalizePageText =
            (
              value: string
            ): string =>
              value
                .replace(
                  /\u200B/g,
                  ""
                )
                .replace(
                  /\u200C/g,
                  ""
                )
                .replace(
                  /\u200D/g,
                  ""
                )
                .replace(
                  /\uFEFF/g,
                  ""
                )
                .replace(
                  /\u00A0/g,
                  " "
                )
                .replace(
                  /\r/g,
                  " "
                )
                .replace(
                  /\n/g,
                  " "
                )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

          const isDomain =
            (
              value: string
            ): boolean =>
              /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(
                value.trim()
              );

          const isCTA =
            (
              value: string
            ): boolean => {
              const candidate =
                value
                  .trim()
                  .toLowerCase();

              return ctaValues.some(
                (cta: string) =>
                  cta
                    .toLowerCase() ===
                  candidate
              );
            };

          const isDateOnly =
            (
              value: string
            ): boolean => {
              const text =
                value.trim();

              return (
                /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
                  text
                ) ||
                /^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*[-–]\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
                  text
                ) ||
                /^\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
                  text
                ) ||
                /^\d{1,2}\s+[^\d\s]+\s+\d{4}\s*[-–]\s*\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
                  text
                )
              );
            };

          /*
           * Fast card discovery using text nodes.
           */
          const candidateCards =
            new Map<
              string,
              Element
            >();

          const walker =
            document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT
            );

          let currentNode:
            | Node
            | null =
            walker.nextNode();

          while (
            currentNode
          ) {
            const rawText =
              currentNode.textContent ??
              "";

            if (
              rawText &&
              isLibraryIdText(
                rawText
              )
            ) {
              let current =
                currentNode.parentElement;

              let best:
                | Element
                | null = null;

              for (
                let depth = 0;
                depth < 10 &&
                current;
                depth++
              ) {
                const text =
                  current.textContent?.trim() ??
                  "";

                if (
                  text.length >= 100 &&
                  text.length <=
                    20_000 &&
                  isLibraryIdText(
                    text
                  )
                ) {
                  best =
                    current;
                }

                current =
                  current.parentElement;
              }

              if (
                best
              ) {
                const libraryId =
                  getLibraryId(
                    best.textContent ??
                      ""
                  );

                if (
                  libraryId &&
                  !candidateCards.has(
                    libraryId
                  )
                ) {
                  candidateCards.set(
                    libraryId,
                    best
                  );
                }
              }
            }

            currentNode =
              walker.nextNode();
          }

          /*
           * Fallback for Meta DOM changes.
           */
          if (
            candidateCards.size ===
            0
          ) {
            const possibleContainers =
              Array.from(
                document.querySelectorAll(
                  '[data-testid], [role="article"], article'
                )
              );

            for (
              const element of
                possibleContainers
            ) {
              const text =
                element.textContent?.trim() ??
                "";

              if (
                text.length >= 100 &&
                text.length <=
                  20_000 &&
                isLibraryIdText(
                  text
                )
              ) {
                const libraryId =
                  getLibraryId(
                    text
                  );

                if (
                  libraryId &&
                  !candidateCards.has(
                    libraryId
                  )
                ) {
                  candidateCards.set(
                    libraryId,
                    element
                  );
                }
              }
            }
          }

          const cards =
            Array.from(
              candidateCards.values()
            );

          const seen =
            new Set<string>();

          const results: Array<{
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

          for (
            const card of cards
          ) {
            const rawText =
              card.textContent?.trim() ??
              "";

            const id =
              getLibraryId(
                rawText
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

            const rawLines =
              (
                card as HTMLElement
              ).innerText
                .split(/\r?\n/)
                .map(
                  normalizePageText
                )
                .filter(Boolean);

            const sponsoredIndex =
              rawLines.findIndex(
                (line) => {
                  const value =
                    line.toLowerCase();

                  return (
                    value ===
                      "sponsored" ||
                    value ===
                      "प्रायोजित"
                  );
                }
              );

            const advertiserLine =
              sponsoredIndex > 0
                ? rawLines[
                    sponsoredIndex -
                      1
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
                  /^(.+?)\s+(?:के\s+साथ|with)\s+(.+)$/iu
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

            const startIndex =
              sponsoredIndex >=
              0
                ? sponsoredIndex + 1
                : 0;

            let primaryText:
              | string
              | null = null;

            for (
              let i =
                startIndex;
              i <
              rawLines.length;
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
                  line
                )
              ) {
                continue;
              }

              if (
                /^(?:Library ID|लाइब्रेरी ID):/iu.test(
                  line
                )
              ) {
                continue;
              }

              if (
                /^0:00\s*\/\s*(?:0:\d{2}|\d+:\d{2})$/i.test(
                  line
                )
              ) {
                continue;
              }

              if (
                isCTA(line)
              ) {
                continue;
              }

              if (
                line.length >= 8 &&
                line.length <=
                  4000
              ) {
                primaryText =
                  primaryText
                    ? `${primaryText} ${line}`
                    : line;
              }
            }

            const domainIndex =
              rawLines.findIndex(
                isDomain
              );

            let productName:
              | string
              | null = null;

            if (
              domainIndex >= 0
            ) {
              for (
                let i =
                  domainIndex + 1;
                i <
                rawLines.length;
                i++
              ) {
                const line =
                  rawLines[i];

                if (
                  /^(?:₹|INR|Rs\.?)\s*[\d,]+/i.test(
                    line
                  )
                ) {
                  continue;
                }

                if (
                  /^(?:Library ID|लाइब्रेरी ID):/iu.test(
                    line
                  )
                ) {
                  continue;
                }

                if (
                  isCTA(line)
                ) {
                  continue;
                }

                if (
                  /^0:00\s*\/\s*(?:0:\d{2}|\d+:\d{2})$/i.test(
                    line
                  )
                ) {
                  continue;
                }

                if (
                  isDateOnly(line)
                ) {
                  continue;
                }

                if (
                  line.length >= 3 &&
                  line.length <=
                    500
                ) {
                  productName =
                    line;

                  break;
                }
              }
            }

            let callToAction:
              | string
              | null = null;

            for (
              const line of rawLines
            ) {
              if (
                isCTA(line)
              ) {
                callToAction =
                  ctaValues.find(
                    (cta: string) =>
                      cta
                        .toLowerCase() ===
                      line.toLowerCase()
                  ) ??
                  line;

                break;
              }
            }

            let firstSeen:
              | string
              | null = null;

            let lastSeen:
              | string
              | null = null;

            for (
              const line of rawLines
            ) {
              const englishRange =
                line.match(
                  /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i
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
                  /(\d{1,2}\s+[^\d\s]+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[^\d\s]+\s+\d{4})/u
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
                  /Started running on\s+(.+)/i
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
                  /(.+)\s+को\s+चलना\s+शुरू\s+हुआ/u
                );

              if (
                startedHindi
              ) {
                firstSeen =
                  startedHindi[1];

                break;
              }
            }

            let landingPage:
              | string
              | null = null;

            for (
              const link of Array.from(
                card.querySelectorAll(
                  "a[href]"
                )
              )
            ) {
              const href =
                link.getAttribute(
                  "href"
                );

              if (!href) {
                continue;
              }

              if (
                href.startsWith(
                  "javascript:"
                )
              ) {
                continue;
              }

              if (
                href.includes(
                  "/ads/library"
                )
              ) {
                continue;
              }

              try {
                const url =
                  new URL(
                    href,
                    window.location.href
                  );

                if (
                  url.hostname.includes(
                    "facebook.com"
                  ) &&
                  url.pathname ===
                    "/"
                ) {
                  continue;
                }

                landingPage =
                  url.toString();

                break;
              } catch {
                // Ignore invalid links.
              }
            }

            if (
              !landingPage
            ) {
              for (
                const line of rawLines
              ) {
                const explicit =
                  line.match(
                    /https?:\/\/[^\s]+/i
                  );

                if (
                  explicit
                ) {
                  landingPage =
                    explicit[0];

                  break;
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

            const videos =
              Array.from(
                card.querySelectorAll(
                  "video"
                )
              );

            const images =
              Array.from(
                card.querySelectorAll(
                  "img"
                )
              );

            const hasVideo =
              videos.length > 0;

            const hasImage =
              images.length > 0;

            const hasCarousel =
              Boolean(
                card.querySelector(
                  [
                    '[aria-label*="carousel" i]',
                    '[data-testid*="carousel" i]',
                  ].join(",")
                )
              );

            const video =
              videos[0];

            const image =
              images[0];

            const videoUrl =
              video
                ? video.currentSrc ||
                  video.getAttribute(
                    "src"
                  )
                : null;

            const thumbnailUrl =
              video?.getAttribute(
                "poster"
              ) ??
              image?.getAttribute(
                "src"
              ) ??
              null;

            const imageUrl =
              image?.getAttribute(
                "src"
              ) ?? null;

            let videoDurationSeconds:
              | number
              | null = null;

            if (
              video &&
              Number.isFinite(
                video.duration
              ) &&
              video.duration > 0
            ) {
              videoDurationSeconds =
                Math.round(
                  video.duration
                );
            }

            const joinedText =
              rawLines
                .join(" ")
                .toLowerCase();

            const isActive =
              !joinedText.includes(
                "inactive"
              ) &&
              !joinedText.includes(
                "निष्क्रिय"
              ) &&
              (
                joinedText.includes(
                  "active"
                ) ||
                joinedText.includes(
                  "सक्रिय"
                )
              );

            const publisherPlatforms:
              string[] = [];

            const platformNames = [
              "Facebook",
              "Instagram",
              "Messenger",
              "Audience Network",
              "Threads",
            ];

            for (
              const platform of
                platformNames
            ) {
              if (
                joinedText.includes(
                  platform.toLowerCase()
                )
              ) {
                publisherPlatforms.push(
                  platform
                );
              }
            }

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
        CTA_VALUES
      );

    console.log(
      "[MetaProvider] Extracted ad containers:",
      ads.length
    );

    return ads;
  } finally {
    /*
     * IMPORTANT:
     *
     * Do NOT close the browser here.
     *
     * The browser is intentionally kept alive so that
     * subsequent searches on the same warm Node process
     * can reuse Chromium.
     *
     * Only the page/context are closed.
     */

    await context.close();
  }
}
/**
 * Exported test helper.
 */
export async function scrapeMetaAdLibraryForTest(
  query: string,
  country = DEFAULT_COUNTRY
): Promise<CompetitorAd[]> {
  const scraped =
    await scrapeMetaAdLibrary(
      query.trim(),
      country.trim().toUpperCase()
    );

  return scraped.map(
    (ad) =>
      normalizeScrapedAd(
        ad,
        query.trim(),
        country.trim().toUpperCase()
      )
  );
}

/* =========================================================
 * PROVIDER CACHE
 * ======================================================= */

type MetaProviderCacheEntry = {
  ads: CompetitorAd[];
  createdAt: number;
};

const META_CACHE_TTL_MS = 5 * 60 * 1000;

const metaProviderCache =
  new Map<string, MetaProviderCacheEntry>();

function getMetaCacheKey(
  query: string,
  country: string,
  mode: string
): string {
  return [
    "meta",
    country.trim().toUpperCase(),
    mode,
    query.trim().toLowerCase(),
  ].join(":");
}

function getCachedMetaAds(
  key: string
): CompetitorAd[] | null {
  const cached = metaProviderCache.get(key);

  if (!cached) {
    return null;
  }

  const age = Date.now() - cached.createdAt;

  if (age > META_CACHE_TTL_MS) {
    metaProviderCache.delete(key);
    return null;
  }

  return cached.ads;
}

function setCachedMetaAds(
  key: string,
  ads: CompetitorAd[]
): void {
  metaProviderCache.set(key, {
    ads,
    createdAt: Date.now(),
  });
}
/* =========================================================
 * PROVIDER CACHE
 * ======================================================= */

export const metaProvider: AdProvider = {
  platform: "meta",

  async search(
    input: AdSearchInput
  ): Promise<ProviderResult> {
    const query =
      input.query?.trim();

    if (!query) {
      return {
        ads: [],
      };
    }

    const country =
      input.country?.trim().toUpperCase() ||
      DEFAULT_COUNTRY;

    const mode =
      input.mode ?? "advertiser";

    const cacheKey =
      getMetaCacheKey(
        query,
        country,
        mode
      );

    let ads =
      getCachedMetaAds(cacheKey);

    /* -----------------------------------------------------
     * CACHE HIT
     * --------------------------------------------------- */

    if (ads) {
      console.log(
        "[MetaProvider] Cache hit:",
        query,
        "total:",
        ads.length
      );

      /*
       * Return the COMPLETE cached result set.
       *
       * Do not paginate here.
       * route.ts is responsible for pagination.
       */
      return {
        ads,
      };
    }

    /* -----------------------------------------------------
     * CACHE MISS
     * --------------------------------------------------- */

    console.log(
      "[MetaProvider] Cache miss:",
      query
    );

    const scraped =
      await scrapeMetaAdLibrary(
        query,
        country
      );

    /* -----------------------------------------------------
     * DIAGNOSTIC: SCRAPED RESULT
     * --------------------------------------------------- */

    console.log(
      "[MetaProvider] Scraped count:",
      scraped.length
    );

    console.log(
      "[MetaProvider] Sample advertisers:",
      scraped.slice(0, 10).map((ad) => ({
        id: ad.id,
        advertiserName:
          ad.advertiserName,
        creatorName:
          ad.creatorName,
        headline:
          ad.headline,
        productName:
          ad.productName,
      }))
    );

    /* -----------------------------------------------------
     * NORMALIZATION
     * --------------------------------------------------- */

    ads = scraped.map((ad) =>
      normalizeScrapedAd(
        ad,
        query,
        country
      )
    );

    /* -----------------------------------------------------
     * DIAGNOSTIC: NORMALIZED RESULT
     * --------------------------------------------------- */

    console.log(
      "[MetaProvider] Normalized sample:",
      ads.slice(0, 10).map((ad) => ({
        id: ad.id,
        advertiserName:
          ad.advertiserName,
        landingPage:
          ad.landingPage,
        headline:
          ad.headline,
        productName:
          ad.productName,
      }))
    );

    /* -----------------------------------------------------
     * ADVERTISER RELEVANCE
     * --------------------------------------------------- */

    if (mode === "advertiser") {
      console.log(
        "[MetaProvider] Advertiser matches:",
        ads
          .filter((ad) =>
            isRelevantToAdvertiser(
              ad,
              query
            )
          )
          .slice(0, 10)
          .map((ad) => ({
            id: ad.id,
            advertiserName:
              ad.advertiserName,
            landingPage:
              ad.landingPage,
          }))
      );

      ads = ads.filter((ad) =>
        isRelevantToAdvertiser(
          ad,
          query
        )
      );

      console.log(
        "[MetaProvider] Ads after relevance filter:",
        ads.length
      );
    }

    /* -----------------------------------------------------
     * DEDUPLICATION
     * --------------------------------------------------- */

    function buildCreativeFingerprint(
      ad: CompetitorAd
    ): string {
      const normalize = (
        value:
          | string
          | null
          | undefined
      ) =>
        (value ?? "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      return [
        normalize(
          ad.advertiserName
        ),
        normalize(
          ad.headline
        ),
        normalize(
          ad.productName
        ),
        normalize(
          ad.primaryText
        ),
        normalize(
          ad.callToAction
        ),
        normalize(
          ad.landingPage
        ),
        ad.creativeType ?? "",
      ].join("|");
    }

    const unique =
      new Map<
        string,
        CompetitorAd
      >();

    for (const ad of ads) {
      const fingerprint =
        buildCreativeFingerprint(
          ad
        );

      if (
        !unique.has(
          fingerprint
        )
      ) {
        unique.set(
          fingerprint,
          ad
        );
      }
    }

    ads = Array.from(
      unique.values()
    );

    console.log(
      "[MetaProvider] Ads after deduplication:",
      ads.length
    );

    /* -----------------------------------------------------
     * SORT COMPLETE RESULT SET
     * --------------------------------------------------- */

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

    /* -----------------------------------------------------
     * CACHE COMPLETE RESULT SET
     * --------------------------------------------------- */

    setCachedMetaAds(
      cacheKey,
      ads
    );

    console.log(
      "[MetaProvider] Cached normalized ads:",
      ads.length
    );

    /* -----------------------------------------------------
     * IMPORTANT
     *
     * DO NOT paginate here.
     *
     * Provider:
     *   scrape -> normalize -> filter -> dedupe -> sort
     *
     * Route:
     *   enrich -> summary -> paginate -> response
     * --------------------------------------------------- */

    console.log(
      "[MetaProvider] Returning full result set:",
      ads.length
    );

    return {
      ads,
    };
  },
};
export default metaProvider;
