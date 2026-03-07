import type { ParsedReport } from "@/lib/types/domain";

export const DEFAULT_REPORT_INPUT: ParsedReport = {
  unitEconomicsInput: {
    sellingPrice: 999,
    discount: 50,
    gstRate: 0.18,
    cogsParts: [250, 40, 15, 20],
    shipping: 80,
    codFee: 30,
    paymentGatewayPct: 0.02,
    returnsRate: 0.12,
    returnShipping: 60,
    warehouse: 25
  },
  adMetricsInput: {
    totalAdSpend: 55000,
    impressions: 800000,
    clicks: 23000,
    orders: 490,
    revenue: 441000
  },
  agencyInput: {
    growthStage: "Early Stage"
  },
  scalePlannerInput: {
    revenueGrowthTargetPct: 0.3,
    adSpendGrowthTargetPct: 0.25,
    ordersGrowthTargetPct: 0.3,
    cacImprovementTargetPct: -0.1,
    allocationMetaPct: 0.55,
    allocationGooglePct: 0.35,
    allocationOtherPct: 0.1
  }
};
