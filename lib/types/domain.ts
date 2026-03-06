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
};

export type InsightPayload = {
  summary: string;
  priorityFixes: string[];
};

export type CalculatedReport = {
  unitEconomics: {
    netRevenueExGst: number;
    grossMargin: number;
    contributionMargin: number;
    contributionMarginPct: number;
    maxAllowableCac: number;
  };
  adMetrics: {
    blendedRoas: number;
    blendedCac: number;
    blendedCtr: number;
    blendedCvr: number;
  };
  insights: InsightPayload;
};
