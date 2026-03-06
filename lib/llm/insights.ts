import type { CalculatedReport, InsightPayload } from "@/lib/types/domain";

export async function generateInsights(report: CalculatedReport): Promise<InsightPayload> {
  const fixes: string[] = [];

  if (report.adMetrics.blendedRoas < 3) fixes.push("Improve ROAS to at least 3x before scaling budgets.");
  if (report.unitEconomics.contributionMarginPct < 0.3) fixes.push("Increase contribution margin above 30% by fixing COGS/fulfillment.");
  if (report.adMetrics.blendedCac > report.unitEconomics.maxAllowableCac) fixes.push("CAC exceeds max allowable CAC; optimize acquisition efficiency.");

  if (fixes.length === 0) {
    fixes.push("Core metrics are healthy. Move to controlled scaling plan.");
  }

  return {
    summary: "Automated insights generated from computed KPIs. You can replace this module with an LLM API call.",
    priorityFixes: fixes
  };
}
