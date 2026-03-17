import assert from "node:assert";
import { calculateReport } from "../lib/calc/report";
import { DEFAULT_REPORT_INPUT } from "../lib/constants/defaultInput";

const input = DEFAULT_REPORT_INPUT;
const report = calculateReport(input);
const { totalAdSpend, revenue, orders } = input.adMetricsInput;
const tolerance = 1e-6;

const approx = (label: string, actual: number, expected: number) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    if (Number.isFinite(actual) || Number.isFinite(expected)) {
      throw new Error(`${label} expected ${expected} got ${actual}`);
    }
    return;
  }
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${label} expected ${expected} got ${actual}`);
};

const blendedCac = orders > 0 ? totalAdSpend / orders : 0;

approx(
  "Contribution Margin %",
  report.unitEconomics.contributionMarginPct,
  report.unitEconomics.netRevenueExGst > 0
    ? report.unitEconomics.contributionMargin / report.unitEconomics.netRevenueExGst
    : 0
);

approx("Max CAC", report.unitEconomics.maxAllowableCac, report.unitEconomics.contributionMargin * 0.8);
approx("Target Revenue", report.scalePlanner.targetRevenue, revenue * (1 + input.scalePlannerInput.revenueGrowthTargetPct));
approx("Target Ad Spend", report.scalePlanner.targetAdSpend, totalAdSpend * (1 + input.scalePlannerInput.adSpendGrowthTargetPct));
approx("Target CAC", report.scalePlanner.targetCac, blendedCac * (1 + input.scalePlannerInput.cacImprovementTargetPct));
approx(
  "Net Profit Margin",
  report.monthlyPnl.netProfitMarginPct,
  report.monthlyPnl.netRevenueMonth > 0 ? report.monthlyPnl.netProfitMonth / report.monthlyPnl.netRevenueMonth : 0
);

console.log("Formula validation PASSED for DEFAULT_REPORT_INPUT.");
