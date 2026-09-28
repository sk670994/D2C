/**
 * Meta Ad Library node -> CompetitorAd. Shared by every Meta source (our
 * Playwright collector reading Meta's JSON, and SearchApi, which returns the
 * same node shape). Pure: no browser, no network, safe on Vercel.
 */
import type { AdSearchInput } from "../provider";
import type { AdCreativeType, CompetitorAd } from "../types";
import { normalizeLibraryNode } from "./library-json";
import { calculateRunningDays, extractOffer, parsePrice } from "./parser";
import { normalizeExtractedText, normalizeWhitespace, repairMojibake } from "./text";

const DEFAULT_COUNTRY = "IN";

function normalizedText(value: string | null | undefined): string {
  return (repairMojibake(normalizeExtractedText(value ?? "")) ?? "").trim();
}

/**
 * Builds a CompetitorAd from Meta's own JSON (see meta/library-json.ts).
 * Returns null when the ad belongs to a different advertiser than requested.
 */
export function libraryNodeToAd(
  node: Parameters<typeof normalizeLibraryNode>[0],
  input: AdSearchInput,
  sourceUrl: string,
  totalCount: number | null,
  extraMetadata: Record<string, unknown> = {},
): CompetitorAd | null {
  const n = normalizeLibraryNode(node);
  if (!n) return null;
  const requested = input.advertiserPageId?.trim() || null;

  // Identity boundary: when an exact Page ID was requested, never keep an ad
  // that Meta attributes to a different advertiser.
  if (requested && n.pageId && n.pageId !== requested) return null;
  const advertiserId = n.pageId ?? requested;
  const advertiserName = n.pageName;
  const creatorName = n.creatorName;

  const creativeType: AdCreativeType = n.format;
  const runningDays = calculateRunningDays(n.firstSeen, n.lastSeen);
  const copy = [n.primaryText, n.headline, n.description].filter(Boolean).join("\n");
  const lines = copy ? copy.split("\n") : [];
  const price = parsePrice(copy);
  const offer = extractOffer(n.primaryText, lines) || null;

  return {
    id: n.id,
    platform: "meta",
    advertiserName: normalizedText(advertiserName) || input.query.trim(),
    advertiserId,
    creatorName: creatorName ? normalizedText(creatorName) : null,
    partnershipType: creatorName ? "paid_partnership" : "direct",
    country: (input.country ?? DEFAULT_COUNTRY).toUpperCase(),
    creativeType,
    imageUrl: n.imageUrl,
    videoUrl: n.videoUrl,
    thumbnailUrl: n.thumbnailUrl,
    videoDurationSeconds: null,
    primaryText: n.primaryText ? normalizeWhitespace(normalizedText(n.primaryText)) : null,
    headline: n.headline ? normalizedText(n.headline) : null,
    description: n.description ? normalizedText(n.description) : null,
    callToAction: n.callToAction,
    firstSeen: n.firstSeen,
    lastSeen: n.lastSeen,
    isActive: n.isActive,
    publisherPlatforms: n.publisherPlatforms.length ? n.publisherPlatforms : ["Facebook", "Instagram"],
    landingPage: n.landingPage,
    sourceUrl,
    productName: n.headline ? normalizedText(n.headline) : null,
    productPrice: price,
    currency: price != null ? "INR" : null,
    offer,
    runningDays,
    transcript: null,
    transcriptStatus: creativeType === "video" ? "unavailable" : "not_video",
    metricSources: {
      creativeScore: "derived",
      longevityScore: "derived",
      relevanceScore: "derived",
      engagementPotentialScore: "unavailable",
      reach: "unavailable",
      clicks: "unavailable",
      ctr: "unavailable",
      impressions: "unavailable",
    },
    longevityScore: Math.min(100, runningDays > 0 ? 25 + Math.min(75, runningDays * 1.25) : 0),
    relevanceScore: 0,
    engagementPotentialScore: 0,
    intelligence: { rankingReasons: [], badges: [] },
    metadata: {
      extractionMethod: "meta-library-json-v1",
      providerSource: "meta_ad_library",
      collectedAt: new Date().toISOString(),
      searchMode: input.mode ?? "advertiser",
      collectionDepth: input.collectionDepth ?? "deep",
      identitySource: "meta_graphql",
      activeStatusSource: n.isActive != null ? "provider" : "heuristic",
      metaPageProfileUri: null,
      metaCollationId: n.collationId,
      metaCollationCount: n.collationCount,
      metaTotalCount: totalCount,
      metaDisplayFormat: n.displayFormat,
      metaCardCount: n.cardCount,
      ...extraMetadata,
    },
  };
}
