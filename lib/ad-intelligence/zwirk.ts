export type ZwirkAdSpyAd = {
  id: string;
  advertiserName?: string | null;
  creatorName?: string | null;
  partnershipType?: "direct" | "creator" | "unknown";
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  callToAction?: string | null;

  firstSeen?: string | null;
  lastSeen?: string | null;
  isActive?: boolean | null;

  publisherPlatforms?: string[];

  productName?: string | null;
  productPrice?: number | null;
  currency?: string | null;
  offer?: string | null;

  creativeType?:
    | "image"
    | "video"
    | "carousel"
    | "unknown";

  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;

  landingPage?: string | null;
  sourceUrl?: string | null;

  runningDays?: number | null;

  creativeScore?: number | null;
  longevityScore?: number | null;
  relevanceScore?: number | null;
  engagementPotentialScore?: number | null;
};

export type ZwirkAdSpySummary = {
  totalAdsFound?: number;
  activeAds?: number;
  inactiveAds?: number;
  videoAds?: number;
  imageAds?: number;
  carouselAds?: number;
  unknownCreativeAds?: number;

  longestRunningAd?: ZwirkAdSpyAd | null;
  mostClickWorthyAd?: ZwirkAdSpyAd | null;
  highestCreativeScoreAd?: ZwirkAdSpyAd | null;

  mostAdvertisedProduct?: {
    productName: string | null;
    adCount: number;
  } | null;

  reach?: {
    status: string;
    reason: string;
  };

  clicks?: {
    status: string;
    reason: string;
  };

  ctr?: {
    status: string;
    reason: string;
  };

  impressions?: {
    status: string;
    reason: string;
  };
};

export type ZwirkAdSpySnapshot = {
  version: 1;
  query: string;
  country: string;
  platform: "meta";
  fetchedAt: string;

  total: number;

  summary: ZwirkAdSpySummary | null;

  ads: ZwirkAdSpyAd[];
};

export const ZWIRK_ADSPY_STORAGE_KEY =
  "zwirkAdSpyIntelligence";

export function saveZwirkAdSpySnapshot(
  snapshot: ZwirkAdSpySnapshot
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(
      ZWIRK_ADSPY_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch (error) {
    console.warn(
      "[AdSpy] Unable to save ZWIRK snapshot:",
      error
    );
  }
}

export function loadZwirkAdSpySnapshot():
  | ZwirkAdSpySnapshot
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(
      ZWIRK_ADSPY_STORAGE_KEY
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ZwirkAdSpySnapshot;

    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.ads)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearZwirkAdSpySnapshot(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(
    ZWIRK_ADSPY_STORAGE_KEY
  );
}

/**
 * Turns the full AdSpy dataset into a reasoning-friendly
 * text block for Gemini.
 *
 * We intentionally keep the substantive business fields
 * but omit giant media URLs from the LLM prompt.
 */
export function formatAdSpyForZwirk(
  snapshot: ZwirkAdSpySnapshot
): string {
  const summary = snapshot.summary;

  const lines: string[] = [
    `AdSpy query: ${snapshot.query}`,
    `Country: ${snapshot.country}`,
    `Platform: ${snapshot.platform}`,
    `Fetched: ${snapshot.fetchedAt}`,
    `Total matching ads: ${snapshot.total}`,
    "",
  ];

  if (summary) {
    lines.push(
      "ADSPY SUMMARY:",
      `Active ads: ${summary.activeAds ?? "n/a"}`,
      `Inactive ads: ${summary.inactiveAds ?? "n/a"}`,
      `Video ads: ${summary.videoAds ?? "n/a"}`,
      `Image ads: ${summary.imageAds ?? "n/a"}`,
      `Carousel ads: ${summary.carouselAds ?? "n/a"}`,
      `Unknown creative ads: ${
        summary.unknownCreativeAds ?? "n/a"
      }`,
      `Most advertised product: ${
        summary.mostAdvertisedProduct?.productName ??
        "n/a"
      }`,
      `Most advertised product count: ${
        summary.mostAdvertisedProduct?.adCount ??
        "n/a"
      }`,
      ""
    );

    if (summary.longestRunningAd) {
      lines.push(
        "LONGEST RUNNING AD:",
        formatAd(summary.longestRunningAd),
        ""
      );
    }

    if (summary.mostClickWorthyAd) {
      lines.push(
        "MOST CLICK-WORTHY AD:",
        formatAd(summary.mostClickWorthyAd),
        ""
      );
    }

    if (summary.highestCreativeScoreAd) {
      lines.push(
        "HIGHEST CREATIVE SCORE AD:",
        formatAd(summary.highestCreativeScoreAd),
        ""
      );
    }
  }

  lines.push("ALL MATCHING ADSPY ADS:");

  snapshot.ads.forEach((ad, index) => {
    lines.push(
      `--- AD ${index + 1} ---`,
      formatAd(ad)
    );
  });

  return lines.join("\n");
}

function formatAd(
  ad: ZwirkAdSpyAd
): string {
  const lines = [
    `ID: ${ad.id}`,
    `Advertiser: ${
      ad.advertiserName ?? "n/a"
    }`,
    `Creator: ${
      ad.creatorName ?? "n/a"
    }`,
    `Partnership: ${
      ad.partnershipType ?? "n/a"
    }`,
    `Product: ${
      ad.productName ?? "n/a"
    }`,
    `Product price: ${
      ad.productPrice ?? "n/a"
    } ${ad.currency ?? ""}`.trim(),
    `Offer: ${
      ad.offer ?? "n/a"
    }`,
    `Creative type: ${
      ad.creativeType ?? "n/a"
    }`,
    `CTA: ${
      ad.callToAction ?? "n/a"
    }`,
    `Active: ${
      ad.isActive ?? "n/a"
    }`,
    `Running days: ${
      ad.runningDays ?? "n/a"
    }`,
    `Creative score: ${
      ad.creativeScore ?? "n/a"
    }/100`,
    `Longevity score: ${
      ad.longevityScore ?? "n/a"
    }/100`,
    `Relevance score: ${
      ad.relevanceScore ?? "n/a"
    }/100`,
    `Engagement potential: ${
      ad.engagementPotentialScore ?? "n/a"
    }/100`,
    `First seen: ${
      ad.firstSeen ?? "n/a"
    }`,
    `Last seen: ${
      ad.lastSeen ?? "n/a"
    }`,
    `Platforms: ${
      ad.publisherPlatforms?.join(", ") ??
      "n/a"
    }`,
    `Headline: ${
      ad.headline ?? "n/a"
    }`,
    `Description: ${
      ad.description ?? "n/a"
    }`,
    `Primary text: ${
      ad.primaryText ?? "n/a"
    }`,
  ];

  return lines.join("\n");
}