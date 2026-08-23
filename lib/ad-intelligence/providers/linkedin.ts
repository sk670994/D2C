import type { AdProvider, AdSearchInput, ProviderResult } from "../provider";

const LINKEDIN_AD_LIBRARY_URL = "https://www.linkedin.com/ad-library/home";

/**
 * LinkedIn exposes a public Ad Library and a separately-requested API.
 * Keep the source explicit until Zooptrack has approved API access, so the
 * user never mistakes a source hand-off for a scraped creative record.
 */
export const linkedInProvider: AdProvider = {
  platform: "linkedin",
  async search(input: AdSearchInput): Promise<ProviderResult> {
    const query = input.query.trim();
    const country = (input.country || "IN").toUpperCase();
    return {
      ads: [{
        id: `linkedin-ad-library-${encodeURIComponent(query)}-${country}`,
        platform: "linkedin",
        advertiserName: query,
        country,
        creativeType: "unknown",
        headline: `${query} in LinkedIn Ad Library`,
        primaryText: "Open LinkedIn Ad Library to search this advertiser or keyword, then filter by country and date range.",
        isActive: null,
        sourceUrl: LINKEDIN_AD_LIBRARY_URL,
        metricSources: {
          creativeScore: "unavailable", longevityScore: "unavailable", relevanceScore: "unavailable", engagementPotentialScore: "unavailable",
          reach: "unavailable", clicks: "unavailable", ctr: "unavailable", impressions: "unavailable"
        },
        metadata: {
          provider: "linkedin-ad-library",
          availability: "public-ui-and-approved-api",
          note: "Creative-level records require LinkedIn Ad Library API access or an approved provider."
        }
      }]
    };
  }
};
