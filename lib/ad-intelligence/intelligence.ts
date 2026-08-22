import type {
  AdCreativeType,
  CompetitorAd,
  MetricSources,
} from "./types";

/* =========================================================
 * INTELLIGENCE TYPES
 * ======================================================= */

export type AdIntelligence = {
  rankingReasons: string[];
  badges: string[];
};

/* =========================================================
 * ENRICHED AD
 *
 * IMPORTANT:
 * We Omit metricSources from CompetitorAd before redefining it.
 * This prevents:
 *
 * CompetitorAd & { metricSources?: AnotherMetricSources }
 *
 * from becoming an incompatible intersection.
 * ======================================================= */

export type EnrichedCompetitorAd = Omit<
  CompetitorAd,
  "metricSources"
> & {
  longevityScore?: number;
  relevanceScore?: number;
  engagementPotentialScore?: number;
  intelligence?: AdIntelligence;
  metricSources?: MetricSources;
};

/* =========================================================
 * MOST ADVERTISED PRODUCT
 * ======================================================= */

export type MostAdvertisedProduct = {
  productName: string | null;
  adCount: number;
};

/* =========================================================
 * METRIC AVAILABILITY RESULT
 * ======================================================= */

export type MetricAvailabilityResult = {
  status: MetricSources["reach"];
  reason: string;
};

/* =========================================================
 * SUMMARY
 * ======================================================= */

export type AdSearchSummary = {
  totalAdsFound: number;
  activeAds: number;
  inactiveAds: number;
  videoAds: number;
  imageAds: number;
  carouselAds: number;
  unknownCreativeAds: number;

  longestRunningAd:
    | EnrichedCompetitorAd
    | null;

  mostClickWorthyAd:
    | EnrichedCompetitorAd
    | null;

  highestCreativeScoreAd:
    | EnrichedCompetitorAd
    | null;

  mostAdvertisedProduct:
    | MostAdvertisedProduct
    | null;

  reach: MetricAvailabilityResult;
  clicks: MetricAvailabilityResult;
  ctr: MetricAvailabilityResult;
  impressions: MetricAvailabilityResult;
};

/* =========================================================
 * RESULT
 * ======================================================= */

export type AdIntelligenceResult = {
  ads: EnrichedCompetitorAd[];
  summary: AdSearchSummary;
};

/* =========================================================
 * HELPERS
 * ======================================================= */

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function safeNumber(
  value:
    | number
    | null
    | undefined
): number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : 0;
}

function normalizeText(
  value:
    | string
    | null
    | undefined
): string {
  return (value ?? "")
    .toLowerCase()
    .trim();
}

function compact(
  value: string
): string {
  return value.replace(
    /\s+/g,
    ""
  );
}

/* =========================================================
 * LONGEVITY SCORE
 * ======================================================= */

function calculateLongevityScore(
  ad: CompetitorAd
): number {
  const days =
    safeNumber(ad.runningDays);

  if (days <= 0) {
    return 0;
  }

  if (days >= 180) {
    return 100;
  }

  if (days >= 120) {
    return 90;
  }

  if (days >= 90) {
    return 80;
  }

  if (days >= 60) {
    return 60;
  }

  if (days >= 30) {
    return 40;
  }

  if (days >= 14) {
    return 20;
  }

  return 10;
}

/* =========================================================
 * RELEVANCE SCORE
 * ======================================================= */

function calculateRelevanceScore(
  ad: CompetitorAd,
  query: string
): number {
  const q = normalizeText(query);

  if (!q) {
    return 0;
  }

  const advertiser = normalizeText(
    ad.advertiserName
  );

  const creator = normalizeText(
    ad.creatorName
  );

  const landingPage = normalizeText(
    ad.landingPage
  );

  const product = normalizeText(
    ad.productName
  );

  const headline = normalizeText(
    ad.headline
  );

  const primaryText = normalizeText(
    ad.primaryText
  );

  if (
    advertiser &&
    advertiser !== "unknown advertiser" &&
    (
      advertiser === q ||
      advertiser.includes(q) ||
      q.includes(advertiser)
    )
  ) {
    return 100;
  }

  if (
    creator &&
    (
      creator === q ||
      creator.includes(q) ||
      q.includes(creator)
    )
  ) {
    return 90;
  }

  try {
    const host = new URL(landingPage).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    const compactQuery = q.replace(
      /[^a-z0-9]/g,
      ""
    );

    const compactHost = host.replace(
      /[^a-z0-9]/g,
      ""
    );

    if (
      compactQuery &&
      compactHost.includes(compactQuery)
    ) {
      return 90;
    }
  } catch {
    // Ignore invalid landing URLs.
  }

  if (
    product &&
    product.includes(q)
  ) {
    return 80;
  }

  if (
    headline &&
    headline.includes(q)
  ) {
    return 75;
  }

  if (
    primaryText &&
    primaryText.includes(q)
  ) {
    return 65;
  }

  return 20;
}
/* =========================================================
 * ENGAGEMENT POTENTIAL
 * ======================================================= */

function calculateEngagementPotential(
  ad: CompetitorAd
): number {
  let score = 35;

  if (
    ad.creativeType === "video"
  ) {
    score += 20;
  }

  if (
    ad.creativeType === "carousel"
  ) {
    score += 10;
  }

  if (ad.primaryText) {
    score += 10;
  }

  if (ad.callToAction) {
    score += 10;
  }

  if (ad.offer) {
    score += 15;
  }

  if (ad.productName) {
    score += 10;
  }

  if (ad.isActive) {
    score += 5;
  }

  if (
    ad.videoDurationSeconds &&
    ad.videoDurationSeconds > 0
  ) {
    score += 5;
  }

  return clamp(score);
}

/* =========================================================
 * INTELLIGENCE REASONS
 * ======================================================= */

function buildRankingReasons(
  ad: CompetitorAd,
  longevityScore: number
): string[] {
  const reasons: string[] = [];

  if (ad.offer) {
    reasons.push(
      "Strong offer detected"
    );
  }

  if (ad.productName) {
    reasons.push(
      "Specific product detected"
    );
  }

  if (ad.callToAction) {
    reasons.push(
      "Clear CTA"
    );
  }

  if (
    ad.primaryText &&
    ad.primaryText.length >= 120
  ) {
    reasons.push(
      "Detailed ad copy"
    );
  }

  if (
    ad.creativeType === "video"
  ) {
    reasons.push(
      "Video creative"
    );
  }

  if (
    ad.creativeType === "carousel"
  ) {
    reasons.push(
      "Carousel creative"
    );
  }

  if (longevityScore >= 60) {
    reasons.push(
      "Long-running creative"
    );
  }

  return reasons;
}

/* =========================================================
 * BADGES
 * ======================================================= */

function buildBadges(
  ad: CompetitorAd
): string[] {
  const badges: string[] = [];

  if (ad.offer) {
    badges.push("Offer");
  }

  if (ad.productName) {
    badges.push("Product Ad");
  }

  switch (ad.creativeType) {
    case "video":
      badges.push("Video");
      break;

    case "image":
      badges.push("Image");
      break;

    case "carousel":
      badges.push("Carousel");
      break;

    default:
      break;
  }

  if (
    ad.partnershipType === "creator"
  ) {
    badges.push("Creator");
  }

  if (ad.isActive) {
    badges.push("Active");
  } else {
    badges.push("Inactive");
  }

  return badges;
}

/* =========================================================
 * METRIC SOURCES
 *
 * This uses the canonical MetricSources type from
 * lib/ad-intelligence/types.ts.
 * ======================================================= */

function buildMetricSources(
  ad: CompetitorAd
): MetricSources {
  return {
    creativeScore: "estimated",
    longevityScore: "derived",
    relevanceScore: "derived",
    engagementPotentialScore:
      "estimated",

    reach:
      ad.metricSources?.reach ??
      "unavailable",

    clicks:
      ad.metricSources?.clicks ??
      "unavailable",

    ctr:
      ad.metricSources?.ctr ??
      "unavailable",

    impressions:
      ad.metricSources?.impressions ??
      "unavailable",
  };
}

/* =========================================================
 * ENRICH SINGLE AD
 * ======================================================= */

function enrichAd(
  ad: CompetitorAd,
  query: string
): EnrichedCompetitorAd {
  const longevityScore =
    calculateLongevityScore(ad);

  const relevanceScore =
    calculateRelevanceScore(
      ad,
      query
    );

  const engagementPotentialScore =
    calculateEngagementPotential(ad);

  const rankingReasons =
    buildRankingReasons(
      ad,
      longevityScore
    );

  const badges =
    buildBadges(ad);

  const metricSources =
    buildMetricSources(ad);

  return {
    ...ad,

    longevityScore,

    relevanceScore,

    engagementPotentialScore,

    metricSources,

    intelligence: {
      rankingReasons,
      badges,
    },
  };
}

/* =========================================================
 * ENRICH ADS
 * ======================================================= */

export function enrichAds(
  ads: CompetitorAd[],
  query = ""
): EnrichedCompetitorAd[] {
  return ads.map((ad) =>
    enrichAd(ad, query)
  );
}

/* =========================================================
 * RANK ADS
 * ======================================================= */

export function rankAds(
  ads: EnrichedCompetitorAd[]
): EnrichedCompetitorAd[] {
  return [...ads].sort(
    (a, b) => {
      const aCreative =
        safeNumber(
          a.creativeScore
        );

      const bCreative =
        safeNumber(
          b.creativeScore
        );

      const aLongevity =
        safeNumber(
          a.longevityScore
        );

      const bLongevity =
        safeNumber(
          b.longevityScore
        );

      const aRelevance =
        safeNumber(
          a.relevanceScore
        );

      const bRelevance =
        safeNumber(
          b.relevanceScore
        );

      const aEngagement =
        safeNumber(
          a.engagementPotentialScore
        );

      const bEngagement =
        safeNumber(
          b.engagementPotentialScore
        );

      const aTotal =
        aCreative +
        aLongevity +
        aRelevance +
        aEngagement;

      const bTotal =
        bCreative +
        bLongevity +
        bRelevance +
        bEngagement;

      return bTotal - aTotal;
    }
  );
}

/* =========================================================
 * LONGEST RUNNING AD
 * ======================================================= */

function findLongestRunningAd(
  ads: EnrichedCompetitorAd[]
): EnrichedCompetitorAd | null {
  return (
    [...ads]
      .filter(
        (ad) =>
          safeNumber(
            ad.runningDays
          ) > 0
      )
      .sort(
        (a, b) =>
          safeNumber(
            b.runningDays
          ) -
          safeNumber(
            a.runningDays
          )
      )[0] ?? null
  );
}

/* =========================================================
 * HIGHEST CREATIVE SCORE
 * ======================================================= */

function findHighestCreativeScoreAd(
  ads: EnrichedCompetitorAd[]
): EnrichedCompetitorAd | null {
  return (
    [...ads].sort(
      (a, b) =>
        safeNumber(
          b.creativeScore
        ) -
        safeNumber(
          a.creativeScore
        )
    )[0] ?? null
  );
}

/* =========================================================
 * MOST CLICK WORTHY
 * ======================================================= */

function findMostClickWorthyAd(
  ads: EnrichedCompetitorAd[]
): EnrichedCompetitorAd | null {
  return (
    [...ads].sort(
      (a, b) => {
        const aScore =
          safeNumber(
            a.engagementPotentialScore
          ) +
          safeNumber(
            a.creativeScore
          ) +
          safeNumber(
            a.relevanceScore
          );

        const bScore =
          safeNumber(
            b.engagementPotentialScore
          ) +
          safeNumber(
            b.creativeScore
          ) +
          safeNumber(
            b.relevanceScore
          );

        return bScore - aScore;
      }
    )[0] ?? null
  );
}

/* =========================================================
 * PRODUCT FREQUENCY
 * ======================================================= */

function findMostAdvertisedProduct(
  ads: EnrichedCompetitorAd[]
): MostAdvertisedProduct | null {
  const counts =
    new Map<string, number>();

  const displayNames =
    new Map<string, string>();

  for (const ad of ads) {
    const product =
      ad.productName?.trim();

    if (!product) {
      continue;
    }

    const key =
      product.toLowerCase();

    counts.set(
      key,
      (counts.get(key) ?? 0) + 1
    );

    displayNames.set(
      key,
      product
    );
  }

  let bestKey:
    | string
    | null = null;

  let bestCount = 0;

  for (const [
    key,
    count,
  ] of counts.entries()) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }

  if (!bestKey) {
    return null;
  }

  return {
    productName:
      displayNames.get(
        bestKey
      ) ?? null,
    adCount: bestCount,
  };
}

/* =========================================================
 * SUMMARY
 * ======================================================= */

export function buildAdSearchSummary(
  ads: EnrichedCompetitorAd[]
): AdSearchSummary {
  const activeAds =
    ads.filter(
      (ad) => ad.isActive
    ).length;

  const inactiveAds =
    ads.length - activeAds;

  const videoAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "video"
    ).length;

  const imageAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "image"
    ).length;

  const carouselAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "carousel"
    ).length;

  const unknownCreativeAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "unknown"
    ).length;

  return {
    totalAdsFound: ads.length,

    activeAds,

    inactiveAds,

    videoAds,

    imageAds,

    carouselAds,

    unknownCreativeAds,

    longestRunningAd:
      findLongestRunningAd(
        ads
      ),

    mostClickWorthyAd:
      findMostClickWorthyAd(
        ads
      ),

    highestCreativeScoreAd:
      findHighestCreativeScoreAd(
        ads
      ),

    mostAdvertisedProduct:
      findMostAdvertisedProduct(
        ads
      ),

    reach: {
      status: "unavailable",
      reason:
        "No reach figure was exposed by the provider.",
    },

    clicks: {
      status: "unavailable",
      reason:
        "No click count was exposed by the provider.",
    },

    ctr: {
      status: "unavailable",
      reason:
        "No CTR was exposed by the provider.",
    },

    impressions: {
      status: "unavailable",
      reason:
        "No impression count was exposed by the provider.",
    },
  };
}

/* =========================================================
 * CALCULATE AD INTELLIGENCE
 * ======================================================= */

export function calculateAdIntelligence(
  ads: CompetitorAd[],
  query = ""
): AdIntelligenceResult {
  const enriched =
    enrichAds(
      ads,
      query
    );

  const ranked =
    rankAds(enriched);

  const summary =
    buildAdSearchSummary(
      ranked
    );

  return {
    ads: ranked,
    summary,
  };
}

export default calculateAdIntelligence;