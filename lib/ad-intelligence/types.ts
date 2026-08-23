export type AdPlatform =
  | "meta"
  | "instagram"
  | "google"
  | "youtube"
  | "tiktok"
  | "linkedin"
  | "amazon"
  | "bing"
  | "shopify";

export type AdCreativeType =
  | "image"
  | "video"
  | "carousel"
  | "text"
  | "unknown";

export type TranscriptStatus =
  | "available"
  | "unavailable"
  | "not_video"
  | "pending"
  | "failed";

export type MetricSource =
  | "available"
  | "estimated"
  | "derived"
  | "unavailable";

export type MetricSources = {
  creativeScore: MetricSource;
  longevityScore: MetricSource;
  relevanceScore: MetricSource;
  engagementPotentialScore: MetricSource;

  reach: MetricSource;
  clicks: MetricSource;
  ctr: MetricSource;
  impressions: MetricSource;
};

export type AdIntelligence = {
  rankingReasons: string[];
  badges: string[];
};

export type CompetitorAd = {
  id: string;

  platform: AdPlatform;

  advertiserName: string;

  advertiserId?: string | null;

  creatorName?: string | null;

 partnershipType?:
  | "direct"
  | "creator"
  | "paid_partnership"
  | "collaboration"
  | "unknown";

  country?: string | null;

  creativeType?: AdCreativeType;

  imageUrl?: string | null;

  videoUrl?: string | null;

  thumbnailUrl?: string | null;

  videoDurationSeconds?: number | null;

  primaryText?: string | null;

  headline?: string | null;

  description?: string | null;

  callToAction?: string | null;

  firstSeen?: string | null;

  lastSeen?: string | null;

  isActive?: boolean | null;

  publisherPlatforms?: string[];

  landingPage?: string | null;

  sourceUrl?: string | null;

  productName?: string | null;

  productPrice?: number | null;

  maxPrice?: number | null;

  currency?: string | null;

  offer?: string | null;

  runningDays?: number | null;

  creativeScore?: number | null;

  impressions?: number | null;

  impressionsMin?: number | null;

  impressionsMax?: number | null;

  reach?: number | null;

  reachMin?: number | null;

  reachMax?: number | null;

  clicks?: number | null;

  ctr?: number | null;

  transcript?: string | null;

  transcriptStatus?: TranscriptStatus;

  longevityScore?: number;

  relevanceScore?: number;

  engagementPotentialScore?: number;

  metricSources?: MetricSources;

  intelligence?: AdIntelligence;

  metadata?: Record<string, unknown>;
};

export type CompetitorProduct = {
  id: string;

  platform: "shopify" | "amazon";

  title: string;

  advertiserName?: string | null;

  vendor?: string | null;

  productType?: string | null;

  price?: number | null;

  maxPrice?: number | null;

  currency?: string | null;

  productUrl?: string | null;

  sourceUrl?: string | null;

  metadata?: Record<string, unknown>;
};