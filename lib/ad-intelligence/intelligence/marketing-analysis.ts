import type {
  CompetitorAd,
} from "../types";

/* =========================================================
 * MARKETING ANALYSIS
 *
 * Deterministic marketing-message analysis.
 *
 * This module does NOT call an AI model.
 * It extracts structured marketing signals from the
 * text already available on CompetitorAd.
 * ======================================================= */

export type MarketingAngle =
  | "product"
  | "benefit"
  | "offer"
  | "problem_solution"
  | "social_proof"
  | "urgency"
  | "curiosity"
  | "lifestyle"
  | "seasonal"
  | "brand"
  | "unknown";

export type MarketingHook =
  | "offer"
  | "problem"
  | "benefit"
  | "curiosity"
  | "social_proof"
  | "urgency"
  | "product"
  | "statement"
  | "unknown";

export type MarketingAnalysis = {
  adId: string;

  primaryText: string | null;

  headline: string | null;

  description: string | null;

  offer: string | null;

  callToAction: string | null;

  angle: MarketingAngle;

  hook: MarketingHook;

  promise: string | null;

  benefit: string | null;

  objection: string | null;

  proof: string | null;

  urgency: string | null;

  marketingThemes: string[];

  confidence: number;

  evidence: string[];
};

export type MarketingAnalysisSummary = {
  totalAds: number;

  analyzedAds: number;

  averageConfidence: number;

  angleCounts: Record<
    MarketingAngle,
    number
  >;

  hookCounts: Record<
    MarketingHook,
    number
  >;

  topAngle: MarketingAngle;

  topHook: MarketingHook;

  offerCount: number;

  urgencyCount: number;

  proofCount: number;

  benefitCount: number;

  objectionCount: number;

  analyses: MarketingAnalysis[];
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
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(
  value:
    | string
    | null
    | undefined,
): string {
  return normalizeText(
    value,
  ).toLowerCase();
}

/* =========================================================
 * FIELD HELPERS
 * ======================================================= */

function nullableText(
  value:
    | string
    | null
    | undefined,
): string | null {
  const cleaned =
    normalizeText(value);

  return cleaned || null;
}

function buildSourceText(
  ad: CompetitorAd,
): string {
  return normalizeText(
    [
      ad.primaryText,
      ad.headline,
      ad.description,
      ad.productName,
      ad.offer,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value &&
              value.trim(),
          ),
      )
      .join(" "),
  );
}

/* =========================================================
 * KEYWORD UTILITIES
 * ======================================================= */

function containsAny(
  text: string,
  patterns: string[],
): boolean {
  return patterns.some(
    (pattern) =>
      text.includes(
        pattern,
      ),
  );
}

function firstMatchingPhrase(
  text: string,
  patterns: string[],
): string | null {
  const normalized =
    normalizeLower(text);

  const found =
    patterns.find(
      (pattern) =>
        normalized.includes(
          pattern,
        ),
    );

  return found ?? null;
}

/* =========================================================
 * OFFER
 * ======================================================= */

function detectOffer(
  ad: CompetitorAd,
  text: string,
): string | null {
  /*
   * First trust the normalized ad.offer only when it is valid.
   *
   * This protects the marketing analysis layer from malformed
   * values that may have entered through another extraction path.
   */
  const normalizedAdOffer =
    nullableText(ad.offer);

  if (normalizedAdOffer) {
    const percentageMatches =
      [
        ...normalizedAdOffer.matchAll(
          /\b(\d{1,3})\s*%\s*(?:off|discount)\b/gi,
        ),
      ];

    let valid = true;

    for (
      const match of percentageMatches
    ) {
      const percentage =
        Number(match[1]);

      if (
        !Number.isFinite(
          percentage,
        ) ||
        percentage <= 0 ||
        percentage > 100
      ) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return normalizedAdOffer;
    }
  }

  const normalized =
    normalizeLower(text);

  /*
   * Percentage offers detected from raw marketing text.
   *
   * Only percentages from 1 through 100 are accepted.
   */
  const percentage =
    text.match(
      /\b(\d{1,3})\s*%\s*(?:off|discount)\b/i,
    );

  if (percentage?.[1]) {
    const value =
      Number(
        percentage[1],
      );

    if (
      Number.isFinite(value) &&
      value > 0 &&
      value <= 100
    ) {
      return percentage[0].trim();
    }
  }

  const offerPatterns = [
    "free shipping",
    "free delivery",
    "limited offer",
    "special offer",
    "discount",
    "save",
    "sale",
    "coupon",
    "promo code",
    "promo",
    "deal",
  ];

  const found =
    offerPatterns.find(
      (pattern) =>
        normalized.includes(
          pattern,
        ),
    );

  return found
    ? found
    : null;
}

/* =========================================================
 * URGENCY
 * ======================================================= */

function detectUrgency(
  text: string,
): string | null {
  const normalized =
    normalizeLower(text);

  const patterns = [
    "limited time",
    "today only",
    "ends today",
    "ending soon",
    "last chance",
    "don't miss",
    "dont miss",
    "limited stock",
    "while supplies last",
    "act now",
    "hurry",
    "ends soon",
  ];

  return firstMatchingPhrase(
    normalized,
    patterns,
  );
}

/* =========================================================
 * SOCIAL PROOF
 * ======================================================= */

function detectProof(
  text: string,
): string | null {
  const normalized =
    normalizeLower(text);

  const patterns = [
    "best seller",
    "bestseller",
    "top rated",
    "top-rated",
    "loved by",
    "trusted by",
    "thousands",
    "millions",
    "customer favorite",
    "customers love",
    "five star",
    "5 star",
    "reviews",
    "rated",
  ];

  return firstMatchingPhrase(
    normalized,
    patterns,
  );
}

/* =========================================================
 * BENEFIT
 * ======================================================= */

function detectBenefit(
  text: string,
): string | null {
  const normalized =
    normalizeLower(text);

  const patterns = [
    "free shipping",
    "free delivery",
    "easy returns",
    "comfortable",
    "lightweight",
    "breathable",
    "durable",
    "premium",
    "powerful",
    "faster",
    "easier",
    "better",
    "designed to",
    "helps you",
    "built for",
    "made for",
    "all-day comfort",
  ];

  return firstMatchingPhrase(
    normalized,
    patterns,
  );
}

/* =========================================================
 * OBJECTION / PROBLEM
 * ======================================================= */

function detectObjection(
  text: string,
): string | null {
  const normalized =
    normalizeLower(text);

  const patterns = [
    "tired of",
    "struggling with",
    "problem",
    "pain",
    "frustrated",
    "hard to",
    "difficult",
    "never again",
    "without the hassle",
    "without worrying",
    "no more",
    "say goodbye to",
    "stop",
    "avoid",
  ];

  return firstMatchingPhrase(
    normalized,
    patterns,
  );
}

/* =========================================================
 * CURIOSITY
 * ======================================================= */

function detectCuriosity(
  text: string,
): boolean {
  const normalized =
    normalizeLower(text);

  return containsAny(
    normalized,
    [
      "discover",
      "see why",
      "find out",
      "you won't believe",
      "you won't",
      "what happens",
      "secret",
      "why",
      "the reason",
      "revealed",
    ],
  );
}

/* =========================================================
 * LIFESTYLE
 * ======================================================= */

function detectLifestyle(
  text: string,
): boolean {
  const normalized =
    normalizeLower(text);

  return containsAny(
    normalized,
    [
      "your everyday",
      "for every day",
      "for your lifestyle",
      "on the go",
      "weekend",
      "workout",
      "training",
      "travel",
      "adventure",
      "make a statement",
      "complete the look",
      "your style",
      "any time",
      "anywhere",
    ],
  );
}

/* =========================================================
 * SEASONAL
 * ======================================================= */

function detectSeasonal(
  text: string,
): boolean {
  const normalized =
    normalizeLower(text);

  return containsAny(
    normalized,
    [
      "summer",
      "winter",
      "spring",
      "fall",
      "holiday",
      "christmas",
      "new year",
      "festive",
      "back to school",
      "season",
      "black friday",
      "cyber monday",
    ],
  );
}

/* =========================================================
 * BRAND SIGNAL
 * ======================================================= */

function detectBrandSignal(
  ad: CompetitorAd,
  text: string,
): boolean {
  const advertiser =
    normalizeLower(
      ad.advertiserName,
    );

  const normalized =
    normalizeLower(text);

  if (!advertiser) {
    return false;
  }

  return normalized.includes(
    advertiser,
  );
}

/* =========================================================
 * HOOK CLASSIFICATION
 * ======================================================= */

function detectHook(
  ad: CompetitorAd,
  text: string,
): MarketingHook {
  if (
    detectOffer(
      ad,
      text,
    )
  ) {
    return "offer";
  }

  if (
    detectObjection(text)
  ) {
    return "problem";
  }

  if (
    detectBenefit(text)
  ) {
    return "benefit";
  }

  if (
    detectProof(text)
  ) {
    return "social_proof";
  }

  if (
    detectUrgency(text)
  ) {
    return "urgency";
  }

  if (
    detectCuriosity(text)
  ) {
    return "curiosity";
  }

  if (
    ad.productName ||
    ad.headline
  ) {
    return "product";
  }

  if (
    ad.primaryText
  ) {
    return "statement";
  }

  return "unknown";
}

/* =========================================================
 * ANGLE CLASSIFICATION
 * ======================================================= */

function detectAngle(
  ad: CompetitorAd,
  text: string,
): MarketingAngle {
  if (
    detectOffer(
      ad,
      text,
    )
  ) {
    return "offer";
  }

  if (
    detectObjection(text)
  ) {
    return "problem_solution";
  }

  if (
    detectProof(text)
  ) {
    return "social_proof";
  }

  if (
    detectUrgency(text)
  ) {
    return "urgency";
  }

  if (
    detectCuriosity(text)
  ) {
    return "curiosity";
  }

  if (
    detectSeasonal(text)
  ) {
    return "seasonal";
  }

  if (
    detectLifestyle(text)
  ) {
    return "lifestyle";
  }

  if (
    detectBenefit(text)
  ) {
    return "benefit";
  }

  if (
    detectBrandSignal(
      ad,
      text,
    )
  ) {
    return "brand";
  }

  if (
    ad.productName ||
    ad.headline
  ) {
    return "product";
  }

  return "unknown";
}

/* =========================================================
 * PROMISE
 * ======================================================= */

function extractPromise(
  ad: CompetitorAd,
  text: string,
): string | null {
  const benefit =
    detectBenefit(text);

  if (benefit) {
    return benefit;
  }

  const headline =
    nullableText(
      ad.headline,
    );

  if (headline) {
    return headline;
  }

  return nullableText(
    ad.productName,
  );
}

/* =========================================================
 * MARKETING THEMES
 * ======================================================= */

function detectMarketingThemes(
  ad: CompetitorAd,
  text: string,
): string[] {
  const themes =
    new Set<string>();

  if (
    detectOffer(
      ad,
      text,
    )
  ) {
    themes.add("offer");
  }

  if (
    detectBenefit(text)
  ) {
    themes.add("benefit");
  }

  if (
    detectObjection(text)
  ) {
    themes.add("problem-solution");
  }

  if (
    detectProof(text)
  ) {
    themes.add("social-proof");
  }

  if (
    detectUrgency(text)
  ) {
    themes.add("urgency");
  }

  if (
    detectCuriosity(text)
  ) {
    themes.add("curiosity");
  }

  if (
    detectLifestyle(text)
  ) {
    themes.add("lifestyle");
  }

  if (
    detectSeasonal(text)
  ) {
    themes.add("seasonal");
  }

  if (
    detectBrandSignal(
      ad,
      text,
    )
  ) {
    themes.add("brand");
  }

  if (
    ad.productName ||
    ad.headline
  ) {
    themes.add("product");
  }

  return [
    ...themes,
  ];
}

/* =========================================================
 * CONFIDENCE
 * ======================================================= */

function calculateConfidence(
  ad: CompetitorAd,
  text: string,
  hook: MarketingHook,
  angle: MarketingAngle,
): number {
  let score = 25;

  if (
    ad.primaryText
  ) {
    score += 20;
  }

  if (
    ad.headline
  ) {
    score += 10;
  }

  if (
    ad.productName
  ) {
    score += 10;
  }

  if (
    ad.offer
  ) {
    score += 10;
  }

  if (
    hook !== "unknown"
  ) {
    score += 10;
  }

  if (
    angle !== "unknown"
  ) {
    score += 10;
  }

  if (
    text.length >= 80
  ) {
    score += 5;
  }

  return Math.min(
    100,
    score,
  );
}

/* =========================================================
 * ANALYZE ONE AD
 * ======================================================= */

export function analyzeMarketingAd(
  ad: CompetitorAd,
): MarketingAnalysis {
  const primaryText =
    nullableText(
      ad.primaryText,
    );

  const headline =
    nullableText(
      ad.headline,
    );

  const description =
    nullableText(
      ad.description,
    );

  const offer =
    detectOffer(
      ad,
      buildSourceText(ad),
    );

  const callToAction =
    nullableText(
      ad.callToAction,
    );

  const sourceText =
    buildSourceText(ad);

  const hook =
    detectHook(
      ad,
      sourceText,
    );

  const angle =
    detectAngle(
      ad,
      sourceText,
    );

  const promise =
    extractPromise(
      ad,
      sourceText,
    );

  const benefit =
    detectBenefit(
      sourceText,
    );

  const objection =
    detectObjection(
      sourceText,
    );

  const proof =
    detectProof(
      sourceText,
    );

  const urgency =
    detectUrgency(
      sourceText,
    );

  const marketingThemes =
    detectMarketingThemes(
      ad,
      sourceText,
    );

  const evidence: string[] =
    [];

  if (primaryText) {
    evidence.push(
      "Primary ad copy available",
    );
  }

  if (headline) {
    evidence.push(
      "Headline available",
    );
  }

  if (ad.productName) {
    evidence.push(
      "Product identified",
    );
  }

  if (offer) {
    evidence.push(
      `Offer detected: ${offer}`,
    );
  }

  if (benefit) {
    evidence.push(
      `Benefit detected: ${benefit}`,
    );
  }

  if (objection) {
    evidence.push(
      `Problem/objection detected: ${objection}`,
    );
  }

  if (proof) {
    evidence.push(
      `Proof detected: ${proof}`,
    );
  }

  if (urgency) {
    evidence.push(
      `Urgency detected: ${urgency}`,
    );
  }

  if (
    marketingThemes.length >
    0
  ) {
    evidence.push(
      `Themes: ${marketingThemes.join(", ")}`,
    );
  }

  return {
    adId: ad.id,

    primaryText,

    headline,

    description,

    offer,

    callToAction,

    angle,

    hook,

    promise,

    benefit,

    objection,

    proof,

    urgency,

    marketingThemes,

    confidence:
      calculateConfidence(
        ad,
        sourceText,
        hook,
        angle,
      ),

    evidence,
  };
}

/* =========================================================
 * BATCH ANALYSIS
 * ======================================================= */

export function analyzeMarketingAds(
  ads: CompetitorAd[],
): MarketingAnalysis[] {
  return ads.map(
    analyzeMarketingAd,
  );
}

/* =========================================================
 * COUNT HELPERS
 * ======================================================= */

function createAngleCounts(): Record<
  MarketingAngle,
  number
> {
  return {
    product: 0,
    benefit: 0,
    offer: 0,
    problem_solution: 0,
    social_proof: 0,
    urgency: 0,
    curiosity: 0,
    lifestyle: 0,
    seasonal: 0,
    brand: 0,
    unknown: 0,
  };
}

function createHookCounts(): Record<
  MarketingHook,
  number
> {
  return {
    offer: 0,
    problem: 0,
    benefit: 0,
    curiosity: 0,
    social_proof: 0,
    urgency: 0,
    product: 0,
    statement: 0,
    unknown: 0,
  };
}

/* =========================================================
 * SUMMARY
 * ======================================================= */

export function summarizeMarketingAnalysis(
  ads: CompetitorAd[],
): MarketingAnalysisSummary {
  const analyses =
    analyzeMarketingAds(
      ads,
    );

  const angleCounts =
    createAngleCounts();

  const hookCounts =
    createHookCounts();

  for (
    const analysis of analyses
  ) {
    angleCounts[
      analysis.angle
    ] += 1;

    hookCounts[
      analysis.hook
    ] += 1;
  }

  let topAngle:
    MarketingAngle =
    "unknown";

  let topAngleCount =
    0;

  for (
    const [
      angle,
      count,
    ] of Object.entries(
      angleCounts,
    ) as Array<
      [
        MarketingAngle,
        number,
      ]
    >
  ) {
    if (
      count >
      topAngleCount
    ) {
      topAngleCount =
        count;

      topAngle =
        angle;
    }
  }

  let topHook:
    MarketingHook =
    "unknown";

  let topHookCount =
    0;

  for (
    const [
      hook,
      count,
    ] of Object.entries(
      hookCounts,
    ) as Array<
      [
        MarketingHook,
        number,
      ]
    >
  ) {
    if (
      count >
      topHookCount
    ) {
      topHookCount =
        count;

      topHook =
        hook;
    }
  }

  const totalConfidence =
    analyses.reduce(
      (
        total,
        analysis,
      ) =>
        total +
        analysis.confidence,
      0,
    );

  return {
    totalAds:
      ads.length,

    analyzedAds:
      analyses.length,

    averageConfidence:
      analyses.length > 0
        ? Math.round(
            totalConfidence /
              analyses.length,
          )
        : 0,

    angleCounts,

    hookCounts,

    topAngle,

    topHook,

    offerCount:
      analyses.filter(
        (analysis) =>
          Boolean(
            analysis.offer,
          ),
      ).length,

    urgencyCount:
      analyses.filter(
        (analysis) =>
          Boolean(
            analysis.urgency,
          ),
      ).length,

    proofCount:
      analyses.filter(
        (analysis) =>
          Boolean(
            analysis.proof,
          ),
      ).length,

    benefitCount:
      analyses.filter(
        (analysis) =>
          Boolean(
            analysis.benefit,
          ),
      ).length,

    objectionCount:
      analyses.filter(
        (analysis) =>
          Boolean(
            analysis.objection,
          ),
      ).length,

    analyses,
  };
}

/* =========================================================
 * FILTERS
 * ======================================================= */

export function filterAdsByAngle(
  ads: CompetitorAd[],
  angle: MarketingAngle,
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeMarketingAd(ad)
        .angle === angle,
  );
}

export function filterAdsByHook(
  ads: CompetitorAd[],
  hook: MarketingHook,
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeMarketingAd(ad)
        .hook === hook,
  );
}

export function filterAdsWithOffers(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      Boolean(
        analyzeMarketingAd(
          ad,
        ).offer,
      ),
  );
}

export function filterAdsWithUrgency(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      Boolean(
        analyzeMarketingAd(
          ad,
        ).urgency,
      ),
  );
}

export function filterAdsWithSocialProof(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      Boolean(
        analyzeMarketingAd(
          ad,
        ).proof,
      ),
  );
}

/* =========================================================
 * RANKING
 * ======================================================= */

export function rankAdsByMarketingStrength(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return [...ads].sort(
    (a, b) => {
      const aAnalysis =
        analyzeMarketingAd(a);

      const bAnalysis =
        analyzeMarketingAd(b);

      const aSignals =
        aAnalysis.marketingThemes
          .length;

      const bSignals =
        bAnalysis.marketingThemes
          .length;

      if (
        bSignals !==
        aSignals
      ) {
        return (
          bSignals -
          aSignals
        );
      }

      if (
        bAnalysis.confidence !==
        aAnalysis.confidence
      ) {
        return (
          bAnalysis.confidence -
          aAnalysis.confidence
        );
      }

      return (
        (b.engagementPotentialScore ??
          0) -
        (a.engagementPotentialScore ??
          0)
      );
    },
  );
}

/* =========================================================
 * DEFAULT
 * ======================================================= */

export default analyzeMarketingAd;