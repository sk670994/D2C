export type BrandVaultPeriod = "week" | "month" | "quarter";
export type BrandVaultFocus = "all" | 1 | 2 | 3;

export type BrandEconomics = {
  sellingPrice: number | null;
  cogs: number | null;
  packagingCost: number | null;
  shippingCost: number | null;
  paymentFeePercent: number | null;
  paymentFeeFixed: number | null;
  rtoRatePercent: number | null;
  rtoCost: number | null;
  refundAllowancePercent: number | null;
  targetContributionMarginPercent: number | null;
};

export const EMPTY_ECONOMICS: BrandEconomics = {
  sellingPrice: null,
  cogs: null,
  packagingCost: null,
  shippingCost: null,
  paymentFeePercent: null,
  paymentFeeFixed: null,
  rtoRatePercent: null,
  rtoCost: null,
  refundAllowancePercent: null,
  targetContributionMarginPercent: null,
};

export type BrandVaultCompetitor = {
  id: string;
  slot: 1 | 2 | 3;
  name: string;
  domain: string | null;
  advertiserPageId: string | null;
  country: string;
  platform: "meta";
  createdAt: string;
  updatedAt: string;
};

export type Provenance = "Source" | "Derived" | "Heuristic";

export type RankedItem = {
  label: string;
  count: number;
  share: number;
  provenance: Provenance;
};

export type OfferItem = {
  label: string;
  count: number;
  share: number;
  visiblePrice: number | null;
  vsBreakEven: number | null;
  relation: "below" | "near" | "above" | "unknown";
  provenance: Provenance;
};

export type SupportingAd = {
  id: string;
  productName: string | null;
  hook: string | null;
  creatorName: string | null;
  offer: string | null;
  price: number | null;
  creativeType: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  runningDays: number;
  active: boolean | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  provenance: Provenance;
  heuristicLabel: string | null;
};

export type ChangeItem = {
  type: "new_test" | "new_offer" | "new_message" | "retired";
  label: string;
  detail: string;
  count: number;
  provenance: Provenance;
  supportingAds: SupportingAd[];
};

export type ProductPressure = {
  product: string;
  ads: number;
  activeAds: number;
  persistent60: number;
  share: number;
  provenance: Provenance;
  supportingAds: SupportingAd[];
};

export type CompetitorAnalytics = {
  slot: 1 | 2 | 3;
  name: string;
  pageId: string | null;
  country: string;
  periodDays: number;
  lastObservedAt: string | null;
  totalAds: number;
  activeAds: number;
  newTests: number;
  newOffers: number;
  newMessages: number;
  retiredAds: number;
  persistent30: number;
  persistent60: number;
  persistent90: number;
  topHooks: RankedItem[];
  topCreators: RankedItem[];
  topLanguages: RankedItem[];
  topProducts: ProductPressure[];
  topOffers: OfferItem[];
  changes: ChangeItem[];
  winnersBoard: SupportingAd[];
  stoppedWithin7Days: SupportingAd[];
  angleCoverage: Record<string, number>;
  usedCreatorNames: string[];
  usedLanguageCodes: string[];
  dataCoverage: "strong" | "thin" | "none";
};

export type BrandVaultAnalytics = {
  period: BrandVaultPeriod;
  generatedAt: string;
  breakEvenPrice: number | null;
  targetMarginPrice: number | null;
  contributionBeforeAds: number | null;
  competitors: CompetitorAnalytics[];
  compareRows: Array<{
    slot: 1 | 2 | 3;
    name: string;
    totalAds: number;
    activeAds: number;
    newTests: number;
    persistent60: number;
    topProduct: string | null;
    topHook: string | null;
    topCreator: string | null;
    topLanguage: string | null;
  }>;
  gaps: {
    angles: string[];
    creators: string[];
    languages: string[];
  };
  mondayDigest: {
    headline: string;
    lines: string[];
    changes: ChangeItem[];
  };
  counterBrief: string;
};

export type BrandVaultProData = {
  brandVault: {
    brandName: string;
    websiteUrl: string;
    tone: string;
    audience: string;
    doNotSay: string;
    heroProduct: string;
    mainObjection: string;
    competitorFocus: string;
    economics: BrandEconomics;
    updatedAt: string | null;
  } | null;
  competitors: BrandVaultCompetitor[];
  analytics: BrandVaultAnalytics;
  savedActions: Array<{
    id: string;
    actionType: "save" | "brief" | "alert";
    referenceKey: string;
    title: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};
