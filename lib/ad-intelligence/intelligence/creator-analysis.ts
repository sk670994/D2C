import type {
  CompetitorAd,
} from "../types";

/* =========================================================
 * CREATOR / COLLABORATION INTELLIGENCE
 *
 * Pure deterministic analysis of already-extracted ad data.
 *
 * IMPORTANT:
 * This module does not claim that a person is a creator
 * unless the upstream scraper provides a creator signal.
 *
 * It distinguishes:
 * - direct brand ads
 * - creator ads
 * - paid partnerships
 * - collaborations
 * - unknown
 *
 * It also looks at metadata collaboration signals,
 * publisher/placement hints, creator names and text.
 * ======================================================= */

export type CreatorSignal =
  | "creator"
  | "paid_partnership"
  | "collaboration"
  | "direct"
  | "unknown";

export type CreatorAdAnalysis = {
  adId: string;

  advertiserName: string;

  creatorName: string | null;

  signal: CreatorSignal;

  confidence: number;

  isCreatorAd: boolean;

  isPaidPartnership: boolean;

  isCollaboration: boolean;

  evidence: string[];
};

export type CreatorProfile = {
  creatorName: string;

  adCount: number;

  advertisers: string[];

  productCount: number;

  videoCount: number;

  imageCount: number;

  averageEngagementPotential: number;

  averageCreativeScore: number;

  partnershipTypes: CreatorSignal[];

  collaborationCount: number;

  paidPartnershipCount: number;

  creatorAdCount: number;
};

export type CreatorAnalysisSummary = {
  totalAds: number;

  creatorAds: number;

  creatorShare: number;

  paidPartnershipAds: number;

  collaborationAds: number;

  explicitCreatorNames: number;

  detectedCreators: number;

  creatorProfiles: CreatorProfile[];

  topCreator:
    | CreatorProfile
    | null;
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

/* =========================================================
 * METADATA
 * ======================================================= */

function getMetadata(
  ad: CompetitorAd,
): Record<
  string,
  unknown
> | null {
  if (
    !ad.metadata ||
    typeof ad.metadata !==
      "object"
  ) {
    return null;
  }

  return ad.metadata as Record<
    string,
    unknown
  >;
}

function getMetadataString(
  ad: CompetitorAd,
  key: string,
): string | null {
  const metadata =
    getMetadata(ad);

  const value =
    metadata?.[key];

  return typeof value ===
    "string"
    ? value
    : null;
}

function getMetadataBoolean(
  ad: CompetitorAd,
  key: string,
): boolean | null {
  const metadata =
    getMetadata(ad);

  const value =
    metadata?.[key];

  return typeof value ===
    "boolean"
    ? value
    : null;
}

/* =========================================================
 * CREATOR NAME
 * ======================================================= */

function getCreatorName(
  ad: CompetitorAd,
): string | null {
  const creator =
    ad.creatorName?.trim();

  if (!creator) {
    return null;
  }

  return creator;
}

/* =========================================================
 * EXPLICIT PARTNERSHIP TYPE
 * ======================================================= */

function normalizePartnershipType(
  value:
    | CompetitorAd["partnershipType"]
    | undefined,
): CreatorSignal {
  switch (value) {
    case "creator":
      return "creator";

    case "paid_partnership":
      return "paid_partnership";

    case "collaboration":
      return "collaboration";

    case "direct":
      return "direct";

    case "unknown":
      return "unknown";

    default:
      return "unknown";
  }
}

/* =========================================================
 * TEXTUAL COLLABORATION SIGNALS
 *
 * These are weak signals only.
 * They should NEVER override explicit scraper data.
 * ======================================================= */

function hasCollaborationTextSignal(
  ad: CompetitorAd,
): boolean {
  const combined = [
    ad.primaryText,
    ad.headline,
    ad.description,
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    )
    .join(" ");

  const text =
    normalizeText(
      combined,
    );

  if (!text) {
    return false;
  }

  const patterns = [
    "paid partnership",
    "paid partnership with",
    "in collaboration with",
    "collaboration with",
    "collab with",
    "partnered with",
    "ambassador",
    "creator",
    "influencer",
    "sponsored by",
    "sponcon",
    "#ad",
    "#sponsored",
    "brand partner",
  ];

  return patterns.some(
    (pattern) =>
      text.includes(pattern),
  );
}

/* =========================================================
 * MEDIA / CREATOR HEURISTICS
 *
 * These are deliberately weak.
 *
 * A video is NOT automatically a creator ad.
 * ======================================================= */

function isVideoAd(
  ad: CompetitorAd,
): boolean {
  return (
    ad.creativeType ===
      "video" ||
    Boolean(ad.videoUrl)
  );
}

function hasCreatorPresenceMetadata(
  ad: CompetitorAd,
): boolean {
  const metadata =
    getMetadata(ad);

  const keys = [
    "creatorPresent",
    "creatorDetected",
    "ugcDetected",
    "influencerDetected",
  ];

  return keys.some(
    (key) =>
      metadata?.[key] ===
      true,
  );
}

/* =========================================================
 * ANALYZE ONE AD
 * ======================================================= */

export function analyzeCreatorAd(
  ad: CompetitorAd,
): CreatorAdAnalysis {
  const creatorName =
    getCreatorName(ad);

  const explicitType =
    normalizePartnershipType(
      ad.partnershipType,
    );

  const metadataCollaboration =
    getMetadataBoolean(
      ad,
      "collaborationDetected",
    );

  const textCollaboration =
    hasCollaborationTextSignal(
      ad,
    );

  const creatorPresence =
    hasCreatorPresenceMetadata(
      ad,
    );

  const evidence: string[] =
    [];

  let signal: CreatorSignal =
    explicitType;

  let confidence = 0;

  /*
   * Explicit partnership values are strongest.
   */
  switch (
    explicitType
  ) {
    case "paid_partnership":
      confidence = 100;

      evidence.push(
        "Explicit paid partnership signal",
      );

      break;

    case "collaboration":
      confidence = 100;

      evidence.push(
        "Explicit collaboration signal",
      );

      break;

    case "creator":
      confidence = 100;

      evidence.push(
        "Explicit creator partnership signal",
      );

      break;

    case "direct":
      confidence = 95;

      evidence.push(
        "Explicit direct advertiser signal",
      );

      break;

    default:
      break;
  }

  /*
   * Explicit creator name is a strong independent signal.
   */
  if (creatorName) {
    evidence.push(
      "Creator name extracted",
    );

    if (
      signal === "unknown" ||
      signal === "direct"
    ) {
      signal = "creator";

      confidence = Math.max(
        confidence,
        95,
      );
    }
  }

  /*
   * Upstream metadata collaboration signal.
   */
  if (
    metadataCollaboration === true
  ) {
    evidence.push(
      "Metadata collaboration detected",
    );

    if (
      signal !==
        "paid_partnership"
    ) {
      signal =
        "collaboration";
    }

    confidence = Math.max(
      confidence,
      90,
    );
  }

  /*
   * Creator-presence metadata.
   */
  if (
    creatorPresence
  ) {
    evidence.push(
      "Creator/UGC presence metadata detected",
    );

    if (
      signal ===
        "unknown"
    ) {
      signal =
        "creator";
    }

    confidence = Math.max(
      confidence,
      80,
    );
  }

  /*
   * Textual collaboration language.
   */
  if (
    textCollaboration
  ) {
    evidence.push(
      "Collaboration/sponsorship language detected in ad copy",
    );

    if (
      signal ===
        "unknown"
    ) {
      signal =
        "collaboration";
    }

    confidence = Math.max(
      confidence,
      65,
    );
  }

  /*
   * A creator name remains the most useful
   * practical signal when Meta does not expose
   * an explicit partnership label.
   */
  if (
    !creatorName &&
    !metadataCollaboration &&
    !creatorPresence &&
    !textCollaboration
  ) {
    if (
      signal !==
      "direct"
    ) {
      signal =
        explicitType ===
          "unknown"
          ? "unknown"
          : explicitType;
    }

    if (
      confidence === 0
    ) {
      confidence = 10;
    }
  }

  /*
   * Never infer a creator simply because the ad
   * happens to be a video.
   */
  if (
    isVideoAd(ad) &&
    !creatorName &&
    !metadataCollaboration &&
    !creatorPresence
  ) {
    evidence.push(
      "Video detected, but no creator signal confirmed",
    );
  }

  const isPaidPartnership =
    signal ===
    "paid_partnership";

  const isCollaboration =
    signal ===
      "collaboration" ||
    isPaidPartnership;

  const isCreatorAd =
    signal ===
      "creator" ||
    isCollaboration ||
    Boolean(
      creatorName,
    );

  return {
    adId: ad.id,

    advertiserName:
      ad.advertiserName,

    creatorName,

    signal,

    confidence,

    isCreatorAd,

    isPaidPartnership,

    isCollaboration,

    evidence,
  };
}

/* =========================================================
 * BATCH ANALYSIS
 * ======================================================= */

export function analyzeCreatorAds(
  ads: CompetitorAd[],
): CreatorAdAnalysis[] {
  return ads.map(
    analyzeCreatorAd,
  );
}

/* =========================================================
 * UNIQUE STRING HELPER
 * ======================================================= */

function uniqueStrings(
  values: Array<
    string | null | undefined
  >,
): string[] {
  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (
    const value of values
  ) {
    const cleaned =
      value?.trim();

    if (!cleaned) {
      continue;
    }

    const key =
      normalizeText(
        cleaned,
      );

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
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
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
    values.length
  );
}

/* =========================================================
 * CREATOR PROFILES
 * ======================================================= */

export function buildCreatorProfiles(
  ads: CompetitorAd[],
): CreatorProfile[] {
  const analyses =
    analyzeCreatorAds(
      ads,
    );

  const creatorAds =
    ads.filter(
      (ad, index) =>
        Boolean(
          analyses[index]
            ?.creatorName,
        ),
    );

  const byCreator =
    new Map<
      string,
      CompetitorAd[]
    >();

  for (
    const ad of creatorAds
  ) {
    const creator =
      getCreatorName(ad);

    if (!creator) {
      continue;
    }

    const key =
      normalizeText(
        creator,
      );

    const existing =
      byCreator.get(key);

    if (existing) {
      existing.push(ad);
    } else {
      byCreator.set(
        key,
        [ad],
      );
    }
  }

  const profiles:
    CreatorProfile[] =
    [];

  for (
    const group of byCreator.values()
  ) {
    const creatorName =
      group[0]
        ?.creatorName
        ?.trim() ??
      "Unknown creator";

    const groupAnalyses =
      group.map(
        analyzeCreatorAd,
      );

    const advertisers =
      uniqueStrings(
        group.map(
          (ad) =>
            ad.advertiserName,
        ),
      );

    const productNames =
      uniqueStrings(
        group.map(
          (ad) =>
            ad.productName,
        ),
      );

    const partnershipTypes =
      uniqueStrings(
        groupAnalyses.map(
          (analysis) =>
            analysis.signal,
        ),
      ) as CreatorSignal[];

    const videoCount =
      group.filter(
        (ad) =>
          isVideoAd(ad),
      ).length;

    const imageCount =
      group.filter(
        (ad) =>
          ad.creativeType ===
          "image",
      ).length;

    const collaborationCount =
      groupAnalyses.filter(
        (analysis) =>
          analysis.isCollaboration,
      ).length;

    const paidPartnershipCount =
      groupAnalyses.filter(
        (analysis) =>
          analysis.isPaidPartnership,
      ).length;

    const creatorAdCount =
      groupAnalyses.filter(
        (analysis) =>
          analysis.isCreatorAd,
      ).length;

    profiles.push({
      creatorName,

      adCount:
        group.length,

      advertisers,

      productCount:
        productNames.length,

      videoCount,

      imageCount,

      averageEngagementPotential:
        Math.round(
          average(
            group.map(
              (ad) =>
                ad.engagementPotentialScore ??
                0,
            ),
          ),
        ),

      averageCreativeScore:
        Math.round(
          average(
            group.map(
              (ad) =>
                ad.creativeScore ??
                0,
            ),
          ),
        ),

      partnershipTypes,

      collaborationCount,

      paidPartnershipCount,

      creatorAdCount,
    });
  }

  return profiles.sort(
    (a, b) => {
      if (
        b.adCount !==
        a.adCount
      ) {
        return (
          b.adCount -
          a.adCount
        );
      }

      return (
        b.averageEngagementPotential -
        a.averageEngagementPotential
      );
    },
  );
}

/* =========================================================
 * SUMMARY
 * ======================================================= */

export function summarizeCreatorAnalysis(
  ads: CompetitorAd[],
): CreatorAnalysisSummary {
  if (
    ads.length === 0
  ) {
    return {
      totalAds: 0,

      creatorAds: 0,

      creatorShare: 0,

      paidPartnershipAds: 0,

      collaborationAds: 0,

      explicitCreatorNames: 0,

      detectedCreators: 0,

      creatorProfiles: [],

      topCreator: null,
    };
  }

  const analyses =
    analyzeCreatorAds(
      ads,
    );

  const creatorAds =
    analyses.filter(
      (analysis) =>
        analysis.isCreatorAd,
    ).length;

  const paidPartnershipAds =
    analyses.filter(
      (analysis) =>
        analysis.isPaidPartnership,
    ).length;

  const collaborationAds =
    analyses.filter(
      (analysis) =>
        analysis.isCollaboration,
    ).length;

  const explicitCreatorNames =
    analyses.filter(
      (analysis) =>
        Boolean(
          analysis.creatorName,
        ),
    ).length;

  const creatorProfiles =
    buildCreatorProfiles(
      ads,
    );

  return {
    totalAds: ads.length,

    creatorAds,

    creatorShare:
      Math.round(
        (creatorAds /
          ads.length) *
          100,
      ),

    paidPartnershipAds,

    collaborationAds,

    explicitCreatorNames,

    detectedCreators:
      creatorProfiles.length,

    creatorProfiles,

    topCreator:
      creatorProfiles[0] ??
      null,
  };
}

/* =========================================================
 * CREATOR FILTER
 * ======================================================= */

export function filterCreatorAds(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeCreatorAd(ad)
        .isCreatorAd,
  );
}

/* =========================================================
 * COLLABORATION FILTER
 * ======================================================= */

export function filterCollaborationAds(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return ads.filter(
    (ad) =>
      analyzeCreatorAd(ad)
        .isCollaboration,
  );
}

/* =========================================================
 * CREATOR SHARE
 * ======================================================= */

export function calculateCreatorShare(
  ads: CompetitorAd[],
): number {
  if (
    ads.length === 0
  ) {
    return 0;
  }

  const creatorCount =
    filterCreatorAds(
      ads,
    ).length;

  return Math.round(
    (creatorCount /
      ads.length) *
      100,
  );
}

/* =========================================================
 * CREATOR SIGNAL LABEL
 * ======================================================= */

export function getCreatorSignalLabel(
  ad: CompetitorAd,
): string {
  const analysis =
    analyzeCreatorAd(ad);

  switch (
    analysis.signal
  ) {
    case "paid_partnership":
      return "Paid partnership";

    case "collaboration":
      return "Collaboration";

    case "creator":
      return "Creator";

    case "direct":
      return "Direct";

    default:
      return "Unknown";
  }
}

/* =========================================================
 * CREATOR RANKING
 * ======================================================= */

export function rankAdsByCreatorSignal(
  ads: CompetitorAd[],
): CompetitorAd[] {
  return [...ads].sort(
    (a, b) => {
      const aAnalysis =
        analyzeCreatorAd(a);

      const bAnalysis =
        analyzeCreatorAd(b);

      if (
        bAnalysis.confidence !==
        aAnalysis.confidence
      ) {
        return (
          bAnalysis.confidence -
          aAnalysis.confidence
        );
      }

      if (
        bAnalysis.isCreatorAd !==
        aAnalysis.isCreatorAd
      ) {
        return bAnalysis.isCreatorAd
          ? 1
          : -1;
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

export default analyzeCreatorAds;