import type { CompetitorAd } from "../types";

/* =========================================================
 * META RELEVANCE UTILITIES
 *
 * Pure Node-side relevance helpers.
 *
 * These functions do NOT touch:
 * document
 * window
 * Element
 * page.evaluate()
 *
 * They only evaluate already-extracted ad data.
 * ======================================================= */

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

export function normalizeRelevanceText(
  value:
    | string
    | null
    | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function compactRelevanceText(
  value: string,
): string {
  return normalizeRelevanceText(
    value,
  ).replace(/\s+/g, "");
}

/* =========================================================
 * HOST MATCH
 * ======================================================= */

export function hostContainsQuery(
  url:
    | string
    | null
    | undefined,
  query: string,
): boolean {
  if (!url) {
    return false;
  }

  const compactQuery =
    compactRelevanceText(query);

  if (
    compactQuery.length < 3
  ) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    const host =
      parsed.hostname
        .replace(/^www\./i, "")
        .toLowerCase();

    const compactHost =
      host.replace(
        /[^a-z0-9]+/g,
        "",
      );

    return compactHost.includes(
      compactQuery,
    );
  } catch {
    return false;
  }
}

/* =========================================================
 * ADVERTISER RELEVANCE
 * ======================================================= */

export function isRelevantToAdvertiser(
  ad: CompetitorAd,
  query: string,
): boolean {
  const q =
    normalizeRelevanceText(
      query,
    );

  if (!q) {
    return false;
  }

  const advertiser =
    normalizeRelevanceText(
      ad.advertiserName,
    );

  const creator =
    normalizeRelevanceText(
      ad.creatorName,
    );

  /*
   * Exact advertiser match.
   */
  if (
    advertiser &&
    advertiser === q
  ) {
    return true;
  }

  /*
   * Partial advertiser match.
   */
  if (
    advertiser &&
    advertiser !==
      "unknown advertiser" &&
    (
      advertiser.includes(q) ||
      q.includes(advertiser)
    )
  ) {
    return true;
  }

  /*
   * Creator match.
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
   * Landing-domain match.
   */
  if (
    hostContainsQuery(
      ad.landingPage,
      query,
    )
  ) {
    return true;
  }

  /*
   * Source URL fallback.
   */
  if (
    hostContainsQuery(
      ad.sourceUrl,
      query,
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
 * KEYWORD RELEVANCE
 *
 * Used when search mode is keyword-oriented rather
 * than strict advertiser search.
 * ======================================================= */

export function isRelevantToKeyword(
  ad: CompetitorAd,
  query: string,
): boolean {
  const q =
    normalizeRelevanceText(
      query,
    );

  if (!q) {
    return false;
  }

  const fields = [
    ad.advertiserName,
    ad.creatorName,
    ad.primaryText,
    ad.headline,
    ad.description,
    ad.callToAction,
    ad.productName,
    ad.offer,
    ad.landingPage,
  ].map((value) =>
    normalizeRelevanceText(
      value,
    ),
  );

  return fields.some(
    (field) =>
      Boolean(field) &&
      (
        field.includes(q) ||
        q.includes(field)
      ),
  );
}

/* =========================================================
 * RELEVANCE SCORE
 * ======================================================= */

export function calculateMetaRelevanceScore(
  ad: CompetitorAd,
  query: string,
): number {
  const q =
    normalizeRelevanceText(
      query,
    );

  if (!q) {
    return 0;
  }

  const advertiser =
    normalizeRelevanceText(
      ad.advertiserName,
    );

  const creator =
    normalizeRelevanceText(
      ad.creatorName,
    );

  const headline =
    normalizeRelevanceText(
      ad.headline,
    );

  const product =
    normalizeRelevanceText(
      ad.productName,
    );

  const body =
    normalizeRelevanceText(
      ad.primaryText,
    );

  let score = 0;

  /*
   * Advertiser is the strongest relevance signal.
   */
  if (
    advertiser === q
  ) {
    score = Math.max(
      score,
      100,
    );
  } else if (
    advertiser.includes(q) ||
    q.includes(advertiser)
  ) {
    score = Math.max(
      score,
      90,
    );
  }

  /*
   * Creator signal.
   */
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

  /*
   * Product/headline signals.
   */
  if (
    headline === q
  ) {
    score = Math.max(
      score,
      80,
    );
  } else if (
    headline.includes(q)
  ) {
    score = Math.max(
      score,
      70,
    );
  }

  if (
    product === q
  ) {
    score = Math.max(
      score,
      75,
    );
  } else if (
    product.includes(q)
  ) {
    score = Math.max(
      score,
      65,
    );
  }

  /*
   * Body text is weaker.
   */
  if (
    body.includes(q)
  ) {
    score = Math.max(
      score,
      50,
    );
  }

  /*
   * Domain is a strong fallback.
   */
  if (
    hostContainsQuery(
      ad.landingPage,
      query,
    )
  ) {
    score = Math.max(
      score,
      90,
    );
  }

  if (
    hostContainsQuery(
      ad.sourceUrl,
      query,
    )
  ) {
    score = Math.max(
      score,
      80,
    );
  }

  return Math.min(
    100,
    score,
  );
}

/* =========================================================
 * BATCH FILTER
 * ======================================================= */

export function filterRelevantMetaAds(
  ads: CompetitorAd[],
  query: string,
  mode:
    | "advertiser"
    | "keyword"
    | "product" = "advertiser",
): CompetitorAd[] {
  return ads.filter(
    (ad) => {
      if (
        mode ===
        "keyword"
      ) {
        return isRelevantToKeyword(
          ad,
          query,
        );
      }

      if (
        mode ===
        "product"
      ) {
        const normalizedQuery =
          normalizeRelevanceText(
            query,
          );

        const product =
          normalizeRelevanceText(
            ad.productName,
          );

        const headline =
          normalizeRelevanceText(
            ad.headline,
          );

        return (
          product.includes(
            normalizedQuery,
          ) ||
          headline.includes(
            normalizedQuery,
          )
        );
      }

      return isRelevantToAdvertiser(
        ad,
        query,
      );
    },
  );
}

/* =========================================================
 * RANK RELEVANT ADS
 * ======================================================= */

export function rankMetaAdsByRelevance(
  ads: CompetitorAd[],
  query: string,
): CompetitorAd[] {
  return [...ads].sort(
    (a, b) =>
      calculateMetaRelevanceScore(
        b,
        query,
      ) -
      calculateMetaRelevanceScore(
        a,
        query,
      ),
  );
}