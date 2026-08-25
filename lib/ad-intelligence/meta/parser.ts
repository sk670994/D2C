import {
  normalizeExtractedText,
  normalizeWhitespace,
} from "./text";

import {
  isDomain,
} from "./url";

/* =========================================================
 * TYPES
 * ======================================================= */

export type PartnershipType =
  | "direct"
  | "creator"
  | "paid_partnership"
  | "collaboration"
  | "unknown";

export type ParsedIdentity = {
  advertiserName: string | null;
  creatorName: string | null;
  partnershipType: PartnershipType;
};

export type ParsedDateRange = {
  firstSeen: string | null;
  lastSeen: string | null;
};

/* =========================================================
 * CTA VALUES
 *
 * Used only by Node-side parser helpers.
 * The browser-side page.evaluate() has its own CTA list.
 * ======================================================= */

const DEFAULT_CTA_VALUES = [
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
 * PRICE
 * ======================================================= */

export function parsePrice(
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

export function parseDate(
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

export function extractDateRange(
  lines: string[],
): ParsedDateRange {
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
      normalizeExtractedText(rawLine);

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

export function calculateRunningDays(
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

  const startDay =
    new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );

  const endDay =
    new Date(
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
 * LINE CLASSIFICATION
 * ======================================================= */

export function isCTA(
  value: string,
  ctaValues: readonly string[] =
    DEFAULT_CTA_VALUES,
): boolean {
  const normalized =
    value.trim().toLowerCase();

  return ctaValues.some(
    (cta) =>
      cta.toLowerCase() ===
      normalized,
  );
}

export function extractCallToAction(
  lines: string[],
  ctaValues: readonly string[] =
    DEFAULT_CTA_VALUES,
): string | null {
  for (const line of lines) {
    const cleaned =
      normalizeExtractedText(line);

    if (!cleaned) {
      continue;
    }

    if (
      isCTA(
        cleaned,
        ctaValues,
      )
    ) {
      return (
        ctaValues.find(
          (cta) =>
            cta.toLowerCase() ===
            cleaned.toLowerCase(),
        ) ?? cleaned
      );
    }
  }

  return null;
}

export function isLibraryIdLine(
  value: string,
): boolean {
  return /^(?:Library ID|लाइब्रेरी ID):\s*\d+$/i.test(
    value.trim(),
  );
}

export function isVideoTimeLine(
  value: string,
): boolean {
  return /^\d+:\d{2}\s*\/\s*\d+:\d{2}$/i.test(
    value.trim(),
  );
}

export function isStatusLine(
  value: string,
): boolean {
  return /^(?:Active|Inactive|Image|Video|Carousel|सक्रिय|निष्क्रिय)$/iu.test(
    value.trim(),
  );
}

export function isDateOnly(
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

export function isPriceLine(
  value: string,
): boolean {
  return /^(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?$/i.test(
    value.trim(),
  );
}

export function isSentenceLike(
  value: string,
): boolean {
  const text =
    value.trim();

  return (
    text.length > 120 ||
    /[.!?]\s+/.test(text)
  );
}

export function isOfferLike(
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
    /\bprice\s*drop\b/i.test(
      value,
    ) ||
    /\bfree\s+shipping\b/i.test(
      value,
    )
  );
}

/* =========================================================
 * CREATOR / PERSON SIGNALS
 * ======================================================= */

export function looksLikePersonName(
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
 * ACTIVE STATUS
 * ======================================================= */

export function extractActiveStatus(
  lines: string[],
): boolean {
  const text =
    lines
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
   * Meta frequently does not expose an explicit
   * "Active" label inside the rendered card.
   *
   * Therefore:
   * - explicit inactive => false
   * - otherwise => true
   */
  return true;
}

/* =========================================================
 * ADVERTISER / CREATOR
 * ======================================================= */

export function extractAdvertiserIdentity(
  lines: string[],
): ParsedIdentity {
  const normalizedLines =
    lines
      .map(
        (line) =>
          normalizeExtractedText(
            line,
          ) ?? "",
      )
      .filter(Boolean);

  if (
    normalizedLines.length === 0
  ) {
    return {
      advertiserName: null,
      creatorName: null,
      partnershipType:
        "unknown",
    };
  }

  const sponsoredIndex =
    normalizedLines.findIndex(
      (line) => {
        const value =
          line.toLowerCase();

        return (
          value ===
            "sponsored" ||
          value ===
            "प्रायोजित"
        );
      },
    );

  /*
   * Meta generally places the advertiser / collaboration
   * identity immediately before Sponsored.
   */
  const identityIndex =
    sponsoredIndex > 0
      ? sponsoredIndex - 1
      : 0;

  const candidate =
    normalizeWhitespace(
      normalizedLines[
        identityIndex
      ],
    );

  if (!candidate) {
    return {
      advertiserName: null,
      creatorName: null,
      partnershipType:
        "unknown",
    };
  }

  /* -------------------------------------------------------
   * Explicit paid partnership
   * ----------------------------------------------------- */

  const paidPartnershipMatch =
    candidate.match(
      /^(.+?)\s+(?:paid\s+partnership|partnership\s+with)\s+(.+)$/i,
    );

  if (
    paidPartnershipMatch
  ) {
    return {
      advertiserName:
        normalizeWhitespace(
          paidPartnershipMatch[1],
        ),
      creatorName:
        normalizeWhitespace(
          paidPartnershipMatch[2],
        ),
      partnershipType:
        "paid_partnership",
    };
  }

  /* -------------------------------------------------------
   * Explicit "Brand x Creator"
   * ----------------------------------------------------- */

  const xMatch =
    candidate.match(
      /^(.+?)\s*(?:x|×)\s*(@?[A-Za-z0-9][A-Za-z0-9._-]{1,60})$/iu,
    );

  if (xMatch) {
    return {
      advertiserName:
        normalizeWhitespace(
          xMatch[1],
        ),
      creatorName:
        normalizeWhitespace(
          xMatch[2],
        ),
      partnershipType:
        "collaboration",
    };
  }

  /* -------------------------------------------------------
   * "Brand collaboration Creator"
   * ----------------------------------------------------- */

  const collaborationMatch =
    candidate.match(
      /^(.+?)\s+(?:collaboration|collab)\s*[:\-]?\s*(.*)$/iu,
    );

  if (
    collaborationMatch
  ) {
    const advertiser =
      normalizeWhitespace(
        collaborationMatch[1],
      );

    const creator =
      normalizeWhitespace(
        collaborationMatch[2],
      );

    /*
     * When Meta concatenates the final words, e.g.
     * "BEARDO for Mencollaboration",
     * try to recover the creator tail.
     */
    if (
      creator &&
      creator.length >= 2
    ) {
      return {
        advertiserName:
          advertiser,

        creatorName:
          creator,

        partnershipType:
          "collaboration",
      };
    }

    /*
     * No creator text after "collaboration".
     * Preserve the brand and classify collaboration without
     * inventing a creator.
     */
    return {
      advertiserName:
        advertiser,

      creatorName:
        null,

      partnershipType:
        "collaboration",
    };
  }

  /* -------------------------------------------------------
   * Concatenated "... for Mencollaboration"
   * ----------------------------------------------------- */

  const concatenatedCollabMatch =
    candidate.match(
      /^(.+?)\s+for\s+(.+?)collaboration$/iu,
    );

  if (
    concatenatedCollabMatch
  ) {
    return {
      advertiserName:
        normalizeWhitespace(
          concatenatedCollabMatch[1],
        ),

      creatorName:
        normalizeWhitespace(
          concatenatedCollabMatch[2],
        ),

      partnershipType:
        "collaboration",
    };
  }

  /* -------------------------------------------------------
   * "Brand with Creator"
   * ----------------------------------------------------- */

  const withCreatorMatch =
    candidate.match(
      /^(.+?)\s+(?:with|के\s+साथ)\s+(@?[A-Za-z0-9][A-Za-z0-9._-]{1,60})$/iu,
    );

  if (
    withCreatorMatch
  ) {
    return {
      advertiserName:
        normalizeWhitespace(
          withCreatorMatch[1],
        ),

      creatorName:
        normalizeWhitespace(
          withCreatorMatch[2],
        ),

      partnershipType:
        "creator",
    };
  }

  /* -------------------------------------------------------
   * Handle advertiser followed by a creator-style handle
   * ----------------------------------------------------- */

  const trailingHandle =
    candidate.match(
      /^(.+?)\s+(@[A-Za-z0-9._-]{2,60})$/u,
    );

  if (
    trailingHandle
  ) {
    return {
      advertiserName:
        normalizeWhitespace(
          trailingHandle[1],
        ),

      creatorName:
        normalizeWhitespace(
          trailingHandle[2],
        ),

      partnershipType:
        "creator",
    };
  }

  /* -------------------------------------------------------
   * Direct advertiser
   * ----------------------------------------------------- */

  return {
    advertiserName:
      candidate,

    creatorName:
      null,

    partnershipType:
      "direct",
  };
}

/* =========================================================
 * PRIMARY TEXT
 * ======================================================= */

export function extractPrimaryText(
  lines: string[],
  ctaValues: readonly string[] =
    DEFAULT_CTA_VALUES,
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

    /*
     * Domain usually marks the beginning of the
     * destination/product portion of a card.
     */
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

    if (
      isCTA(
        candidate,
        ctaValues,
      )
    ) {
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
 * ======================================================= */

function scoreProductCandidate(
  value: string,
  lines: string[],
  links: Array<{
    href: string;
    text: string;
  }>,
  domainIndex: number,
  index: number,
  ctaValues: readonly string[],
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
  } else if (
    text.length > 180 &&
    text.length <= 500
  ) {
    score += 5;
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
        normalizeWhitespace(
          link.text,
        ).toLowerCase() ===
        text.toLowerCase(),
    );

  if (isLinkText) {
    score += 20;
  }

  if (
    isCTA(
      text,
      ctaValues,
    )
  ) {
    score -= 100;
  }

  if (
    isDateOnly(text)
  ) {
    score -= 100;
  }

  if (
    isStatusLine(text)
  ) {
    score -= 100;
  }

  if (
    isDomain(text)
  ) {
    score -= 100;
  }

  if (
    isLibraryIdLine(text)
  ) {
    score -= 100;
  }

  if (
    isVideoTimeLine(text)
  ) {
    score -= 100;
  }

  if (
    isPriceLine(text)
  ) {
    score -= 100;
  }

  if (
    looksLikePersonName(text)
  ) {
    score -= 60;
  }

  if (
    isSentenceLike(text)
  ) {
    score -= 15;
  }

  if (
    isOfferLike(text)
  ) {
    score -= 30;
  }

  /*
   * Product-size / pack signals.
   */
  if (
    /\b(?:ml|mg|gm|g|kg|oz|pack|pcs|piece|combo|kit)\b/i.test(
      text,
    )
  ) {
    score += 15;
  }

  /*
   * Generic commerce/product-category signals.
   *
   * No brand-specific hardcoding.
   */
  if (
    /\b(?:shampoo|conditioner|serum|cream|face\s*wash|facewash|lipstick|oil|cleanser|moisturizer|sunscreen|mask|scrub|toner|gel|lotion|body\s*wash|soap|perfume|fragrance|foundation|concealer|powder|shoes|shirt|shorts|jacket|leggings|tshirt|t-shirt|apparel)\b/i.test(
      text,
    )
  ) {
    score += 20;
  }

  /*
   * Prefer titles that are not identical to earlier
   * copy lines. This slightly reduces accidental
   * selection of duplicated body copy.
   */
  const firstOccurrence =
    lines.findIndex(
      (line) =>
        normalizeWhitespace(
          line,
        ).toLowerCase() ===
        text.toLowerCase(),
    );

  if (
    firstOccurrence >= 0 &&
    firstOccurrence !== index
  ) {
    score -= 5;
  }

  return score;
}

export function extractProductName(
  lines: string[],
  links: Array<{
    href: string;
    text: string;
  }> = [],
  ctaValues: readonly string[] =
    DEFAULT_CTA_VALUES,
): string | null {
  const normalizedLines =
    lines
      .map((line) =>
        normalizeExtractedText(line),
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
        normalizedLines,
        links,
        domainIndex,
        index,
        ctaValues,
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

export function extractOffer(
  primaryText: string | null,
  lines: string[],
): string | null {
  const normalizedLines =
    [
      ...(primaryText
        ? [primaryText]
        : []),
      ...lines,
    ]
      .map(
        (value) =>
          normalizeExtractedText(
            value,
          ) ?? "",
      )
      .filter(Boolean);

  const text =
    normalizedLines
      .join(" ")
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (!text) {
    return null;
  }

  /* -------------------------------------------------------
   * Percentage discounts
   * ----------------------------------------------------- */

  const percentagePatterns =
    [
      /\bflat\s+(\d{1,3})%\s*off\b/i,

      /\bup\s*to\s+(\d{1,3})%\s*off\b/i,

      /\bupto\s+(\d{1,3})%\s*off\b/i,

      /\b(\d{1,3})%\s*off\b/i,

      /\b(\d{1,3})%\s*discount\b/i,
    ];

  for (
    const pattern of
      percentagePatterns
  ) {
    const match =
      text.match(
        pattern,
      );

    if (!match) {
      continue;
    }

    const percentage =
      Number(
        match[1],
      );

    if (
      Number.isFinite(
        percentage,
      ) &&
      percentage > 0 &&
      percentage <= 100
    ) {
      return normalizeWhitespace(
        match[0],
      );
    }
  }

  /* -------------------------------------------------------
   * Rupee / INR offers
   *
   * Examples:
   * "₹999 only"
   * "at ₹799"
   * "₹799"
   * "4 Perfumes @ ₹999"
   * ----------------------------------------------------- */

  const rupeeOfferPatterns =
    [
      /\b\d+\s*(?:x|×|pack|packs|pcs|pieces|products|perfumes|items)\b.{0,80}?(?:@|at|for)\s*(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?(?:\s*(?:only|each))?/iu,

      /(?:@|at|for)\s*(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?\s*(?:only|each)?/iu,

      /(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?\s*(?:only|each)/iu,

      /(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/iu,
    ];

  for (
    const pattern of
      rupeeOfferPatterns
  ) {
    const match =
      text.match(
        pattern,
      );

    if (!match) {
      continue;
    }

    const normalized =
      normalizeWhitespace(
        match[0],
      );

    if (
      normalized
    ) {
      return normalized;
    }
  }

  /* -------------------------------------------------------
   * Bundle / quantity offers
   * ----------------------------------------------------- */

  const bundlePatterns =
    [
      /\b\d+\s+(?:products?|items?|perfumes?|pieces?|pcs?|packs?|units?)\b.{0,80}?(?:only|for|at)\s+(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/iu,

      /\b(?:buy|get)\s+\d+\s*(?:for|@)\s*(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/iu,

      /\b(?:combo|bundle|kit)\b.{0,100}?(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/iu,
    ];

  for (
    const pattern of
      bundlePatterns
  ) {
    const match =
      text.match(
        pattern,
      );

    if (!match) {
      continue;
    }

    const normalized =
      normalizeWhitespace(
        match[0],
      );

    if (
      normalized
    ) {
      return normalized;
    }
  }

  /* -------------------------------------------------------
   * Coupon / sale / shipping
   * ----------------------------------------------------- */

  const nonPercentagePatterns =
    [
      /\buse\s+code[:\s]+[A-Z0-9_-]+\b/i,

      /\bcode[:\s]+[A-Z0-9_-]+\b/i,

      /\bcoupon[:\s]+[A-Z0-9_-]+\b/i,

      /\bprice\s*drop\b/i,

      /\bsale\s+is\s+live\b/i,

      /\bfree\s+shipping\b/i,

      /\bfree\s+delivery\b/i,
    ];

  for (
    const pattern of
      nonPercentagePatterns
  ) {
    const match =
      text.match(
        pattern,
      );

    if (match) {
      return normalizeWhitespace(
        match[0],
      );
    }
  }

  return null;
}