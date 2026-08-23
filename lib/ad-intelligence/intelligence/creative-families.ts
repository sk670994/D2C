import type { CompetitorAd } from "../types";
import type { EnrichedCompetitorAd } from "../intelligence";

/* =========================================================
 * CREATIVE FAMILIES
 *
 * Groups related ads into estimated creative families.
 *
 * This is NOT a Meta-provided label.
 * It is our own deterministic clustering signal.
 * ======================================================= */

export type CreativeFamily = {
  id: string;

  name: string;

  variants: EnrichedCompetitorAd[];

  variantCount: number;

  imageCount: number;
  videoCount: number;
  carouselCount: number;

  averageLongevity: number;
  averageCreativeScore: number;
  averageEngagementPotential: number;

  commonOffer: string | null;

  commonAdvertiser: string | null;

  commonCreator: string | null;

  commonLandingDomain: string | null;
};

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(
  value: string,
): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "");
}

/* =========================================================
 * TOKEN SIMILARITY
 * ======================================================= */

function tokenize(
  value:
    | string
    | null
    | undefined,
): Set<string> {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return new Set();
  }

  return new Set(
    normalized
      .split(/[^a-z0-9]+/i)
      .map((token) =>
        token.trim(),
      )
      .filter(
        (token) =>
          token.length >= 2,
      ),
  );
}

function jaccardSimilarity(
  a:
    | string
    | null
    | undefined,
  b:
    | string
    | null
    | undefined,
): number {
  const aTokens =
    tokenize(a);

  const bTokens =
    tokenize(b);

  if (
    aTokens.size === 0 ||
    bTokens.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection++;
    }
  }

  const union =
    aTokens.size +
    bTokens.size -
    intersection;

  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

/* =========================================================
 * LANDING DOMAIN
 * ======================================================= */

function getLandingDomain(
  url:
    | string
    | null
    | undefined,
): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url)
      .hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

/* =========================================================
 * OFFER NORMALIZATION
 * ======================================================= */

function normalizeOffer(
  value:
    | string
    | null
    | undefined,
): string | null {
  const normalized =
    normalizeText(value);

  return normalized || null;
}

/* =========================================================
 * FAMILY SIMILARITY
 * ======================================================= */

function familySimilarity(
  a: CompetitorAd,
  b: CompetitorAd,
): number {
  let score = 0;

  /*
   * Same advertiser is a strong signal.
   */
  if (
    normalizeText(
      a.advertiserName,
    ) &&
    normalizeText(
      a.advertiserName,
    ) ===
      normalizeText(
        b.advertiserName,
      )
  ) {
    score += 30;
  }

  /*
   * Product similarity.
   */
  const productSimilarity =
    jaccardSimilarity(
      a.productName,
      b.productName,
    );

  score +=
    productSimilarity * 30;

  /*
   * Headline similarity.
   */
  const headlineSimilarity =
    jaccardSimilarity(
      a.headline,
      b.headline,
    );

  score +=
    headlineSimilarity * 15;

  /*
   * Primary-text similarity.
   */
  const textSimilarity =
    jaccardSimilarity(
      a.primaryText,
      b.primaryText,
    );

  score +=
    textSimilarity * 10;

  /*
   * Same offer.
   */
  const aOffer =
    normalizeOffer(a.offer);

  const bOffer =
    normalizeOffer(b.offer);

  if (
    aOffer &&
    bOffer &&
    aOffer === bOffer
  ) {
    score += 5;
  }

  /*
   * Same landing domain.
   */
  const aDomain =
    getLandingDomain(
      a.landingPage,
    );

  const bDomain =
    getLandingDomain(
      b.landingPage,
    );

  if (
    aDomain &&
    bDomain &&
    aDomain === bDomain
  ) {
    score += 5;
  }

  /*
   * Same creative type provides a small signal.
   */
  if (
    a.creativeType &&
    a.creativeType ===
      b.creativeType
  ) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}

/* =========================================================
 * FAMILY NAME
 * ======================================================= */

function getPreferredFamilyName(
  ads: EnrichedCompetitorAd[],
): string {
  const products = ads
    .map((ad) =>
      ad.productName?.trim(),
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

  if (products.length > 0) {
    const counts =
      new Map<
        string,
        number
      >();

    const displayNames =
      new Map<
        string,
        string
      >();

    for (const product of products) {
      const key =
        normalizeText(
          product,
        );

      counts.set(
        key,
        (counts.get(key) ??
          0) + 1,
      );

      displayNames.set(
        key,
        product,
      );
    }

    let bestKey: string | null =
      null;

    let bestCount = 0;

    for (const [
      key,
      count,
    ] of counts.entries()) {
      if (
        count > bestCount
      ) {
        bestKey = key;
        bestCount = count;
      }
    }

    if (bestKey) {
      return (
        displayNames.get(
          bestKey,
        ) ?? "Creative family"
      );
    }
  }

  const headlines = ads
    .map((ad) =>
      ad.headline?.trim(),
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

  if (headlines.length > 0) {
    return headlines[0];
  }

  return "Creative family";
}

/* =========================================================
 * COMMON VALUE
 * ======================================================= */

function findCommonValue(
  values: Array<
    string | null | undefined
  >,
): string | null {
  const counts =
    new Map<
      string,
      {
        count: number;
        display: string;
      }
    >();

  for (const value of values) {
    const cleaned =
      value?.trim();

    if (!cleaned) {
      continue;
    }

    const key =
      normalizeText(cleaned);

    const existing =
      counts.get(key);

    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        count: 1,
        display: cleaned,
      });
    }
  }

  let best:
    | {
        count: number;
        display: string;
      }
    | null = null;

  for (const item of counts.values()) {
    if (
      !best ||
      item.count > best.count
    ) {
      best = item;
    }
  }

  return best?.display ?? null;
}

/* =========================================================
 * FAMILY ID
 * ======================================================= */

function buildFamilyId(
  ads: EnrichedCompetitorAd[],
): string {
  const advertiser =
    compactText(
      ads[0]?.advertiserName ??
        "",
    );

  const product =
    compactText(
      getPreferredFamilyName(ads),
    );

  const domain =
    compactText(
      getLandingDomain(
        ads[0]?.landingPage,
      ) ?? "",
    );

  return [
    "family",
    advertiser,
    product,
    domain,
  ]
    .filter(Boolean)
    .join("-");
}

/* =========================================================
 * FAMILY METRICS
 * ======================================================= */

function average(
  values: number[],
): number {
  if (
    values.length === 0
  ) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    values.length
  );
}

/* =========================================================
 * BUILD SINGLE FAMILY
 * ======================================================= */

function buildCreativeFamily(
  ads: EnrichedCompetitorAd[],
): CreativeFamily {
  const imageCount =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "image",
    ).length;

  const videoCount =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "video",
    ).length;

  const carouselCount =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "carousel",
    ).length;

  const commonOffer =
    findCommonValue(
      ads.map(
        (ad) => ad.offer,
      ),
    );

  const commonAdvertiser =
    findCommonValue(
      ads.map(
        (ad) =>
          ad.advertiserName,
      ),
    );

  const commonCreator =
    findCommonValue(
      ads.map(
        (ad) =>
          ad.creatorName,
      ),
    );

  const commonLandingDomain =
    findCommonValue(
      ads.map((ad) =>
        getLandingDomain(
          ad.landingPage,
        ),
      ),
    );

  return {
    id: buildFamilyId(
      ads,
    ),

    name:
      getPreferredFamilyName(
        ads,
      ),

    variants: ads,

    variantCount: ads.length,

    imageCount,

    videoCount,

    carouselCount,

    averageLongevity:
      Math.round(
        average(
          ads.map(
            (ad) =>
              ad.runningDays ??
              0,
          ),
        ),
      ),

    averageCreativeScore:
      Math.round(
        average(
          ads.map(
            (ad) =>
              ad.creativeScore ??
              0,
          ),
        ),
      ),

    averageEngagementPotential:
      Math.round(
        average(
          ads.map(
            (ad) =>
              ad.engagementPotentialScore ??
              0,
          ),
        ),
      ),

    commonOffer,

    commonAdvertiser,

    commonCreator,

    commonLandingDomain,
  };
}

/* =========================================================
 * GROUP ADS
 * ======================================================= */

/**
 * Group ads using deterministic similarity.
 *
 * Default threshold is intentionally conservative to
 * avoid collapsing unrelated creatives into one family.
 */
export function groupCreativeFamilies(
  ads: EnrichedCompetitorAd[],
  threshold = 62,
): CreativeFamily[] {
  if (
    ads.length === 0
  ) {
    return [];
  }

  const groups:
    EnrichedCompetitorAd[][] =
    [];

  for (const ad of ads) {
    let bestGroup:
      EnrichedCompetitorAd[] | null =
      null;

    let bestScore =
      0;

    for (const group of groups) {
      const representative =
        group[0];

      const similarity =
        familySimilarity(
          ad,
          representative,
        );

      if (
        similarity >= threshold &&
        similarity > bestScore
      ) {
        bestScore =
          similarity;

        bestGroup = group;
      }
    }

    if (bestGroup) {
      bestGroup.push(ad);
    } else {
      groups.push([ad]);
    }
  }

  return groups
    .map(
      buildCreativeFamily,
    )
    .sort(
      (a, b) =>
        b.variantCount -
        a.variantCount,
    );
}

/* =========================================================
 * FAMILY SUMMARY
 * ======================================================= */

export type CreativeFamilySummary = {
  familyCount: number;

  totalVariants: number;

  largestFamily:
    | CreativeFamily
    | null;

  mostCommonOffer:
    | string
    | null;

  creatorFamilies: number;

  videoFamilies: number;

  carouselFamilies: number;
};

export function summarizeCreativeFamilies(
  families: CreativeFamily[],
): CreativeFamilySummary {
  const largestFamily =
    [...families].sort(
      (a, b) =>
        b.variantCount -
        a.variantCount,
    )[0] ?? null;

  const mostCommonOffer =
    findCommonValue(
      families.map(
        (family) =>
          family.commonOffer,
      ),
    );

  const creatorFamilies =
    families.filter(
      (family) =>
        Boolean(
          family.commonCreator,
        ),
    ).length;

  const videoFamilies =
    families.filter(
      (family) =>
        family.videoCount >
        0,
    ).length;

  const carouselFamilies =
    families.filter(
      (family) =>
        family.carouselCount >
        0,
    ).length;

  return {
    familyCount:
      families.length,

    totalVariants:
      families.reduce(
        (sum, family) =>
          sum +
          family.variantCount,
        0,
      ),

    largestFamily,

    mostCommonOffer,

    creatorFamilies,

    videoFamilies,

    carouselFamilies,
  };
}

export default groupCreativeFamilies;