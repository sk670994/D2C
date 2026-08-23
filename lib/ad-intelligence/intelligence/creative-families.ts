import type {
  CompetitorAd,
  MetricSources,
} from "../types";

/* =========================================================
 * LOCAL ENRICHED AD TYPE
 *
 * We intentionally do not import from ../intelligence.ts
 * because this file lives inside the intelligence/ directory
 * and that creates an import-resolution collision.
 * ======================================================= */

type EnrichedCompetitorAd =
  Omit<
    CompetitorAd,
    "metricSources"
  > & {
    longevityScore?: number;
    relevanceScore?: number;
    engagementPotentialScore?: number;

    intelligence?: {
      rankingReasons: string[];
      badges: string[];
    };

    metricSources?: MetricSources;
  };

/* =========================================================
 * CREATIVE FAMILIES
 *
 * Estimated deterministic clustering.
 *
 * These are NOT Meta-provided family labels.
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
 * GENERIC / PLACEHOLDER META HEADLINES
 * ======================================================= */

const PLACEHOLDER_HEADLINES = new Set([
  "this ad has multiple versions",
  "this ad has multiple versions.",
  "this ad has multiple versions using this creative",
  "multiple versions of this ad",
  "इस विज्ञापन के एक से अधिक वर्जन है",
  "इस विज्ञापन के एक से अधिक वर्जन हैं",
  "इस विज्ञापन के एक से अधिक संस्करण हैं",
  "इस विज्ञापन के एक से अधिक संस्करण है",
  "3 विज्ञापन इस क्रिएटिव और टेक्स्ट का उपयोग करता है",
]);

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

function isPlaceholderHeadline(
  value:
    | string
    | null
    | undefined,
): boolean {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return true;
  }

  if (
    PLACEHOLDER_HEADLINES.has(
      normalized,
    )
  ) {
    return true;
  }

  /*
   * Generic fallback for localized Meta placeholder text.
   */
  return (
    normalized.includes(
      "multiple versions",
    ) ||
    normalized.includes(
      "more than one version",
    ) ||
    normalized.includes(
      "एक से अधिक वर्जन",
    ) ||
    normalized.includes(
      "एक से अधिक संस्करण",
    )
  );
}

/* =========================================================
 * MEANINGFUL FIELD
 * ======================================================= */

function getMeaningfulHeadline(
  ad: CompetitorAd,
): string | null {
  if (
    isPlaceholderHeadline(
      ad.headline,
    )
  ) {
    return null;
  }

  const headline =
    ad.headline?.trim();

  return headline || null;
}

function getMeaningfulProduct(
  ad: CompetitorAd,
): string | null {
  if (
    isPlaceholderHeadline(
      ad.productName,
    )
  ) {
    return null;
  }

  const product =
    ad.productName?.trim();

  return product || null;
}

function getMeaningfulPrimaryText(
  ad: CompetitorAd,
): string | null {
  const text =
    ad.primaryText?.trim();

  if (!text) {
    return null;
  }

  return text;
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

  return (
    intersection / union
  );
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
 * OFFER
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
 * CREATIVE SIGNALS
 * ======================================================= */

function sameAdvertiser(
  a: CompetitorAd,
  b: CompetitorAd,
): boolean {
  const left =
    normalizeText(
      a.advertiserName,
    );

  const right =
    normalizeText(
      b.advertiserName,
    );

  return Boolean(
    left &&
      right &&
      left === right,
  );
}

function sameCreator(
  a: CompetitorAd,
  b: CompetitorAd,
): boolean {
  const left =
    normalizeText(
      a.creatorName,
    );

  const right =
    normalizeText(
      b.creatorName,
    );

  return Boolean(
    left &&
      right &&
      left === right,
  );
}

/* =========================================================
 * FAMILY SIMILARITY
 *
 * Important:
 * - advertiser is strong
 * - real product title is strong
 * - real headline is strong
 * - primary copy becomes important when Meta gives
 *   a placeholder headline/product
 * - same landing domain helps
 * - identical placeholders do NOT create similarity
 * ======================================================= */
function familySimilarity(
  a: CompetitorAd,
  b: CompetitorAd,
): number {
  let score = 0;

  if (sameAdvertiser(a, b)) {
    score += 30;
  }

  if (sameCreator(a, b)) {
    score += 12;
  }

  const aProduct =
    getMeaningfulProduct(a);

  const bProduct =
    getMeaningfulProduct(b);

  const aHeadline =
    getMeaningfulHeadline(a);

  const bHeadline =
    getMeaningfulHeadline(b);

  const aPrimary =
    getMeaningfulPrimaryText(a);

  const bPrimary =
    getMeaningfulPrimaryText(b);

  /*
   * Product similarity.
   */
  if (
    aProduct &&
    bProduct
  ) {
    const similarity =
      jaccardSimilarity(
        aProduct,
        bProduct,
      );

    score +=
      similarity * 30;
  }

  /*
   * Headline similarity.
   *
   * Placeholder headlines have already been removed.
   */
  if (
    aHeadline &&
    bHeadline
  ) {
    const similarity =
      jaccardSimilarity(
        aHeadline,
        bHeadline,
      );

    score +=
      similarity * 18;
  }

  /*
   * Primary copy similarity.
   */
  if (
    aPrimary &&
    bPrimary
  ) {
    const similarity =
      jaccardSimilarity(
        aPrimary,
        bPrimary,
      );

    /*
     * Long identical-ish body copy is a very strong
     * family signal when product titles are unreliable.
     */
    score +=
      similarity * 20;
  }

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
    score += 8;
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
    score += 8;
  }

  /*
   * Same creative type is only a weak signal.
   */
  if (
    a.creativeType &&
    b.creativeType &&
    a.creativeType ===
      b.creativeType
  ) {
    score += 4;
  }

  /*
   * Same CTA is a tiny supporting signal.
   */
  const aCta =
    normalizeText(
      a.callToAction,
    );

  const bCta =
    normalizeText(
      b.callToAction,
    );

  if (
    aCta &&
    bCta &&
    aCta === bCta
  ) {
    score += 3;
  }

  return Math.min(
    100,
    Math.round(score),
  );
}

/* =========================================================
 * FAMILY NAME
 * ======================================================= */

function getPreferredFamilyName(
  ads: EnrichedCompetitorAd[],
): string {
  /*
   * 1. Most common meaningful product.
   */
  const products = ads
    .map(
      getMeaningfulProduct,
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

  if (
    products.length > 0
  ) {
    const common =
      findCommonValue(
        products,
      );

    if (common) {
      return common;
    }
  }

  /*
   * 2. Most common meaningful headline.
   */
  const headlines = ads
    .map(
      getMeaningfulHeadline,
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

  if (
    headlines.length > 0
  ) {
    const common =
      findCommonValue(
        headlines,
      );

    if (common) {
      return common;
    }
  }

  /*
   * 3. Most common primary text.
   */
  const primaryTexts =
    ads
      .map(
        getMeaningfulPrimaryText,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  if (
    primaryTexts.length > 0
  ) {
    const common =
      findCommonValue(
        primaryTexts,
      );

    if (common) {
      return common;
    }
  }

  /*
   * 4. Advertiser fallback.
   */
  const advertiser =
    findCommonValue(
      ads.map(
        (ad) =>
          ad.advertiserName,
      ),
    );

  if (advertiser) {
    return advertiser;
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

    if (!key) {
      continue;
    }

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

  for (
    const item of counts.values()
  ) {
    if (
      !best ||
      item.count >
        best.count
    ) {
      best = item;
    }
  }

  return (
    best?.display ??
    null
  );
}

/* =========================================================
 * FAMILY BASE SIGNATURE
 *
 * Stable enough for repeated observations.
 * ======================================================= */

function buildFamilySignature(
  ads: EnrichedCompetitorAd[],
): string {
  const advertiser =
    compactText(
      findCommonValue(
        ads.map(
          (ad) =>
            ad.advertiserName,
        ),
      ) ?? "",
    );

  const product =
    compactText(
      findCommonValue(
        ads
          .map(
            getMeaningfulProduct,
          ),
      ) ?? "",
    );

  const headline =
    compactText(
      findCommonValue(
        ads
          .map(
            getMeaningfulHeadline,
          ),
      ) ?? "",
    );

  const primaryText =
    compactText(
      findCommonValue(
        ads
          .map(
            getMeaningfulPrimaryText,
          ),
      ) ?? "",
    ).slice(
      0,
      80,
    );

  const domain =
    compactText(
      findCommonValue(
        ads.map((ad) =>
          getLandingDomain(
            ad.landingPage,
          ),
        ),
      ) ?? "",
    );

  const creator =
    compactText(
      findCommonValue(
        ads.map(
          (ad) =>
            ad.creatorName,
        ),
      ) ?? "",
    );

  return [
    advertiser,
    product,
    headline,
    primaryText,
    domain,
    creator,
  ]
    .filter(Boolean)
    .join("-");
}

/* =========================================================
 * FAMILY ID
 *
 * Must be unique within the returned set.
 * ======================================================= */

function buildUniqueFamilyId(
  signature: string,
  usedIds: Set<string>,
): string {
  const base =
    `family-${signature || "unknown"}`;

  if (
    !usedIds.has(base)
  ) {
    usedIds.add(base);
    return base;
  }

  let counter = 2;

  while (
    usedIds.has(
      `${base}-${counter}`,
    )
  ) {
    counter++;
  }

  const id =
    `${base}-${counter}`;

  usedIds.add(id);

  return id;
}

/* =========================================================
 * AVERAGE
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
  usedIds: Set<string>,
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
        (ad) =>
          ad.offer,
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

  const signature =
    buildFamilySignature(
      ads,
    );

  return {
    id:
      buildUniqueFamilyId(
        signature,
        usedIds,
      ),

    name:
      getPreferredFamilyName(
        ads,
      ),

    variants: [
      ...ads,
    ],

    variantCount:
      ads.length,

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
 * FAMILY GROUPING
 * ======================================================= */

export function groupCreativeFamilies(
  ads: EnrichedCompetitorAd[],
  threshold = 58,
): CreativeFamily[] {
  if (
    ads.length === 0
  ) {
    return [];
  }

  /*
   * Process more information-rich ads first.
   *
   * This prevents an uninformative placeholder creative
   * from becoming the representative for an entire family.
   */
  const sortedAds =
    [...ads].sort(
      (a, b) => {
        const aInfo =
          Number(
            Boolean(
              getMeaningfulProduct(
                a,
              ),
            ),
          ) +
          Number(
            Boolean(
              getMeaningfulHeadline(
                a,
              ),
            ),
          ) +
          Number(
            Boolean(
              getMeaningfulPrimaryText(
                a,
              ),
            ),
          );

        const bInfo =
          Number(
            Boolean(
              getMeaningfulProduct(
                b,
              ),
            ),
          ) +
          Number(
            Boolean(
              getMeaningfulHeadline(
                b,
              ),
            ),
          ) +
          Number(
            Boolean(
              getMeaningfulPrimaryText(
                b,
              ),
            ),
          );

        return (
          bInfo - aInfo
        );
      },
    );

  const groups:
    EnrichedCompetitorAd[][] =
    [];

  for (
    const ad of sortedAds
  ) {
    let bestGroup:
      | EnrichedCompetitorAd[]
      | null =
      null;

    let bestScore =
      -Infinity;

    for (
      const group of groups
    ) {
      const representative =
        group[0];

      const similarity =
        familySimilarity(
          ad,
          representative,
        );

      if (
        similarity >=
          threshold &&
        similarity >
          bestScore
      ) {
        bestScore =
          similarity;

        bestGroup =
          group;
      }
    }

    if (bestGroup) {
      bestGroup.push(ad);
    } else {
      groups.push([
        ad,
      ]);
    }
  }

  const usedIds =
    new Set<string>();

  return groups
    .map(
      (group) =>
        buildCreativeFamily(
          group,
          usedIds,
        ),
    )
    .sort(
      (a, b) => {
        if (
          b.variantCount !==
          a.variantCount
        ) {
          return (
            b.variantCount -
            a.variantCount
          );
        }

        return (
          b.averageCreativeScore -
          a.averageCreativeScore
        );
      },
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