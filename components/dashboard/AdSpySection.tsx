"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdSpyLoadingExperience from "@/components/dashboard/AdSpyLoadingExperience";

type AdSpyAd = {
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
  isActive?: boolean;
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

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
};

type AdSpyResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  ads?: AdSpyAd[];
  count?: number;
  pagination?: Pagination;
};

type CreativeFamily = {
  key: string;
  name: string;
  ads: AdSpyAd[];
  imageCount: number;
  videoCount: number;
  carouselCount: number;
  creatorCount: number;
  averageLongevity: number;
  averageCreative: number;
  averageEngagement: number;
  topOffer: string | null;
};

type HookPattern = {
  label: string;
  count: number;
  share: number;
};

type ZwirkAdSpySnapshot = {
  version: 1;
  source: "AdSpy";
  query: string;
  country: string;
  fetchedAt: string;

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  summary: {
    analyzedAds: number;
    totalAds: number;

    activeAds: number;
    inactiveAds: number;

    activeShare: number;

    videoAds: number;
    imageAds: number;
    carouselAds: number;
    unknownCreativeAds: number;

    videoShare: number;
    creatorAds: number;
    creatorShare: number;

    averageLongevity: number;
    averageCreativeScore: number;
    averageRelevanceScore: number;
    averageEngagementPotential: number;
  };

  creativeFamilies: Array<{
    name: string;
    variants: number;
    imageCount: number;
    videoCount: number;
    carouselCount: number;
    creatorCount: number;
    averageLongevity: number;
    averageCreative: number;
    averageEngagement: number;
    topOffer: string | null;
  }>;

  marketPatterns: {
    topOffers: Array<{
      offer: string;
      count: number;
    }>;
    topCreators: string[];
    hookPatterns: HookPattern[];
  };

  recommendedExperiments: string[];

  ads: AdSpyAd[];
};

export type AdSpySectionProps = {
  query: string;
  country: string;
  platform?: "meta" | "google" | "linkedin";
  onQueryChange: (query: string) => void;
  onCountryChange: (country: string) => void;
  onPlatformChange?: (platform: "meta" | "google" | "linkedin") => void;
  onResultCountChange?: (count: number) => void;
};

const ZWIRK_ADSPY_STORAGE_KEY =
  "zwirkAdSpySnapshot";

function firstUrl(
  value?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

function formatDate(
  value?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreLabel(
  score?: number | null
): string {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return "—";
  }

  return String(Math.round(value));
}

function scoreTone(
  score?: number | null
): "success" | "warning" | "secondary" {
  const value = Number(score ?? 0);

  if (value >= 80) {
    return "success";
  }

  if (value >= 60) {
    return "warning";
  }

  return "secondary";
}

function openExternalUrl(
  url: string
): void {
  window.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );
}

function looksLikeDateText(
  value?: string | null
): boolean {
  if (!value) {
    return false;
  }

  const text = value.trim();

  return (
    /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
      text
    ) ||
    /^\d{1,2}\s+[A-Za-z]+\s+[-–]\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(
      text
    ) ||
    /^\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
      text
    ) ||
    /^\d{1,2}\s+[^\d\s]+\s+[-–]\s+\d{1,2}\s+[^\d\s]+\s+\d{4}$/u.test(
      text
    ) ||
    /^started running on\s+/i.test(text) ||
    /.+\s+को\s+चलना\s+शुरू\s+हुआ$/iu.test(
      text
    )
  );
}

function normalizeWhitespace(
  value?: string | null
): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedKey(
  value?: string | null
): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ");
}

function safeAverage(
  values: Array<number | null | undefined>
): number {
  const valid = values
    .map((value) => Number(value))
    .filter((value) =>
      Number.isFinite(value)
    );

  if (valid.length === 0) {
    return 0;
  }

  return Math.round(
    valid.reduce(
      (sum, value) => sum + value,
      0
    ) / valid.length
  );
}

function isValidOfferValue(
  value?: string | null
): boolean {
  const text =
    normalizeWhitespace(
      value
    );

  if (!text) {
    return false;
  }

  /*
   * Validate every percentage offer
   * before allowing it into the UI.
   *
   * Valid:
   *   10% off
   *   25% discount
   *   100% off
   *
   * Invalid:
   *   315% off
   *   415% off
   */
  const percentageMatches =
    Array.from(
      text.matchAll(
        /\b(\d{1,3})\s*%\s*(?:off|discount)\b/gi
      )
    );

  for (
    const match of percentageMatches
  ) {
    const percentage =
      Number(
        match[1]
      );

    if (
      !Number.isFinite(
        percentage
      ) ||
      percentage <= 0 ||
      percentage > 100
    ) {
      return false;
    }
  }

  return true;
}

function getTopOffers(
  ads: AdSpyAd[]
): Array<{
  offer: string;
  count: number;
}> {
  const counts =
    new Map<
      string,
      number
    >();

  for (const ad of ads) {
    const offer =
      normalizeWhitespace(
        ad.offer
      );

    if (
      !offer ||
      !isValidOfferValue(
        offer
      )
    ) {
      continue;
    }

    counts.set(
      offer,
      (
        counts.get(
          offer
        ) ?? 0
      ) + 1
    );
  }

  return Array.from(
    counts.entries()
  )
    .map(
      ([offer, count]) => ({
        offer,
        count,
      })
    )
    .sort(
      (a, b) => {
        if (
          b.count !==
          a.count
        ) {
          return (
            b.count -
            a.count
          );
        }

        return a.offer.localeCompare(
          b.offer
        );
      }
    )
    .slice(
      0,
      5
    );
}

function getTopCreators(
  ads: AdSpyAd[]
): string[] {
  return Array.from(
    new Set(
      ads
        .filter(
          (ad) =>
            ad.partnershipType ===
              "creator" ||
            Boolean(
              ad.creatorName?.trim()
            )
        )
        .map((ad) =>
          normalizeWhitespace(
            ad.creatorName
          )
        )
        .filter(Boolean)
    )
  ).slice(0, 5);
}

function getAdTitle(
  ad: AdSpyAd
): string {
  const headline =
    normalizeWhitespace(ad.headline);

  const productName =
    normalizeWhitespace(
      ad.productName
    );

  const primaryText =
    normalizeWhitespace(
      ad.primaryText
    );

  const description =
    normalizeWhitespace(
      ad.description
    );

  if (
    headline &&
    !looksLikeDateText(headline)
  ) {
    return headline;
  }

  if (
    productName &&
    !looksLikeDateText(productName)
  ) {
    return productName;
  }

  if (
    primaryText &&
    !looksLikeDateText(primaryText)
  ) {
    return primaryText
      .slice(0, 100)
      .trim();
  }

  if (
    description &&
    !looksLikeDateText(description)
  ) {
    return description
      .slice(0, 100)
      .trim();
  }

  return "Untitled ad";
}

function getHookText(
  ad: AdSpyAd
): string {
  const headline =
    normalizeWhitespace(
      ad.headline
    );

  if (
    headline &&
    !looksLikeDateText(headline)
  ) {
    return headline;
  }

  const primaryText =
    normalizeWhitespace(
      ad.primaryText
    );

  if (primaryText) {
    return primaryText
      .slice(0, 140)
      .trim();
  }

  const description =
    normalizeWhitespace(
      ad.description
    );

  if (description) {
    return description
      .slice(0, 140)
      .trim();
  }

  return "";
}

function getHookPatterns(
  ads: AdSpyAd[]
): HookPattern[] {
  const rules: Array<{
    label: string;
    patterns: RegExp[];
  }> = [
    {
      label: "Offer / discount",
      patterns: [
        /\b\d{1,3}%\s*off\b/i,
        /\bflat\s+\d{1,3}%/i,
        /\bprice\s*drop\b/i,
        /\bdiscount\b/i,
        /\bsale\b/i,
        /\boffer\b/i,
      ],
    },
    {
      label: "Problem → solution",
      patterns: [
        /\b(hair fall|hairfall|dandruff|acne|blemish|pigmentation|dry skin|dark spot|bald|tanning|tan)\b/i,
        /\btired of\b/i,
        /\bstruggling with\b/i,
        /\bno more\b/i,
      ],
    },
    {
      label: "Benefit-led",
      patterns: [
        /\bglow\b/i,
        /\bstronger\b/i,
        /\bhealthy\b/i,
        /\bprotect\b/i,
        /\bcontrol\b/i,
        /\bcoverage\b/i,
        /\bnatural\b/i,
        /\bsoft\b/i,
        /\bradiant\b/i,
      ],
    },
    {
      label: "UGC / creator",
      patterns: [
        /\bcomment\b/i,
        /\bPOV\b/i,
        /\bmy go[- ]to\b/i,
        /\bi switched\b/i,
        /\bwhy i\b/i,
        /@[a-z0-9_.]+/i,
      ],
    },
    {
      label: "Challenge / social",
      patterns: [
        /\bchallenge\b/i,
        /#\w+/i,
        /\bproof\b/i,
        /\bviral\b/i,
      ],
    },
  ];

  const counts = new Map<
    string,
    number
  >();

  for (const ad of ads) {
    const text =
      `${getHookText(ad)} ${normalizeWhitespace(
        ad.primaryText
      )}`;

    for (const rule of rules) {
      if (
        rule.patterns.some(
          (pattern) =>
            pattern.test(text)
        )
      ) {
        counts.set(
          rule.label,
          (counts.get(
            rule.label
          ) ?? 0) + 1
        );
      }
    }
  }

  return Array.from(
    counts.entries()
  )
    .map(([label, count]) => ({
      label,
      count,
      share:
        ads.length > 0
          ? Math.round(
              (count / ads.length) *
                100
            )
          : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.label.localeCompare(
        b.label
      );
    })
    .slice(0, 5);
}

function isMetaPlaceholder(
  value?: string | null
): boolean {
  const text =
    normalizeWhitespace(
      value
    ).toLowerCase();

  if (!text) {
    return true;
  }

  return (
    text ===
      "this ad has multiple versions" ||
    text ===
      "this ad has multiple versions." ||
    text.includes(
      "this ad has multiple versions"
    ) ||
    text.includes(
      "more than one version"
    ) ||
    text.includes(
      "एक से अधिक वर्जन"
    ) ||
    text.includes(
      "एक से अधिक संस्करण"
    ) ||
    text.includes(
      "इस विज्ञापन के एक से अधिक वर्जन"
    ) ||
    text.includes(
      "इस विज्ञापन के एक से अधिक संस्करण"
    ) ||
    text.includes(
      "इस क्रिएटिव और टेक्स्ट का उपयोग करता है"
    )
  );
}

function familyNameForAd(
  ad: AdSpyAd
): string {
  const product =
    normalizeWhitespace(
      ad.productName
    );

  const headline =
    normalizeWhitespace(
      ad.headline
    );

  const primary =
    normalizeWhitespace(
      ad.primaryText
    );

  const creator =
    normalizeWhitespace(
      ad.creatorName
    );

  const offer =
    normalizeWhitespace(
      ad.offer
    );

  /*
   * 1. Prefer a real product name.
   *
   * Meta placeholder values are explicitly ignored.
   */
  if (
    product &&
    !looksLikeDateText(product) &&
    !isMetaPlaceholder(product)
  ) {
    return (
      product
        .replace(
          /\s*[-–|]\s*\d+(?:\.\d+)?\s*(?:ml|g|kg|gm|mg|oz|pcs?|units?|pack|packs)\b/gi,
          ""
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim()
        .slice(
          0,
          70
        ) ||
      product.slice(
        0,
        70
      )
    );
  }

  /*
   * 2. Prefer a real headline.
   */
  if (
    headline &&
    !looksLikeDateText(
      headline
    ) &&
    !isMetaPlaceholder(
      headline
    )
  ) {
    return headline.slice(
      0,
      70
    );
  }

  /*
   * 3. Placeholder title:
   *    derive the family name from primary copy.
   */
  if (primary) {
    const cleaned =
      primary
        .replace(
          /https?:\/\/\S+/gi,
          ""
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    const sentences =
      cleaned
        .split(
          /[.!?]\s+/
        )
        .map(
          (part) =>
            part.trim()
        )
        .filter(
          (part) =>
            part.length >= 4
        );

    const useful =
      sentences.find(
        (part) =>
          !/^(?:shop now|buy now|learn more|click here)$/i.test(
            part
          )
      );

    if (useful) {
      return useful.slice(
        0,
        70
      );
    }

    if (cleaned) {
      return cleaned.slice(
        0,
        70
      );
    }
  }

  /*
   * 4. Creator fallback.
   */
  if (creator) {
    return `Creator: ${creator}`.slice(
      0,
      70
    );
  }

  /*
   * 5. Offer fallback.
   */
  if (offer) {
    return `Offer-led: ${offer}`.slice(
      0,
      70
    );
  }

  return "Other creatives";
}

function buildCreativeFamilies(
  ads: AdSpyAd[]
): CreativeFamily[] {
  const grouped = new Map<
    string,
    AdSpyAd[]
  >();

  for (const ad of ads) {
    const name =
      familyNameForAd(ad);

    const key =
      normalizedKey(name);

    const current =
      grouped.get(key) ?? [];

    current.push(ad);

    grouped.set(key, current);
  }

  return Array.from(
    grouped.entries()
  )
    .map(
      ([key, familyAds]) => {
        const offers =
          getTopOffers(
            familyAds
          );

        return {
          key,
          name: familyNameForAd(
            familyAds[0]
          ),
          ads: familyAds,
          imageCount:
            familyAds.filter(
              (ad) =>
                ad.creativeType ===
                "image"
            ).length,
          videoCount:
            familyAds.filter(
              (ad) =>
                ad.creativeType ===
                "video"
            ).length,
          carouselCount:
            familyAds.filter(
              (ad) =>
                ad.creativeType ===
                "carousel"
            ).length,
          creatorCount:
            familyAds.filter(
              (ad) =>
                ad.partnershipType ===
                  "creator" ||
                Boolean(ad.creatorName)
            ).length,
          averageLongevity:
            safeAverage(
              familyAds.map(
                (ad) =>
                  ad.runningDays
              )
            ),
          averageCreative:
            safeAverage(
              familyAds.map(
                (ad) =>
                  ad.creativeScore
              )
            ),
          averageEngagement:
            safeAverage(
              familyAds.map(
                (ad) =>
                  ad.engagementPotentialScore
              )
            ),
          topOffer:
            offers[0]?.offer ??
            null,
        };
      }
    )
    .sort((a, b) => {
      if (
        b.ads.length !==
        a.ads.length
      ) {
        return (
          b.ads.length -
          a.ads.length
        );
      }

      if (
        b.averageEngagement !==
        a.averageEngagement
      ) {
        return (
          b.averageEngagement -
          a.averageEngagement
        );
      }

      return a.name.localeCompare(
        b.name
      );
    })
    .slice(0, 8);
}

function buildRecommendedExperiments(
  input: {
    videoShare: number;
    creatorAds: number;
    creatorShare: number;
    averageLongevity: number;
    topOffers: Array<{
      offer: string;
      count: number;
    }>;
    hookPatterns: HookPattern[];
  }
): string[] {
  const {
    videoShare,
    creatorAds,
    creatorShare,
    averageLongevity,
    topOffers,
    hookPatterns,
  } = input;

  const suggestions: string[] = [];

  if (videoShare >= 50) {
    suggestions.push(
      `Test short-form video: competitor video share is ${videoShare}%. Test product-demo, testimonial or UGC-style variants.`
    );
  } else {
    suggestions.push(
      `Strengthen static concepts: only ${videoShare}% of visible competitor ads use video, so static concepts remain a meaningful test area.`
    );
  }

  if (creatorAds > 0) {
    suggestions.push(
      `Test creator-led concepts: ${creatorAds} creator ads (${creatorShare}% of the visible set) were detected.`
    );
  } else {
    suggestions.push(
      "Test a creator variation because no explicit creator signal was detected in the visible competitor set."
    );
  }

  if (averageLongevity > 0) {
    suggestions.push(
      `Study long-running creatives: average observed longevity is ${averageLongevity} days. Reverse-engineer the hooks, product positioning and offers without copying them.`
    );
  }

  if (topOffers.length > 0) {
    suggestions.push(
      `Build offer-led variants around the most common detected offer: ${topOffers[0].offer}.`
    );
  }

  if (hookPatterns.length > 0) {
    suggestions.push(
      `Test the dominant hook pattern: ${hookPatterns[0].label} appears in ${hookPatterns[0].share}% of the visible ads.`
    );
  }

  return suggestions;
}

function saveZwirkAdSpySnapshot(
  snapshot: ZwirkAdSpySnapshot
): void {
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

function publishAdSpySnapshot(
  params: {
    query: string;
    country: string;
    ads: AdSpyAd[];
    pagination?: Pagination;
    creativeFamilies: CreativeFamily[];
    topOffers: Array<{
      offer: string;
      count: number;
    }>;
    topCreators: string[];
    hookPatterns: HookPattern[];
    recommendedExperiments: string[];
  }
): void {
  const {
    query,
    country,
    ads,
    pagination,
    creativeFamilies,
    topOffers,
    topCreators,
    hookPatterns,
    recommendedExperiments,
  } = params;

  const activeAds =
    ads.filter(
      (ad) => ad.isActive
    ).length;

  const inactiveAds =
    ads.filter(
      (ad) =>
        ad.isActive === false
    ).length;

  const videoAds =
    ads.filter(
      (ad) =>
        ad.creativeType === "video"
    ).length;

  const imageAds =
    ads.filter(
      (ad) =>
        ad.creativeType === "image"
    ).length;

  const carouselAds =
    ads.filter(
      (ad) =>
        ad.creativeType === "carousel"
    ).length;

  const unknownCreativeAds =
    ads.length -
    videoAds -
    imageAds -
    carouselAds;

  const creatorAds =
    ads.filter(
      (ad) =>
        ad.partnershipType ===
          "creator" ||
        Boolean(
          ad.creatorName
        )
    ).length;

  const snapshot: ZwirkAdSpySnapshot =
    {
      version: 1,
      source: "AdSpy",
      query,
      country,
      fetchedAt:
        new Date().toISOString(),

      pagination: {
        page:
          pagination?.page ?? 1,
        limit:
          pagination?.limit ??
          ads.length,
        total:
          pagination?.total ??
          ads.length,
        totalPages:
          pagination?.totalPages ??
          1,
      },

      summary: {
        analyzedAds:
          ads.length,
        totalAds:
          pagination?.total ??
          ads.length,

        activeAds,
        inactiveAds,

        activeShare:
          ads.length > 0
            ? Math.round(
                (activeAds /
                  ads.length) *
                  100
              )
            : 0,

        videoAds,
        imageAds,
        carouselAds,
        unknownCreativeAds,

        videoShare:
          ads.length > 0
            ? Math.round(
                (videoAds /
                  ads.length) *
                  100
              )
            : 0,

        creatorAds,

        creatorShare:
          ads.length > 0
            ? Math.round(
                (creatorAds /
                  ads.length) *
                  100
              )
            : 0,

        averageLongevity:
          safeAverage(
            ads.map(
              (ad) =>
                ad.runningDays
            )
          ),

        averageCreativeScore:
          safeAverage(
            ads.map(
              (ad) =>
                ad.creativeScore
            )
          ),

        averageRelevanceScore:
          safeAverage(
            ads.map(
              (ad) =>
                ad.relevanceScore
            )
          ),

        averageEngagementPotential:
          safeAverage(
            ads.map(
              (ad) =>
                ad.engagementPotentialScore
            )
          ),
      },

      creativeFamilies:
        creativeFamilies
          .slice(0, 8)
          .map(
            (family) => ({
              name:
                family.name,
              variants:
                family.ads.length,
              imageCount:
                family.imageCount,
              videoCount:
                family.videoCount,
              carouselCount:
                family.carouselCount,
              creatorCount:
                family.creatorCount,
              averageLongevity:
                family.averageLongevity,
              averageCreative:
                family.averageCreative,
              averageEngagement:
                family.averageEngagement,
              topOffer:
                family.topOffer,
            })
          ),

      marketPatterns: {
        topOffers,
        topCreators,
        hookPatterns,
      },

      recommendedExperiments,

      ads,
    };

  saveZwirkAdSpySnapshot(
    snapshot
  );
}

export function AdSpySection({
  query,
  country,
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [page, setPage] =
    useState(1);

  const limit = 20;

  const [ads, setAds] =
    useState<AdSpyAd[]>([]);

  const [pagination, setPagination] =
    useState<Pagination | undefined>(
      undefined
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function search(
    pageToLoad = 1
  ) {
    const trimmedQuery =
      query.trim();

    const normalizedCountry =
      country.trim().toUpperCase() ||
      "IN";

    if (!trimmedQuery) {
      setError(
        "Enter a brand or keyword."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params =
        new URLSearchParams({
          q: trimmedQuery,
          country:
            normalizedCountry,
          page: String(
            pageToLoad
          ),
          limit: String(limit),
          platform,
          mode: "advertiser",
        });

      const response =
        await fetch(
          `/api/ad-intelligence/search?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        ) ?? "";

      let data: AdSpyResponse;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          (await response.json()) as AdSpyResponse;
      } else {
        const text =
          await response.text();

        throw new Error(
          text
            .trimStart()
            .startsWith(
              "<!DOCTYPE"
            )
            ? "AdSpy API returned an HTML error page. Check the server logs."
            : text ||
                "AdSpy API returned an invalid response."
        );
      }

      if (
        !response.ok ||
        data.success === false
      ) {
        throw new Error(
          data.message ||
            data.error ||
            "AdSpy search failed."
        );
      }

      const nextAds =
        Array.isArray(data.ads)
          ? data.ads
          : [];

      setAds(nextAds);
      setPagination(
        data.pagination
      );

      const resolvedPage =
        data.pagination?.page ??
        pageToLoad;

      setPage(
        resolvedPage
      );

      const resolvedTotal =
        data.pagination?.total ??
        data.count ??
        nextAds.length;

      onResultCountChange?.(
        resolvedTotal
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to search AdSpy.";

      setAds([]);
      setPagination(
        undefined
      );
      setPage(1);
      setError(message);

      onResultCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    onQueryChange("");
    setAds([]);
    setPagination(
      undefined
    );
    setPage(1);
    setError("");

    try {
      sessionStorage.removeItem(
        ZWIRK_ADSPY_STORAGE_KEY
      );
    } catch {
      // Ignore storage errors.
    }

    onResultCountChange?.(0);
  }

  function goToPage(
    nextPage: number
  ) {
    if (nextPage < 1) {
      return;
    }

    if (
      pagination &&
      nextPage >
        pagination.totalPages
    ) {
      return;
    }

    void search(
      nextPage
    );
  }

  const totalResults =
    pagination?.total ??
    ads.length;

  const showingStart =
    pagination &&
    pagination.total > 0
      ? (pagination.page - 1) *
          pagination.limit +
        1
      : 0;

  const showingEnd =
    pagination
      ? Math.min(
          pagination.page *
            pagination.limit,
          pagination.total
        )
      : ads.length;

  const activeAds =
    ads.filter(
      (ad) => ad.isActive
    ).length;

  const inactiveAds =
    ads.filter(
      (ad) =>
        ad.isActive === false
    ).length;

  const videoAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "video"
    ).length;

  const imageAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "image"
    ).length;

  const carouselAds =
    ads.filter(
      (ad) =>
        ad.creativeType ===
        "carousel"
    ).length;

  const creatorAds =
    ads.filter(
      (ad) =>
        ad.partnershipType ===
          "creator" ||
        Boolean(
          ad.creatorName
        )
    ).length;

  const averageLongevity =
    safeAverage(
      ads.map(
        (ad) =>
          ad.runningDays
      )
    );

  const averageCreativeScore =
    safeAverage(
      ads.map(
        (ad) =>
          ad.creativeScore
      )
    );

  const averageRelevance =
    safeAverage(
      ads.map(
        (ad) =>
          ad.relevanceScore
      )
    );

  const averageEngagementPotential =
    safeAverage(
      ads.map(
        (ad) =>
          ad.engagementPotentialScore
      )
    );

  const topOffers =
    getTopOffers(ads);

  const topCreators =
    getTopCreators(ads);

  const hookPatterns =
    getHookPatterns(ads);

  const creativeFamilies =
    useMemo(
      () =>
        buildCreativeFamilies(
          ads
        ),
      [ads]
    );

  const videoShare =
    ads.length > 0
      ? Math.round(
          (videoAds /
            ads.length) *
            100
        )
      : 0;

  const creatorShare =
    ads.length > 0
      ? Math.round(
          (creatorAds /
            ads.length) *
            100
        )
      : 0;

  const activeShare =
    ads.length > 0
      ? Math.round(
          (activeAds /
            ads.length) *
            100
        )
      : 0;

  const recommendedExperiments =
    buildRecommendedExperiments(
      {
        videoShare,
        creatorAds,
        creatorShare,
        averageLongevity,
        topOffers,
        hookPatterns,
      }
    );

  /*
   * Publish the exact AdSpy intelligence already
   * present on this page to ZWIRK.
   *
   * IMPORTANT:
   * This does NOT trigger another Meta scrape.
   *
   * This belongs in an effect, not inside render.
   */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      ads.length === 0
    ) {
      return;
    }

    const snapshotQuery = query.trim();
    const snapshotCountry =
      country.trim().toUpperCase() || "IN";

    const currentSignature = JSON.stringify({
      query: snapshotQuery,
      country: snapshotCountry,
      page: pagination?.page ?? page,
      ids: ads.map((ad) => ad.id),
    });

    const lastSignature = sessionStorage.getItem(
      "zwirkAdSpySnapshotSignature"
    );

    if (lastSignature === currentSignature) {
      return;
    }

    try {
      sessionStorage.setItem(
        "zwirkAdSpySnapshotSignature",
        currentSignature
      );

      publishAdSpySnapshot({
        query: snapshotQuery,
        country: snapshotCountry,
        ads,
        pagination,
        creativeFamilies,
        topOffers,
        topCreators,
        hookPatterns,
        recommendedExperiments,
      });
    } catch (error) {
      console.warn(
        "[AdSpy] Unable to publish ZWIRK snapshot:",
        error
      );
    }
  }, [
    ads,
    query,
    country,
    page,
    pagination,
    creativeFamilies,
    topOffers,
    topCreators,
    hookPatterns,
    recommendedExperiments,
  ]);

  const familyStats =
    creativeFamilies.slice(
      0,
      4
    );

  return (
    <section className="adspy-section">
      <div
        className="section-head"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
              }}
            >
              AdSpy
            </h3>

            <Badge variant="secondary">
              {pagination
                ? `${totalResults.toLocaleString(
                    "en-IN"
                  )} ads found`
                : platform === "google" ? "Google Ads Transparency" : platform === "linkedin" ? "LinkedIn Ad Library" : "Meta Ad Library"}
            </Badge>
          </div>

          <p
            className="muted-text"
            style={{
              marginTop: 6,
              marginBottom: 0,
              maxWidth: 820,
            }}
          >
            Discover competitor
            creatives, offers,
            longevity signals and
            creative patterns from
            {platform === "google" ? " Google Ads Transparency Center." : platform === "linkedin" ? " LinkedIn Ad Library." : " the Meta Ad Library."}
          </p>
        </div>
      </div>

      <div
        className="surface adspy-search-panel"
        style={{
          padding: 16,
          borderRadius: 14,
          marginBottom: 20,
        }}
      >
        <div className="adspy-search-grid">
          <Label className="input-row adspy-platform-field">
            <span>Platform</span>
            <select
              value={platform}
              onChange={(event) =>
                onPlatformChange?.(
                  event.target.value as
                    | "meta"
                    | "google"
                    | "linkedin"
                )
              }
              aria-label="Advertising platform"
            >
              <option value="meta">
                Meta (Facebook + Instagram)
              </option>
              <option value="google">
                Google + YouTube
              </option>
              <option value="linkedin">
                LinkedIn
              </option>
            </select>
          </Label>

          <Label className="input-row adspy-query-field">
            <span>Brand or keyword</span>
            <Input
              type="text"
              placeholder="e.g. Mamaearth, Nike, skincare"
              value={query}
              onChange={(event) =>
                onQueryChange(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search(1);
                }
              }}
              aria-label="Brand or keyword"
            />
          </Label>

          <Label className="input-row adspy-country-field">
            <span>Country</span>
            <Input
              type="text"
              value={country}
              maxLength={2}
              placeholder="IN"
              onChange={(event) =>
                onCountryChange(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 2)
                )
              }
              aria-label="Country code"
            />
          </Label>

          <div className="adspy-action-row">
            <Button
              type="button"
              onClick={() => void search(1)}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search AdSpy"}
            </Button>

            {(query || ads.length > 0) && !loading ? (
              <Button
                type="button"
                variant="secondary"
                onClick={clearSearch}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {pagination ? (
          <div className="adspy-pagination-meta">
            <Badge variant="secondary">
              {totalResults.toLocaleString("en-IN")} total
            </Badge>
            <Badge variant="secondary">
              Page {pagination.page} / {pagination.totalPages}
            </Badge>
            <Badge variant="secondary">
              {country || "IN"}
            </Badge>
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          className="surface"
          style={{
            padding: 14,
            borderRadius: 12,
            marginBottom: 18,
          }}
        >
          <p
            className="error-text"
            style={{
              margin: 0,
            }}
          >
            {error}
          </p>
        </div>
      ) : null}

     {loading ? (
  <AdSpyLoadingExperience
    platform={platform}
  />
) : null}

      {!loading &&
      ads.length === 0 &&
      !error ? (
        <div
          className="surface"
          style={{
            padding: 34,
            borderRadius: 14,
            textAlign:
              "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              margin:
                "0 auto 14px",
              borderRadius: 14,
              display:
                "grid",
              placeItems:
                "center",
              background:
                "var(--muted, rgba(127,127,127,0.12))",
              fontSize: 24,
            }}
          >
            🔎
          </div>

          <h4
            style={{
              margin: 0,
            }}
          >
            Search competitor
            ads
          </h4>

          <p
            className="muted-text"
            style={{
              margin:
                "7px auto 0",
              maxWidth: 520,
            }}
          >
            Enter a brand or
            keyword to discover
            public {platform === "google" ? "Google and YouTube" : platform === "linkedin" ? "LinkedIn" : "Meta"}
            creatives, offers,
            formats and
            longevity signals.
          </p>
        </div>
      ) : null}

      {ads.length > 0 ? (
        <>
          <div
            className="surface"
            style={{
              padding: 18,
              borderRadius: 14,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "flex-start",
                justifyContent:
                  "space-between",
                gap: 12,
                flexWrap:
                  "wrap",
              }}
            >
              <div>
                <h4
                  style={{
                    margin: 0,
                  }}
                >
                  Competitive
                  intelligence
                </h4>

                <p
                  className="muted-text"
                  style={{
                    margin:
                      "5px 0 0",
                  }}
                >
                  Snapshot of the
                  current competitor
                  result set. Scores
                  marked as potential
                  are estimates, not
                  platform performance
                  data.
                </p>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: 7,
                  flexWrap:
                    "wrap",
                }}
              >
                <Badge variant="secondary">
                  {ads.length} ads
                  analyzed
                </Badge>

                <Badge variant="secondary">
                  {
                    totalResults
                  }{" "}
                  total ads
                </Badge>
              </div>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(4, minmax(0, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              {[
                [
                  "Active",
                  `${activeShare}%`,
                  `${activeAds} of ${ads.length}`,
                ],
                [
                  "Video share",
                  `${videoShare}%`,
                  `${videoAds} video ads`,
                ],
                [
                  "Creator share",
                  `${creatorShare}%`,
                  `${creatorAds} creator ads`,
                ],
                [
                  "Avg. longevity",
                  String(
                    averageLongevity
                  ),
                  "days",
                ],
              ].map(
                ([
                  label,
                  value,
                  detail,
                ]) => (
                  <div
                    className="surface"
                    key={label}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <div className="muted-text">
                      {label}
                    </div>

                    <strong
                      style={{
                        fontSize:
                          "1.35rem",
                      }}
                    >
                      {value}
                    </strong>

                    <div className="muted-text">
                      {detail}
                    </div>
                  </div>
                )
              )}
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              {[
                [
                  "Avg. creative",
                  `${averageCreativeScore}/100`,
                ],
                [
                  "Avg. relevance",
                  `${averageRelevance}/100`,
                ],
                [
                  "Engagement potential",
                  `${averageEngagementPotential}/100`,
                ],
              ].map(
                ([label, value]) => (
                  <div
                    className="surface"
                    key={label}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <div className="muted-text">
                      {label}
                    </div>

                    <strong>
                      {value}
                    </strong>
                  </div>
                )
              )}
            </div>
          </div>

          {creativeFamilies.length >
          0 ? (
            <div
              className="surface"
              style={{
                padding: 18,
                borderRadius: 14,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "flex-start",
                  justifyContent:
                    "space-between",
                  gap: 12,
                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <h4
                    style={{
                      margin: 0,
                    }}
                  >
                    Creative Families
                  </h4>

                  <p
                    className="muted-text"
                    style={{
                      margin:
                        "5px 0 0",
                      maxWidth: 760,
                    }}
                  >
                    Groups of related
                    competitor
                    creatives based on
                    product, message
                    and creative
                    patterns. These
                    are pattern
                    estimates, not
                    Meta labels.
                  </p>
                </div>

                <Badge variant="secondary">
                  {
                    creativeFamilies.length
                  }{" "}
                  families
                </Badge>
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                  marginTop: 15,
                }}
              >
                {familyStats.map(
                  (family) => (
                    <div
                      key={
                        family.key
                      }
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background:
                          "var(--muted, rgba(127,127,127,0.07))",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: 10,
                        }}
                      >
                        <strong>
                          {
                            family.name
                          }
                        </strong>

                        <Badge variant="secondary">
                          {
                            family
                              .ads
                              .length
                          }{" "}
                          variants
                        </Badge>
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          gap: 6,
                          flexWrap:
                            "wrap",
                          marginTop: 10,
                        }}
                      >
                        {family.imageCount >
                        0 ? (
                          <Badge variant="secondary">
                            {
                              family.imageCount
                            }{" "}
                            image
                            {family.imageCount >
                            1
                              ? "s"
                              : ""}
                          </Badge>
                        ) : null}

                        {family.videoCount >
                        0 ? (
                          <Badge variant="secondary">
                            {
                              family.videoCount
                            }{" "}
                            video
                            {family.videoCount >
                            1
                              ? "s"
                              : ""}
                          </Badge>
                        ) : null}

                        {family.carouselCount >
                        0 ? (
                          <Badge variant="secondary">
                            {
                              family.carouselCount
                            }{" "}
                            carousel
                            {family.carouselCount >
                            1
                              ? "s"
                              : ""}
                          </Badge>
                        ) : null}

                        {family.creatorCount >
                        0 ? (
                          <Badge variant="secondary">
                            {
                              family.creatorCount
                            }{" "}
                            creator
                            {family.creatorCount >
                            1
                              ? "s"
                              : ""}
                          </Badge>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(3, minmax(0, 1fr))",
                          gap: 8,
                          marginTop: 12,
                        }}
                      >
                        <div>
                          <div
                            className="muted-text"
                            style={{
                              fontSize:
                                "0.72rem",
                            }}
                          >
                            Avg
                            longevity
                          </div>

                          <strong>
                            {
                              family.averageLongevity
                            }{" "}
                            days
                          </strong>
                        </div>

                        <div>
                          <div
                            className="muted-text"
                            style={{
                              fontSize:
                                "0.72rem",
                            }}
                          >
                            Creative
                          </div>

                          <strong>
                            {
                              family.averageCreative
                            }
                            /100
                          </strong>
                        </div>

                        <div>
                          <div
                            className="muted-text"
                            style={{
                              fontSize:
                                "0.72rem",
                            }}
                          >
                            Engagement
                          </div>

                          <strong>
                            {
                              family.averageEngagement
                            }
                            /100
                          </strong>
                        </div>
                      </div>

                      {family.topOffer ? (
                        <div
                          className="muted-text"
                          style={{
                            marginTop:
                              11,
                            fontSize:
                              "0.8rem",
                          }}
                        >
                          Common offer:{" "}
                          <strong>
                            {
                              family.topOffer
                            }
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  )
                )}
              </div>
            </div>
          ) : null}

          <div
            className="surface"
            style={{
              padding: 18,
              borderRadius: 14,
              marginBottom: 20,
            }}
          >
            <h4
              style={{
                margin: 0,
              }}
            >
              What competitors
              are doing
            </h4>

            <p
              className="muted-text"
              style={{
                margin:
                  "5px 0 0",
              }}
            >
              Patterns detected from
              the current competitor
              set.
            </p>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              {[
                [
                  `${videoAds} video creatives`,
                  `${videoShare}% of the visible competitor ads use video.`,
                ],
                [
                  `${imageAds} image creatives`,
                  "Static creative remains a significant part of the competitor mix.",
                ],
                [
                  `${carouselAds} carousel creatives`,
                  "Useful for product range, collection and multi-benefit storytelling.",
                ],
                [
                  `${inactiveAds} inactive ads`,
                  "These can still reveal historical creative and offer patterns.",
                ],
              ].map(
                ([title, body]) => (
                  <div
                    key={title}
                    style={{
                      padding: 13,
                      borderRadius: 10,
                      background:
                        "var(--muted, rgba(127,127,127,0.07))",
                    }}
                  >
                    <strong>
                      {title}
                    </strong>

                    <p
                      className="muted-text"
                      style={{
                        margin:
                          "5px 0 0",
                        lineHeight:
                          1.5,
                      }}
                    >
                      {body}
                    </p>
                  </div>
                )
              )}
            </div>

            {topOffers.length >
            0 ? (
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <div
                  className="muted-text"
                  style={{
                    fontSize:
                      "0.78rem",
                    fontWeight: 700,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.04em",
                    marginBottom: 7,
                  }}
                >
                  Common offers
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 7,
                    flexWrap:
                      "wrap",
                  }}
                >
                  {topOffers.map(
                    (item) => (
                      <Badge
                        key={
                          item.offer
                        }
                        variant="secondary"
                      >
                        {
                          item.offer
                        }{" "}
                        ·{" "}
                        {
                          item.count
                        }
                      </Badge>
                    )
                  )}
                </div>
              </div>
            ) : null}

            {topCreators.length >
            0 ? (
              <div
                style={{
                  marginTop: 12,
                }}
              >
                <div
                  className="muted-text"
                  style={{
                    fontSize:
                      "0.78rem",
                    fontWeight: 700,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.04em",
                    marginBottom: 7,
                  }}
                >
                  Creator signals
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 7,
                    flexWrap:
                      "wrap",
                  }}
                >
                  {topCreators.map(
                    (creator) => (
                      <Badge
                        key={
                          creator
                        }
                        variant="secondary"
                      >
                        {
                          creator
                        }
                      </Badge>
                    )
                  )}
                </div>
              </div>
            ) : null}

            {hookPatterns.length >
            0 ? (
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <div
                  className="muted-text"
                  style={{
                    fontSize:
                      "0.78rem",
                    fontWeight: 700,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.04em",
                    marginBottom: 7,
                  }}
                >
                  Hook patterns
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 7,
                    flexWrap:
                      "wrap",
                  }}
                >
                  {hookPatterns.map(
                    (
                      pattern
                    ) => (
                      <Badge
                        key={
                          pattern.label
                        }
                        variant="secondary"
                      >
                        {
                          pattern.label
                        }{" "}
                        ·{" "}
                        {
                          pattern.share
                        }%
                      </Badge>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="surface"
            style={{
              padding: 18,
              borderRadius: 14,
              marginBottom: 22,
            }}
          >
            <h4
              style={{
                margin: 0,
              }}
            >
              What to test next
            </h4>

            <p
              className="muted-text"
              style={{
                margin:
                  "5px 0 0",
              }}
            >
              Rule-based experiment
              suggestions from the
              current market signals.
              These are hypotheses,
              not guaranteed
              performance
              predictions.
            </p>

            <div
              style={{
                display:
                  "grid",
                gap: 12,
                marginTop: 15,
              }}
            >
              {recommendedExperiments.map(
                (
                  suggestion,
                  index
                ) => (
                  <div
                    key={
                      `${index}-${suggestion}`
                    }
                  >
                    <strong>
                      {index + 1}.{" "}
                      {
                        suggestion.split(
                          ":"
                        )[0]
                      }
                    </strong>

                    <div
                      className="muted-text"
                      style={{
                        marginTop: 3,
                      }}
                    >
                      {
                        suggestion.split(
                          ":"
                        ).slice(1).join(
                          ":"
                        ).trim()
                      }
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              gap: 12,
              marginBottom: 14,
              flexWrap:
                "wrap",
            }}
          >
            <div>
              <h4
                style={{
                  margin: 0,
                }}
              >
                Competitor
                creatives
              </h4>

              <p
                className="muted-text"
                style={{
                  margin:
                    "4px 0 0",
                }}
              >
                Ranked by creative
                quality, longevity,
                relevance and estimated
                engagement potential.
              </p>
            </div>

            {pagination ? (
              <Badge variant="secondary">
                Showing{" "}
                {
                  showingStart
                }
                –
                {
                  showingEnd
                }{" "}
                of{" "}
                {
                  totalResults
                }
              </Badge>
            ) : null}
          </div>

          <div
            className="fix-grid"
            style={{
              marginTop: 0,
              gap: 18,
            }}
          >
            {ads.map(
              (
                ad,
                index
              ) => {
                const image =
                  firstUrl(
                    ad.imageUrl
                  ) ??
                  firstUrl(
                    ad.thumbnailUrl
                  );

                const landingPage =
                  firstUrl(
                    ad.landingPage
                  );

                const sourceUrl =
                  firstUrl(
                    ad.sourceUrl
                  );

                const videoUrl =
                  firstUrl(
                    ad.videoUrl
                  );

                const title =
                  getAdTitle(ad);

                const hook =
                  getHookText(ad);

                const advertiser =
                  normalizeWhitespace(
                    ad.advertiserName
                  ) ||
                  "Unknown advertiser";

                return (
                  <article
                    key={`${ad.id}-${index}`}
                    className="fix-card"
                    style={{
                      padding: 0,
                      overflow:
                        "hidden",
                      display:
                        "flex",
                      flexDirection:
                        "column",
                    }}
                  >
                    {image ? (
                      <div
                        style={{
                          position:
                            "relative",
                          background:
                            "var(--muted, rgba(127,127,127,0.08))",
                          aspectRatio:
                            "4 / 3",
                          overflow:
                            "hidden",
                        }}
                      >
                        <img
                          src={image}
                          alt={title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          style={{
                            width:
                              "100%",
                            height:
                              "100%",
                            objectFit:
                              "cover",
                            display:
                              "block",
                          }}
                        />

                        <div
                          style={{
                            position:
                              "absolute",
                            top: 10,
                            left: 10,
                            display:
                              "flex",
                            gap: 6,
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <Badge
                            variant={
                              ad.isActive
                                ? "success"
                                : "secondary"
                            }
                          >
                            {ad.isActive
                              ? "Active"
                              : "Inactive"}
                          </Badge>

                          {ad.creativeType ? (
                            <Badge variant="secondary">
                              {
                                ad.creativeType
                              }
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          aspectRatio:
                            "4 / 3",
                          display:
                            "grid",
                          placeItems:
                            "center",
                          background:
                            "var(--muted, rgba(127,127,127,0.08))",
                        }}
                      >
                        <span className="muted-text">
                          Creative
                          preview
                          unavailable
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        padding: 16,
                        display:
                          "flex",
                        flexDirection:
                          "column",
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: 10,
                        }}
                      >
                        <span
                          className="metric-title"
                          style={{
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            advertiser
                          }
                        </span>

                        {ad.partnershipType ===
                            "creator" ||
                          ad.creatorName ? (
                          <Badge variant="secondary">
                            {ad.creatorName
                              ? `Creator: ${ad.creatorName}`
                              : "Creator"}
                          </Badge>
                        ) : null}
                      </div>

                      <h4
                        style={{
                          margin:
                            "10px 0 0",
                          lineHeight:
                            1.35,
                        }}
                      >
                        {title}
                      </h4>

                      {hook &&
                      hook !== title &&
                      ad.primaryText ? (
                        <div
                          style={{
                            marginTop:
                              9,
                            padding:
                              "9px 10px",
                            borderRadius:
                              9,
                            background:
                              "var(--muted, rgba(127,127,127,0.07))",
                          }}
                        >
                          <div
                            className="muted-text"
                            style={{
                              fontSize:
                                "0.72rem",
                              fontWeight:
                                700,
                              textTransform:
                                "uppercase",
                              letterSpacing:
                                "0.04em",
                              marginBottom:
                                3,
                            }}
                          >
                            Hook
                          </div>

                          <div
                            style={{
                              fontSize:
                                "0.9rem",
                              lineHeight:
                                1.45,
                            }}
                          >
                            {
                              hook
                            }
                          </div>
                        </div>
                      ) : null}

                      {ad.primaryText ? (
                        <p
                          style={{
                            margin:
                              "9px 0 0",
                            fontSize:
                              "0.92rem",
                            lineHeight:
                              1.55,
                            display:
                              "-webkit-box",
                            WebkitLineClamp:
                              4,
                            WebkitBoxOrient:
                              "vertical",
                            overflow:
                              "hidden",
                          }}
                        >
                          {
                            ad.primaryText
                          }
                        </p>
                      ) : null}

                      {ad.offer ? (
                        <div
                          style={{
                            marginTop:
                              11,
                            padding:
                              "9px 10px",
                            borderRadius:
                              9,
                            background:
                              "rgba(16, 185, 129, 0.08)",
                          }}
                        >
                          <span
                            style={{
                              fontSize:
                                "0.76rem",
                              fontWeight:
                                700,
                              textTransform:
                                "uppercase",
                              letterSpacing:
                                "0.04em",
                            }}
                          >
                            Offer
                          </span>

                          <div
                            style={{
                              marginTop:
                                2,
                              fontSize:
                                "0.9rem",
                              fontWeight:
                                600,
                            }}
                          >
                            {
                              ad.offer
                            }
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",
                          gap: 8,
                          marginTop:
                            14,
                        }}
                      >
                        {[
                          {
                            label:
                              "Creative",
                            score:
                              ad.creativeScore,
                          },
                          {
                            label:
                              "Longevity",
                            score:
                              ad.longevityScore,
                          },
                          {
                            label:
                              "Relevance",
                            score:
                              ad.relevanceScore,
                          },
                          {
                            label:
                              "Engagement Potential",
                            score:
                              ad.engagementPotentialScore,
                          },
                        ].map(
                          ({
                            label,
                            score,
                          }) => (
                            <div
                              key={
                                label
                              }
                              style={{
                                padding:
                                  9,
                                borderRadius:
                                  9,
                                background:
                                  "var(--muted, rgba(127,127,127,0.07))",
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "space-between",
                                gap: 8,
                              }}
                            >
                              <div>
                                <div
                                  className="muted-text"
                                  style={{
                                    fontSize:
                                      "0.72rem",
                                  }}
                                >
                                  {
                                    label
                                  }
                                </div>

                                <strong>
                                  {scoreLabel(
                                    score
                                  )}
                                </strong>
                              </div>

                              <Badge
                                variant={scoreTone(
                                  score
                                )}
                              >
                                /100
                              </Badge>
                            </div>
                          )
                        )}
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          gap: 6,
                          flexWrap:
                            "wrap",
                          marginTop:
                            12,
                        }}
                      >
                        {ad.callToAction ? (
                          <Badge variant="secondary">
                            {
                              ad.callToAction
                            }
                          </Badge>
                        ) : null}

                        {typeof ad.runningDays ===
                            "number" &&
                        ad.runningDays >
                          0 ? (
                          <Badge variant="secondary">
                            {
                              ad.runningDays
                            }{" "}
                            days
                          </Badge>
                        ) : null}

                        {ad.publisherPlatforms
                          ?.slice(
                            0,
                            3
                          )
                          .map(
                            (
                              platform
                            ) => (
                              <Badge
                                key={`${ad.id}-${platform}`}
                                variant="secondary"
                              >
                                {
                                  platform
                                }
                              </Badge>
                            )
                          )}
                      </div>

                      {ad.creatorName || ad.partnershipType ? (
                        <div
                          className="muted-text"
                          style={{
                            marginTop: 10,
                            fontSize: "0.8rem",
                            lineHeight: 1.5,
                          }}
                        >
                          {ad.creatorName ? (
                            <div>
                              Creator:{" "}
                              <strong>
                                {ad.creatorName}
                              </strong>
                            </div>
                          ) : null}

                          {ad.partnershipType &&
                          ad.partnershipType !== "unknown" ? (
                            <div>
                              Partnership:{" "}
                              <strong>
                                {ad.partnershipType === "creator"
                                  ? "Creator / collaboration"
                                  : "Direct advertiser"}
                              </strong>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div
                        className="muted-text"
                        style={{
                          marginTop:
                            11,
                          fontSize:
                            "0.8rem",
                          lineHeight:
                            1.5,
                        }}
                      >
                        {ad.firstSeen ? (
                          <div>
                            Started:{" "}
                            {formatDate(
                              ad.firstSeen
                            )}
                          </div>
                        ) : null}

                        {ad.lastSeen ? (
                          <div>
                            Last seen:{" "}
                            {formatDate(
                              ad.lastSeen
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div
                        className="action-row"
                        style={{
                          marginTop:
                            "auto",
                          paddingTop:
                            15,
                          gap: 8,
                          flexWrap:
                            "wrap",
                        }}
                      >
                        {landingPage ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              openExternalUrl(
                                landingPage
                              )
                            }
                          >
                            View Landing
                            Page
                          </Button>
                        ) : null}

                        {sourceUrl ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              openExternalUrl(
                                sourceUrl
                              )
                            }
                          >
                            Ad Library
                          </Button>
                        ) : null}

                        {videoUrl ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              openExternalUrl(
                                videoUrl
                              )
                            }
                          >
                            Watch Video
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              }
            )}
          </div>

          {pagination ? (
            <div
              className="surface"
              style={{
                marginTop: 20,
                padding: 14,
                borderRadius: 12,
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                gap: 10,
                flexWrap:
                  "wrap",
              }}
            >
              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  !pagination.hasPreviousPage
                }
                onClick={() =>
                  goToPage(
                    pagination.previousPage ??
                      page - 1
                  )
                }
              >
                Previous
              </Button>

              <Badge variant="secondary">
                Page{" "}
                {
                  pagination.page
                }{" "}
                of{" "}
                {
                  pagination.totalPages
                }
              </Badge>

              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  !pagination.hasNextPage
                }
                onClick={() =>
                  goToPage(
                    pagination.nextPage ??
                      page + 1
                  )
                }
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}