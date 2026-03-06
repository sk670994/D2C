import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";

function toNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function calculateReport(input: ParsedReport): CalculatedReport {
  const u = input.unitEconomicsInput;
  const a = input.adMetricsInput;
  const g = input.scalePlannerInput;

  const netSellingPrice = u.sellingPrice - u.discount;
  const netRevenueExGst = netSellingPrice / (1 + u.gstRate);
  const totalCogs = u.cogsParts.reduce((acc, cur) => acc + cur, 0);
  const grossMargin = netRevenueExGst - totalCogs;
  const pgFee = netRevenueExGst * u.paymentGatewayPct;
  const returnCost = u.returnsRate * u.returnShipping;
  const fulfillmentCost = u.shipping + u.codFee + pgFee + returnCost + u.warehouse;
  const contributionMargin = grossMargin - fulfillmentCost;
  const contributionMarginPct = netRevenueExGst > 0 ? contributionMargin / netRevenueExGst : 0;
  const maxAllowableCac = contributionMargin * 0.8;

  const blendedRoas = a.totalAdSpend > 0 ? a.revenue / a.totalAdSpend : 0;
  const blendedCac = a.orders > 0 ? a.totalAdSpend / a.orders : 0;
  const blendedCtr = a.impressions > 0 ? a.clicks / a.impressions : 0;
  const blendedCvr = a.clicks > 0 ? a.orders / a.clicks : 0;
  const cpc = a.clicks > 0 ? a.totalAdSpend / a.clicks : 0;
  const cpm = a.impressions > 0 ? (a.totalAdSpend / a.impressions) * 1000 : 0;

  const percentOfSpendFee = a.totalAdSpend * 0.12;
  const percentOfRevenueFee = a.revenue * 0.03;
  const flatRetainerFee = 25000;
  const performanceFee = 15000 + (blendedRoas > 3 ? (blendedRoas - 3) * 5000 : 0);
  const hybridFee = 15000 + a.totalAdSpend * 0.08;
  const recommendedFee = hybridFee;
  const asPctRevenue = a.revenue > 0 ? recommendedFee / a.revenue : 0;
  const asPctAdSpend = a.totalAdSpend > 0 ? recommendedFee / a.totalAdSpend : 0;
  const breakevenRoasWithAgency = a.totalAdSpend > 0 ? (a.totalAdSpend + recommendedFee) / a.totalAdSpend : 0;

  const targetRevenue = a.revenue * (1 + g.revenueGrowthTargetPct);
  const targetAdSpend = a.totalAdSpend * (1 + g.adSpendGrowthTargetPct);
  const targetOrders = Math.round(a.orders * (1 + g.ordersGrowthTargetPct));
  const targetCac = blendedCac * (1 + g.cacImprovementTargetPct);

  const budgetMeta = targetAdSpend * g.allocationMetaPct;
  const budgetGoogle = targetAdSpend * g.allocationGooglePct;
  const budgetOther = targetAdSpend * g.allocationOtherPct;

  const expectedOrdersMeta = blendedCac > 0 ? Math.round(budgetMeta / blendedCac) : 0;
  const expectedOrdersGoogle = blendedCac > 0 ? Math.round(budgetGoogle / blendedCac) : 0;
  const expectedOrdersOther = blendedCac > 0 ? Math.round(budgetOther / blendedCac) : 0;

  const allocationTotalPct = g.allocationMetaPct + g.allocationGooglePct + g.allocationOtherPct;
  const isReadyToScale = blendedRoas >= 3 && blendedCac <= maxAllowableCac && contributionMarginPct >= 0.3 && Math.abs(allocationTotalPct - 1) < 0.01;
  const readiness = isReadyToScale ? "READY TO SCALE" : "FIX FUNDAMENTALS FIRST";

  const netRevenueMonth = netRevenueExGst * a.orders;
  const cogsMonth = totalCogs * a.orders;
  const fulfillmentMonth = fulfillmentCost * a.orders;
  const contributionMonth = contributionMargin * a.orders;
  const marketingMonth = a.totalAdSpend + recommendedFee;
  const netProfitMonth = contributionMonth - marketingMonth;
  const netProfitMarginPct = netRevenueMonth > 0 ? netProfitMonth / netRevenueMonth : 0;

  return {
    unitEconomics: {
      netRevenueExGst,
      totalCogs,
      fulfillmentCost,
      grossMargin,
      contributionMargin,
      contributionMarginPct,
      maxAllowableCac
    },
    adMetrics: {
      totalAdSpend: a.totalAdSpend,
      totalRevenue: a.revenue,
      totalOrders: a.orders,
      blendedRoas,
      blendedCac,
      blendedCtr,
      blendedCvr,
      cpc,
      cpm
    },
    agencyFee: {
      growthStage: input.agencyInput.growthStage,
      percentOfSpendFee,
      percentOfRevenueFee,
      flatRetainerFee,
      performanceFee,
      hybridFee,
      recommendedFee,
      asPctRevenue,
      asPctAdSpend,
      breakevenRoasWithAgency
    },
    scalePlanner: {
      targetRevenue: toNonNegative(targetRevenue),
      targetAdSpend: toNonNegative(targetAdSpend),
      targetOrders: toNonNegative(targetOrders),
      targetCac: toNonNegative(targetCac),
      budgetMeta: toNonNegative(budgetMeta),
      budgetGoogle: toNonNegative(budgetGoogle),
      budgetOther: toNonNegative(budgetOther),
      expectedOrdersMeta: toNonNegative(expectedOrdersMeta),
      expectedOrdersGoogle: toNonNegative(expectedOrdersGoogle),
      expectedOrdersOther: toNonNegative(expectedOrdersOther),
      allocationTotalPct,
      readiness
    },
    monthlyPnl: {
      netRevenueMonth,
      cogsMonth,
      fulfillmentMonth,
      contributionMonth,
      marketingMonth,
      netProfitMonth,
      netProfitMarginPct
    },
    insights: {
      summary: "Insights not generated yet",
      priorityFixes: [],
      source: "pending",
      latencyMs: 0
    }
  };
}
