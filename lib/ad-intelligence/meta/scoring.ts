import type { CompetitorAd } from "../types";

/* =========================================================
 * META SCORING
 * 
 * These are deterministic estimates only.
 * They are not Meta performance metrics.
 * ======================================================= */

export function calculateCreativeScore(
  ad: CompetitorAd,
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

  if (ad.creativeType === "video") {
    score += 5;
  }

  if (ad.creativeType === "carousel") {
    score += 5;
  }

  return Math.min(100, score);
}

export function calculateLongevityScore(
  ad: CompetitorAd,
): number {
  const runningDays =
    Math.max(
      0,
      ad.runningDays ?? 0,
    );

  if (runningDays <= 0) {
    return 0;
  }

  /*
   * Long-running ads receive a higher score,
   * but the curve is capped so old ads do not
   * completely dominate newer creatives.
   */
  return Math.min(
    100,
    Math.round(
      100 *
        (1 -
          Math.exp(
            -runningDays / 60,
          )),
    ),
  );
}

export function calculateRelevanceScore(
  ad: CompetitorAd,
  query: string,
): number {
  const normalize = (
    value:
      | string
      | null
      | undefined,
  ): string =>
    (value ?? "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(
        /[^a-z0-9]+/g,
        " ",
      )
      .trim();

  const q = normalize(query);

  if (!q) {
    return 0;
  }

  const advertiser =
    normalize(
      ad.advertiserName,
    );

  const creator =
    normalize(ad.creatorName);

  let score = 0;

  if (
    advertiser === q
  ) {
    score += 100;
  } else if (
    advertiser.includes(q) ||
    q.includes(advertiser)
  ) {
    score += 90;
  }

  if (
    creator === q
  ) {
    score = Math.max(
      score,
      85,
    );
  } else if (
    creator.includes(q) ||
    q.includes(creator)
  ) {
    score = Math.max(
      score,
      75,
    );
  }

  if (
    ad.landingPage &&
    normalize(
      (() => {
        try {
          return new URL(
            ad.landingPage!,
          ).hostname;
        } catch {
          return "";
        }
      })(),
    ).replace(
      /\s+/g,
      "",
    ).includes(
      q.replace(
        /\s+/g,
        "",
      ),
    )
  ) {
    score = Math.max(
      score,
      90,
    );
  }

  return Math.min(
    100,
    score,
  );
}

export function calculateEngagementPotentialScore(
  ad: CompetitorAd,
): number {
  let score = 40;

  if (ad.creativeType === "video") {
    score += 20;
  }

  if (ad.creativeType === "carousel") {
    score += 10;
  }

  if (ad.primaryText) {
    score += 5;
  }

  if (ad.headline) {
    score += 5;
  }

  if (ad.callToAction) {
    score += 5;
  }

  if (ad.offer) {
    score += 10;
  }

  if (ad.creatorName) {
    score += 10;
  }

  if (ad.isActive) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}

export function scoreMetaAd(
  ad: CompetitorAd,
  query = "",
): CompetitorAd {
  const creativeScore =
    calculateCreativeScore(
      ad,
    );

  const longevityScore =
    calculateLongevityScore(
      ad,
    );

  const relevanceScore =
    calculateRelevanceScore(
      ad,
      query,
    );

  const engagementPotentialScore =
    calculateEngagementPotentialScore(
      ad,
    );

  return {
    ...ad,

    creativeScore,

    longevityScore,

    relevanceScore,

    engagementPotentialScore,

    metricSources: {
      ...(ad.metricSources ?? {}),

      creativeScore:
        "estimated",

      longevityScore:
        "derived",

      relevanceScore:
        "derived",

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
    },
  };
}

export function scoreMetaAds(
  ads: CompetitorAd[],
  query = "",
): CompetitorAd[] {
  return ads.map((ad) =>
    scoreMetaAd(
      ad,
      query,
    ),
  );
}