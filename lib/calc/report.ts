import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";

export function calculateReport(input: ParsedReport): CalculatedReport {
  const u = input.unitEconomicsInput;
  const a = input.adMetricsInput;

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

  return {
    unitEconomics: {
      netRevenueExGst,
      grossMargin,
      contributionMargin,
      contributionMarginPct,
      maxAllowableCac
    },
    adMetrics: {
      blendedRoas,
      blendedCac,
      blendedCtr,
      blendedCvr
    },
    insights: {
      summary: "Insights not generated yet",
      priorityFixes: []
    }
  };
}
