import type { AdProvider, AdSearchInput, ProviderResult } from "../provider";
import type { CompetitorAd } from "../types";

const GOOGLE_TRANSPARENCY_URL = "https://adstransparency.google.com/";

function buildGoogleTransparencyUrl(query: string, region: string): string {
  const params = new URLSearchParams({ region, search: query });
  return `${GOOGLE_TRANSPARENCY_URL}?${params.toString()}`;
}

/**
 * Google has a public Ads Transparency Center, but does not expose a normal
 * commercial search API. This provider deliberately returns a source record
 * instead of pretending that unavailable creative-level data exists.
 *
 * A licensed data partner or an approved Google integration can replace this
 * provider later without changing AdSpy's API or UI contract.
 */
export const googleProvider: AdProvider = {
  platform: "google",
  async search(input: AdSearchInput): Promise<ProviderResult> {
    const query = input.query.trim();
    const country = (input.country || "IN").toUpperCase();

    return {
      ads: [
        {
          id: `google-transparency-${encodeURIComponent(query)}-${country}`,
          platform: "google",
          advertiserName: query,
          country,
          creativeType: "unknown",
          primaryText: "Open this advertiser in Google Ads Transparency Center to review Google and YouTube creative records.",
          headline: `${query} on Google Ads Transparency Center`,
          isActive: null,
          sourceUrl: buildGoogleTransparencyUrl(query, country),
          metricSources: {
            creativeScore: "unavailable",
            longevityScore: "unavailable",
            relevanceScore: "unavailable",
            engagementPotentialScore: "unavailable",
            reach: "unavailable",
            clicks: "unavailable",
            ctr: "unavailable",
            impressions: "unavailable"
          },
          metadata: {
            provider: "google-ads-transparency-center",
            availability: "public-ui-only",
            note: "Google creative-level data is not currently fetched server-side."
          }
        }
      ]
    };
  }
};
