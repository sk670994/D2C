export type ZwirkPage =
  | "home"
  | "dashboard"
  | "adspy"
  | "brand-vault"
  | "records"
  | "decision-loop"
  | "pricing"
  | "faq"
  | "zwirk"
  | "other";

export type ZwirkEntityType =
  | "ad"
  | "advertiser"
  | "product"
  | "competitor"
  | "metric"
  | "experiment"
  | "report"
  | "brand"
  | "none";

export type ZwirkEvidenceType =
  | "FACT"
  | "OBSERVED"
  | "DERIVED"
  | "ASSUMPTION"
  | "RECOMMENDATION";

export type ZwirkIntent =
  | "general"
  | "ad_analysis"
  | "ad_success_analysis"
  | "ad_failure_analysis"
  | "creative_analysis"
  | "competitor_analysis"
  | "competitor_comparison"
  | "market_analysis"
  | "economics"
  | "diagnosis"
  | "scaling"
  | "experiment"
  | "brand_strategy"
  | "product_strategy";

export type ZwirkEntityContext = {
  type: ZwirkEntityType;
  id?: string | null;
  name?: string | null;
  payload?: Record<string, unknown>;
};

export type ZwirkPageContext = {
  page: ZwirkPage;
  label: string;
  description: string;
  entity?: ZwirkEntityContext | null;
};

export type ZwirkWorkspaceContext = {
  brandVault?: Record<string, unknown> | null;
  dashboard?: string | null;
  competitiveContext?: string | null;
  adSpyContext?: string | null;
  history?: string | null;
  experiments?: string | null;
};

export type ZwirkRequestContext = {
  page: ZwirkPageContext;
  workspace: ZwirkWorkspaceContext;
  intent: ZwirkIntent;
  evidenceRules: string[];
};

export type ZwirkEvidence = {
  type: ZwirkEvidenceType;
  statement: string;
  source:
    | "dashboard"
    | "brand_vault"
    | "adspy"
    | "history"
    | "user"
    | "derived";
};

export type ZwirkReasoningResult = {
  intent: ZwirkIntent;
  evidence: ZwirkEvidence[];
  questionRestated?: string;
  recommendedActions?: string[];
};
