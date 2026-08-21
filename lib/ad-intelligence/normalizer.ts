import type { CompetitorAd } from "./types";

export function getAdDeduplicationKey(
  ad: CompetitorAd
): string {
  return [
    ad.platform,
    ad.id,
  ]
    .filter(Boolean)
    .join(":");
}

export function deduplicateAds(
  ads: CompetitorAd[]
): CompetitorAd[] {
  const unique =
    new Map<
      string,
      CompetitorAd
    >();

  for (const ad of ads) {
    const key =
      getAdDeduplicationKey(ad);

    if (!unique.has(key)) {
      unique.set(key, ad);
    }
  }

  return [...unique.values()];
}

export function deriveInstagramPlacements(
  ads: CompetitorAd[]
): CompetitorAd[] {
  return ads
    .filter((ad) =>
      ad.publisherPlatforms?.some(
        (platform) =>
          platform.toLowerCase() ===
            "instagram" ||
          platform.toLowerCase() ===
            "instagram ads"
      )
    )
    .map((ad) => ({
      ...ad,

      id: `${ad.id}:instagram`,

      platform:
        "instagram" as const,

      metadata: {
        ...ad.metadata,

        sourcePlatform: "meta",
      },
    }));
}