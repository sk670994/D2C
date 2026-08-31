import type { CalculatedReport } from "@/lib/types/domain";
import { generateDecisions, generateMoneyAlerts, type ActionItem, type OpportunityScan } from "@/lib/llm/decision-engine";
import { greetingFor, pct, rupees, times, todayLabel } from "@/lib/format/money";

export type StatementKind = "FACT" | "DERIVED" | "OBSERVED" | "ASSUMPTION" | "RECOMMENDATION";

export type TransparencyLine = {
  label: string;
  value: string;
  tone?: "neutral" | "warn" | "good";
};

export type AttentionItem = {
  id: string;
  kind: "warning" | "opportunity" | "healthy" | "market";
  title: string;
  body: string;
  impact?: string;
  evidence: string[];
  action: string;
  kindTag: StatementKind;
};

export type DailyBrief = {
  greeting: string;
  dateLabel: string;
  healthScore: number;
  healthLabel: string;
  headline: string;
  trueRoas: number;
  kpis: Array<{ label: string; value: string; hint: string; tone: "good" | "warn" | "neutral" }>;
  attention: AttentionItem[];
  recommendations: ActionItem[];
  zwirkTake: string;
  transparency: {
    title: string;
    result: string;
    lines: TransparencyLine[];
  };
  scan: OpportunityScan;
};

function contributionRoas(report: CalculatedReport): number {
  const spend = report.adMetrics.totalAdSpend;
  if (spend <= 0) return 0;
  return report.monthlyPnl.contributionMonth / spend;
}

export function buildDailyBrief(report: CalculatedReport, userName = ""): DailyBrief {
  const scan = generateDecisions(report);
  const alerts = generateMoneyAlerts(report);
  const trueRoas = contributionRoas(report);
  const cacOver = report.adMetrics.blendedCac > report.unitEconomics.maxAllowableCac;
  const leak = report.monthlyPnl.profitLeakMonth;
  const healthyProfit = report.monthlyPnl.netProfitMonth > 0 && !cacOver && leak <= 0;

  const attention: AttentionItem[] = [];

  if (cacOver) {
    const gap = report.adMetrics.blendedCac - report.unitEconomics.maxAllowableCac;
    const dailyProtection = Math.max(0, (report.adMetrics.totalAdSpend / 30) * 0.3);
    attention.push({
      id: "cac",
      kind: "warning",
      title: "CAC is above allowable",
      body: `Blended CAC ${rupees(report.adMetrics.blendedCac)} vs allowable ${rupees(report.unitEconomics.maxAllowableCac)} (${rupees(gap)} over).`,
      impact: `Reducing spend ~30% could protect about ${rupees(dailyProtection)}/day.`,
      evidence: [
        `FACT · Blended CAC ${rupees(report.adMetrics.blendedCac)}`,
        `FACT · Max allowable CAC ${rupees(report.unitEconomics.maxAllowableCac)}`,
        `FACT · Blended ROAS ${times(report.adMetrics.blendedRoas)}`,
        `DERIVED · Contribution / order ${rupees(report.unitEconomics.contributionMargin)}`
      ],
      action: "Reduce inefficient spend and refresh creatives before scaling.",
      kindTag: "RECOMMENDATION"
    });
  }

  if (leak > 0) {
    attention.push({
      id: "leak",
      kind: "warning",
      title: "Marketing exceeds contribution",
      body: `Ad spend is ${rupees(leak)} above contribution for this period.`,
      impact: `Net profit is ${rupees(report.monthlyPnl.netProfitMonth)}.`,
      evidence: [
        `FACT · Contribution ${rupees(report.monthlyPnl.contributionMonth)}`,
        `FACT · Marketing ${rupees(report.monthlyPnl.marketingMonth)}`,
        `DERIVED · Profit leak ${rupees(leak)}`
      ],
      action: "Pause or cut campaigns that cannot cover contribution.",
      kindTag: "RECOMMENDATION"
    });
  }

  if (report.unitEconomics.contributionMarginPct < 0.3) {
    attention.push({
      id: "margin",
      kind: "warning",
      title: "Contribution margin is below 30%",
      body: `You keep ${pct(report.unitEconomics.contributionMarginPct)} of net revenue after COGS, COD, shipping, returns and fees.`,
      evidence: [
        `FACT · Returns rate in model`,
        `FACT · COGS + fulfillment ${rupees(report.unitEconomics.totalCogs + report.unitEconomics.fulfillmentCost)} / order`,
        `DERIVED · Contribution margin ${pct(report.unitEconomics.contributionMarginPct)}`
      ],
      action: "Fix COGS, discounting or return rate before buying more traffic.",
      kindTag: "RECOMMENDATION"
    });
  }

  if (report.scalePlanner.readiness === "READY TO SCALE" || (trueRoas >= 3 && !cacOver && report.unitEconomics.contributionMarginPct >= 0.3)) {
    attention.push({
      id: "scale",
      kind: "opportunity",
      title: "Room to scale profitably",
      body: `True contribution ROAS is ${times(trueRoas)} and CAC is inside the allowable range.`,
      impact: `A 20% spend increase is about ${rupees(report.adMetrics.totalAdSpend * 0.2)} extra media.`,
      evidence: [
        `FACT · Reported ROAS ${times(report.adMetrics.blendedRoas)}`,
        `DERIVED · Contribution ROAS ${times(trueRoas)}`,
        `FACT · Scale verdict ${report.scalePlanner.readiness}`
      ],
      action: "Shift budget toward the highest-contribution SKU, not the highest ROAS ad.",
      kindTag: "RECOMMENDATION"
    });
  }

  if (attention.length === 0) {
    attention.push({
      id: "healthy",
      kind: "healthy",
      title: "No urgent leaks in the current model",
      body: "Economics look internally consistent. Next value comes from market tests, not more dashboards.",
      evidence: [
        `FACT · Net profit ${rupees(report.monthlyPnl.netProfitMonth)}`,
        `DERIVED · Health score ${scan.score}/100`
      ],
      action: "Analyze a product URL in AdSpy and create one experiment this week.",
      kindTag: "RECOMMENDATION"
    });
  }

  const headline = healthyProfit
    ? "Your business is profitable on the current model."
    : leak > 0 || cacOver
      ? "Profit is at risk. Two numbers need attention before you scale."
      : "The model is mixed. Fix the weak gate, then grow.";

  const recommendations = [...scan.todayActions, ...scan.thisWeekActions].slice(0, 3);

  const zwirkTake = [
    `Health ${scan.score}/100 · ${scan.opportunityRank.label.replace(/[^\w\s/+.-]/g, "").trim()}.`,
    attention[0] ? `First move: ${attention[0].action}` : "",
    alerts[0] ? alerts[0].headline.replace(/[^\w\s₹%.,+-]/g, "").trim() : ""
  ]
    .filter(Boolean)
    .join(" ");

  return {
    greeting: greetingFor(userName),
    dateLabel: todayLabel(),
    healthScore: scan.score,
    healthLabel: scan.trend,
    headline,
    trueRoas,
    kpis: [
      {
        label: "Revenue (period)",
        value: rupees(report.monthlyPnl.netRevenueMonth),
        hint: "After returns in the model",
        tone: "neutral"
      },
      {
        label: "True contribution ROAS",
        value: times(trueRoas),
        hint: "Contribution ÷ ad spend, not platform ROAS",
        tone: trueRoas >= 3 ? "good" : trueRoas >= 1.5 ? "warn" : "warn"
      },
      {
        label: "Profit",
        value: rupees(report.monthlyPnl.netProfitMonth),
        hint: report.monthlyPnl.netProfitMonth >= 0 ? "Contribution minus ads" : "Ads exceed contribution",
        tone: report.monthlyPnl.netProfitMonth >= 0 ? "good" : "warn"
      },
      {
        label: "CAC vs allowable",
        value: `${rupees(report.adMetrics.blendedCac)} / ${rupees(report.unitEconomics.maxAllowableCac)}`,
        hint: cacOver ? "Over the safe range" : "Inside the safe range",
        tone: cacOver ? "warn" : "good"
      }
    ],
    attention,
    recommendations,
    zwirkTake,
    transparency: {
      title: "Where the money went",
      result: `${times(trueRoas)} true contribution ROAS`,
      lines: [
        { label: "Reported ad revenue", value: rupees(report.adMetrics.totalRevenue) },
        { label: "Return loss", value: `− ${rupees(report.monthlyPnl.returnLossMonth)}`, tone: "warn" },
        { label: "COGS", value: `− ${rupees(report.monthlyPnl.cogsMonth)}` },
        { label: "Fulfillment (ship + COD + PG + warehouse)", value: `− ${rupees(report.monthlyPnl.fulfillmentMonth)}` },
        { label: "Contribution", value: rupees(report.monthlyPnl.contributionMonth), tone: "good" },
        { label: "Ad spend", value: `− ${rupees(report.monthlyPnl.marketingMonth)}` },
        {
          label: "Net profit",
          value: rupees(report.monthlyPnl.netProfitMonth),
          tone: report.monthlyPnl.netProfitMonth >= 0 ? "good" : "warn"
        }
      ]
    },
    scan
  };
}

export function buildZwirkContext(report: CalculatedReport): string {
  const brief = buildDailyBrief(report);
  return [
    `Health score: ${brief.healthScore}/100 (${brief.healthLabel})`,
    `Headline: ${brief.headline}`,
    `Net revenue: ${brief.kpis[0].value}`,
    `True contribution ROAS: ${times(brief.trueRoas)}`,
    `Platform blended ROAS: ${times(report.adMetrics.blendedRoas)}`,
    `Profit: ${brief.kpis[2].value}`,
    `CAC: ${rupees(report.adMetrics.blendedCac)}`,
    `Allowable CAC: ${rupees(report.unitEconomics.maxAllowableCac)}`,
    `Contribution / order: ${rupees(report.unitEconomics.contributionMargin)}`,
    `Returns-adjusted revenue / order is modeled; do not invent orders or RTO by pincode.`,
    `Attention:`,
    ...brief.attention.map((item) => `- ${item.title}: ${item.body}`),
    `Recommended actions:`,
    ...brief.recommendations.map((item) => `- ${item.title}: ${item.description} Impact: ${item.expectedImpact}`)
  ].join("\n");
}
