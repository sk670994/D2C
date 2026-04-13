import type { CalculatedReport } from "@/lib/types/domain";

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatInr = (value: number) => `INR ${Math.round(value).toLocaleString("en-IN")}`;

export function buildCompetitiveNarrative(report: CalculatedReport): string[] {
  const lines: string[] = [];
  const { blendedRoas, blendedCac, cpc, blendedCvr, blendedCtr } = report.adMetrics;
  const { contributionMarginPct, maxAllowableCac } = report.unitEconomics;
  const { readiness, allocationTotalPct, targetRevenue } = report.scalePlanner;
  const { netProfitMarginPct } = report.monthlyPnl;

  if (blendedRoas >= 5) {
    lines.push(`ROAS ${blendedRoas.toFixed(2)}x - media engine is outperforming most peers.`);
  } else if (blendedRoas >= 3) {
    lines.push(`ROAS ${blendedRoas.toFixed(2)}x - meeting the 3x scaling threshold.`);
  } else {
    lines.push(`ROAS ${blendedRoas.toFixed(2)}x - below the 3x benchmark; keep creative or targeting tight.`);
  }

  if (blendedCac <= maxAllowableCac) {
    lines.push(`CAC ${formatInr(blendedCac)} is under the allowable ${formatInr(maxAllowableCac)} guardrail.`);
  } else {
    lines.push(`CAC ${formatInr(blendedCac)} exceeds the max allowable ${formatInr(maxAllowableCac)}; lift contribution before scaling.`);
  }

  if (contributionMarginPct >= 0.3) {
    lines.push(`Contribution margin ${formatPct(contributionMarginPct)} signals healthy unit economics.`);
  } else {
    lines.push(`Contribution margin ${formatPct(contributionMarginPct)} is below 30%; consider cost or pricing fixes.`);
  }

  if (netProfitMarginPct >= 0.1) {
    lines.push(`Net margin ${formatPct(netProfitMarginPct)} gives you the cushion to invest in growth.`);
  } else {
    lines.push(`Net margin ${formatPct(netProfitMarginPct)} is compressed; prioritize margin preservation.`);
  }

  if (readiness === "READY TO SCALE") {
    lines.push(`Scale verdict READY TO SCALE - keep allocations disciplined at ${(allocationTotalPct * 100).toFixed(1)}%.`);
  } else {
    lines.push(`Scale verdict says ${readiness}; focus on aligning ROAS, CAC, and margin before pumping spend.`);
  }

  if (blendedCtr > 0) {
    lines.push(`CTR ${formatPct(blendedCtr)} and CVR ${formatPct(blendedCvr)} frame your funnel quality; CPC ${formatInr(cpc)} is the entry price.`);
  }

  lines.push(`Target revenue ${formatInr(targetRevenue)} defines the upcoming stretch goal.`);

  return lines.filter(Boolean);
}
