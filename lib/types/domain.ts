export type ParsedReport = {
  unitEconomicsInput: {
    sellingPrice: number;
    discount: number;
    gstRate: number;
    cogsParts: number[];
    shipping: number;
    codFee: number;
    paymentGatewayPct: number;
    returnsRate: number;
    returnShipping: number;
    warehouse: number;
  };
  adMetricsInput: {
    totalAdSpend: number;
    impressions: number;
    clicks: number;
    orders: number;
    revenue: number;
  };
  scalePlannerInput: {
    revenueGrowthTargetPct: number;
    adSpendGrowthTargetPct: number;
    ordersGrowthTargetPct: number;
    cacImprovementTargetPct: number;
    allocationMetaPct: number;
    allocationGooglePct: number;
    allocationOtherPct: number;
  };
};

export type InsightPayload = {
  summary: string;
  priorityFixes: string[];
  growthLevers: string[];
  riskAlerts: string[];
  channelPlan: string[];
  experimentBacklog: string[];
  cashflowActions: string[];
  watchlistKpis: string[];
  next30Days: string[];
  source: "pending" | "gemini" | "fallback";
  latencyMs: number;

  // True when the current report has changed after
  // the AI insights were generated.
  basedOnPreviousCalculation?: boolean;
};

export type CalculatedReport = {
  unitEconomics: {
    netRevenueExGst: number;
    totalCogs: number;
    fulfillmentCost: number;
    grossMargin: number;
    contributionMargin: number;
    contributionMarginPct: number;
    maxAllowableCac: number;
  };
  adMetrics: {
    totalAdSpend: number;
    totalRevenue: number;
    totalOrders: number;
    blendedRoas: number;
    blendedCac: number;
    blendedCtr: number;
    blendedCvr: number;
    cpc: number;
    cpm: number;
  };
  scalePlanner: {
    targetRevenue: number;
    targetAdSpend: number;
    targetOrders: number;
    targetCac: number;
    budgetMeta: number;
    budgetGoogle: number;
    budgetOther: number;
    expectedOrdersMeta: number;
    expectedOrdersGoogle: number;
    expectedOrdersOther: number;
    allocationTotalPct: number;
    readiness: string;
  };
  monthlyPnl: {
    netRevenueMonth: number;
    retainedRevenueMonth: number;
    returnLossMonth: number;
    cogsMonth: number;
    fulfillmentMonth: number;
    contributionMonth: number;
    marketingMonth: number;
    profitLeakMonth: number;
    netProfitMonth: number;
    netProfitMarginPct: number;
  };
  insights: InsightPayload;
};
