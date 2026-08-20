import type { CalculatedReport, InsightPayload } from "@/lib/types/domain";

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type ModelInsights = Partial<Omit<InsightPayload, "source" | "latencyMs">>;

type AdMetricsRow = {
  platform: "meta" | "google";
  campaign_name: string;
  spend: number;
  roas: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  date: string;
};

function sanitizeList(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function inrFmt(n: number) {
  return `INR ${Math.round(n).toLocaleString("en-IN")}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

interface Diagnosis {
  healthScore: number;
  criticalBreaches: string[];
  warningZones: string[];
  strengths: string[];
  businessProfile: "struggling" | "breakeven" | "growing" | "scaling" | "dominant";
  bottleneck: "cac" | "margin" | "roas" | "allocation" | "none";
  roasDelta: number;
  cacUtilisation: number;
  cmGap: number;
  npmGap: number;
  revenuePerOrder: number;
  effectiveCostPerClick: number;
  ctrBenchmarkDelta: number;
  cvrBenchmarkDelta: number;
}

function diagnose(r: CalculatedReport): Diagnosis {
  const roas = r.adMetrics.blendedRoas;
  const cac = r.adMetrics.blendedCac;
  const maxCac = r.unitEconomics.maxAllowableCac;
  const cm = r.unitEconomics.contributionMarginPct;
  const npm = r.monthlyPnl.netProfitMarginPct;
  const allocation = r.scalePlanner.allocationTotalPct;
  const ctr = r.adMetrics.blendedCtr ?? 0;
  const cvr = r.adMetrics.blendedCvr ?? 0;
  const spend = r.adMetrics.totalAdSpend;
  const revenue = r.adMetrics.totalRevenue;
  const orders = r.adMetrics.totalOrders ?? 1;

  const roasDelta = roas - 3.0;
  const cacUtilisation = maxCac > 0 ? cac / maxCac : 999;
  const cmGap = 0.3 - cm;
  const npmGap = 0.1 - npm;
  const revenuePerOrder = orders > 0 ? revenue / orders : 0;
  const effectiveCostPerClick = r.adMetrics.cpc ?? 0;
  const ctrBenchmarkDelta = ctr - 0.02;
  const cvrBenchmarkDelta = cvr - 0.018;

  const criticalBreaches: string[] = [];
  const warningZones: string[] = [];
  const strengths: string[] = [];

  let score = 100;

  if (roas < 1.5) {
    criticalBreaches.push(`ROAS ${fmt(roas)}x - below breakeven; every rupee spent loses money`);
    score -= 35;
  } else if (roas < 3.0) {
    warningZones.push(`ROAS ${fmt(roas)}x - below 3x scale threshold (gap: ${fmt(3 - roas)}x)`);
    score -= 18;
  } else if (roas >= 5.0) {
    strengths.push(`Elite ROAS ${fmt(roas)}x - media engine firing at top-quartile efficiency`);
  } else {
    strengths.push(`ROAS ${fmt(roas)}x - above scale threshold`);
  }

  if (cacUtilisation > 1.3) {
    criticalBreaches.push(
      `CAC ${inrFmt(cac)} is ${pct(cacUtilisation - 1)} over max allowable ${inrFmt(maxCac)} - acquiring customers at a loss`
    );
    score -= 30;
  } else if (cacUtilisation > 1.0) {
    warningZones.push(`CAC ${inrFmt(cac)} breaches max allowable ${inrFmt(maxCac)} - thin safety margin`);
    score -= 15;
  } else if (cacUtilisation < 0.6) {
    strengths.push(`CAC efficiency excellent - only using ${pct(cacUtilisation)} of max allowable CAC`);
  } else {
    strengths.push(`CAC ${inrFmt(cac)} within allowable range`);
  }

  if (cm < 0.15) {
    criticalBreaches.push(`Contribution margin ${pct(cm)} is critically low - product economics unsustainable`);
    score -= 25;
  } else if (cm < 0.3) {
    warningZones.push(`Contribution margin ${pct(cm)} below 30% target - limits CAC tolerance`);
    score -= 12;
  } else if (cm >= 0.45) {
    strengths.push(`Premium contribution margin ${pct(cm)} - strong pricing power or lean ops`);
  } else {
    strengths.push(`Contribution margin ${pct(cm)} healthy`);
  }

  if (npm < 0) {
    criticalBreaches.push(`Net margin ${pct(npm)} - business is loss-making at current scale`);
    score -= 20;
  } else if (npm < 0.1) {
    warningZones.push(`Net margin ${pct(npm)} below 10% comfort zone`);
    score -= 8;
  } else if (npm >= 0.2) {
    strengths.push(`Net margin ${pct(npm)} - industry-leading profitability`);
  } else {
    strengths.push(`Net margin ${pct(npm)} above benchmark`);
  }

  if (Math.abs(allocation - 1) > 0.05) {
    warningZones.push(`Channel allocation at ${pct(allocation)} - projections are distorted until fixed to 100%`);
    score -= 5;
  }

  if (ctr > 0) {
    if (ctr < 0.01) {
      warningZones.push(`CTR ${pct(ctr)} - creative/audience mismatch; well below 2% benchmark`);
      score -= 6;
    } else if (ctr >= 0.04) {
      strengths.push(`CTR ${pct(ctr)} - creative resonance well above benchmark`);
    }
  }

  if (cvr > 0) {
    if (cvr < 0.01) {
      warningZones.push(`CVR ${pct(cvr)} - checkout or landing page friction; below 1.8% benchmark`);
      score -= 6;
    } else if (cvr >= 0.035) {
      strengths.push(`CVR ${pct(cvr)} - conversion funnel performing at top decile`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  let businessProfile: Diagnosis["businessProfile"];
  if (score >= 85) businessProfile = "dominant";
  else if (score >= 70) businessProfile = "scaling";
  else if (score >= 50) businessProfile = "growing";
  else if (score >= 30) businessProfile = "breakeven";
  else businessProfile = "struggling";

  let bottleneck: Diagnosis["bottleneck"] = "none";
  const breachScores = [
    { key: "roas" as const, severity: roasDelta < 0 ? Math.abs(roasDelta) * 20 : 0 },
    { key: "cac" as const, severity: cacUtilisation > 1 ? (cacUtilisation - 1) * 40 : 0 },
    { key: "margin" as const, severity: cmGap > 0 ? cmGap * 60 : 0 },
    { key: "allocation" as const, severity: Math.abs(allocation - 1) > 0.05 ? 5 : 0 }
  ];
  const worst = breachScores.sort((a, b) => b.severity - a.severity)[0];
  if (worst.severity > 0) bottleneck = worst.key;

  return {
    healthScore: score,
    criticalBreaches,
    warningZones,
    strengths,
    businessProfile,
    bottleneck,
    roasDelta,
    cacUtilisation,
    cmGap,
    npmGap,
    revenuePerOrder,
    effectiveCostPerClick,
    ctrBenchmarkDelta,
    cvrBenchmarkDelta
  };
}

function buildDeterministicInsights(
  report: CalculatedReport,
  dx: Diagnosis
): Omit<InsightPayload, "source" | "latencyMs"> {
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const cm = report.unitEconomics.contributionMarginPct;
  const npm = report.monthlyPnl.netProfitMarginPct;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const netRevenue = report.monthlyPnl.netRevenueMonth;
  const ctr = report.adMetrics.blendedCtr ?? 0;
  const cvr = report.adMetrics.blendedCvr ?? 0;

  const summaryMap: Record<Diagnosis["businessProfile"], string> = {
    struggling:
      `Business is in a critical state - ${dx.criticalBreaches.length} KPI breach(es) detected. Immediate intervention required before any budget movement. Stabilize unit economics and CAC guardrails this week.`,
    breakeven:
      `Operating at breakeven with ${dx.warningZones.length} active warning(s). The engine is not broken but it is not building equity either. Identify and fix the primary bottleneck (${dx.bottleneck}) before scaling.`,
    growing:
      `Fundamentals are directionally healthy. Primary risk is scaling spend before the ${dx.bottleneck === "none" ? "margin" : dx.bottleneck} is locked in. Protect profitability while expanding reach.`,
    scaling:
      `Strong operating posture - ROAS ${fmt(roas)}x, CM ${pct(cm)}, NPM ${pct(npm)}. Execute controlled 10-15% weekly budget steps and watch for efficiency decay.`,
    dominant:
      `Elite-tier economics. ROAS ${fmt(roas)}x with ${pct(cm)} contribution margin and ${pct(npm)} net profitability. Focus shifts to market capture velocity, LTV deepening, and defending efficiency as budgets scale.`
  };

  const priorityFixes: string[] = [];

  if (dx.bottleneck === "roas") {
    priorityFixes.push(
      `ROAS BREACH [P0]: Current ${fmt(roas)}x needs to reach 3.00x (+${fmt(3 - roas)}x gap). Pause bottom 25% of ad sets by spend-to-revenue ratio. Redirect budget to your top-3 performing creative/audience combos immediately.`
    );
  }
  if (dx.bottleneck === "cac" || dx.cacUtilisation > 1) {
    const overspend = Math.round(cac - maxCac);
    priorityFixes.push(
      `CAC BREACH [P0]: Spending ${inrFmt(overspend)} more per customer than unit economics allow. Set daily campaign-level CAC ceiling alerts at ${inrFmt(maxCac)}. Pause any ad set where 3-day rolling CAC > ${inrFmt(maxCac * 1.1)}.`
    );
  }
  if (dx.cmGap > 0) {
    priorityFixes.push(
      `MARGIN GAP [P1]: Contribution margin ${pct(cm)} is ${pct(dx.cmGap)} below the 30% floor. Audit fulfillment costs first - shipping + returns often hide 5-8% margin leakage in D2C. Then review COGS by SKU.`
    );
  }
  if (dx.npmGap > 0) {
    priorityFixes.push(
      `NET PROFIT [P1]: Margin at ${pct(npm)} vs 10% target. Use contribution margin (${inrFmt(report.unitEconomics.contributionMargin)}) to model breakeven orders before scaling spend.`
    );
  }
  if (Math.abs(report.scalePlanner.allocationTotalPct - 1) > 0.05) {
    priorityFixes.push(
      `ALLOCATION MISMATCH [P2]: Budget splits total ${pct(report.scalePlanner.allocationTotalPct)}. Scale projections are unreliable until this is corrected to exactly 100%. Fix before running any scenario modeling.`
    );
  }
  if (priorityFixes.length === 0) {
    priorityFixes.push(
      "PROTECT YOUR EDGE: All KPIs are healthy. The #1 risk is letting scale degrade efficiency. Set hard alerts - pause scale if ROAS drops below 3.5x for 3 consecutive days, or if weekly CAC rises more than 15%."
    );
  }

  const growthLevers: string[] = [];

  if (roas >= 3) {
    growthLevers.push(
      `BUDGET SCALING RUNWAY: ROAS ${fmt(roas)}x gives you room to scale. Apply 10-15% weekly budget increases on winning campaigns only. Never increase and change creatives simultaneously - isolate variables.`
    );
  }
  if (ctr < 0.02 && ctr > 0) {
    growthLevers.push(
      `CTR LIFT = FREE GROWTH: CTR at ${pct(ctr)} vs 2% benchmark. A 1% CTR improvement at current spend (${inrFmt(spend)}) means ~${Math.round((0.01 / Math.max(ctr, 0.001) - 1) * 100)}% more clicks with zero extra budget. Test 5 hooks in a creative sprint this week.`
    );
  } else if (ctr >= 0.02) {
    growthLevers.push(
      `CREATIVE ADVANTAGE: CTR ${pct(ctr)} is above benchmark. Systematize what is working - document the winning hook formula, brief 3 variants, and test before creative fatigue sets in (typically 2-3 weeks).`
    );
  }
  if (cvr < 0.018 && cvr > 0) {
    growthLevers.push(
      `CVR OPTIMIZATION: Conversion rate ${pct(cvr)} below 1.8% benchmark. A 0.5% CVR improvement at current traffic adds ~${inrFmt(0.005 * (revenue / Math.max(cvr, 0.001)))} in revenue. Test: (1) urgency/scarcity banner, (2) trust badges at checkout, (3) single-column mobile form.`
    );
  }
  growthLevers.push(
    `AOV LEVER: Current revenue/order is ${inrFmt(dx.revenuePerOrder)}. A 10% AOV lift reduces effective CAC by the same %. Test bundle offers at cart with >= ${inrFmt(dx.revenuePerOrder * 1.25)} threshold.`
  );
  growthLevers.push(
    "RETENTION FLYWHEEL: Every repeat customer has zero CAC. If repeat purchase rate is below 25%, build a post-purchase email/WhatsApp sequence: D+3 unboxing ask -> D+14 reorder nudge -> D+30 bundle offer."
  );

  const riskAlerts: string[] = [...dx.criticalBreaches];

  if (dx.effectiveCostPerClick > 10) {
    riskAlerts.push(
      `TRAFFIC COST INFLATION: CPC at ${inrFmt(dx.effectiveCostPerClick)} is elevated. If CPC rises 20%+ without CVR improvement, CAC will breach ceiling within 2-3 weeks even at current ROAS.`
    );
  }
  if (roas >= 3 && dx.cacUtilisation < 0.7) {
    riskAlerts.push(
      "UNDERINVESTMENT RISK: Healthy ROAS and low CAC utilization suggest you may be leaving growth on the table. Validate with a controlled spend lift of 15% for 7 days; if ROAS holds above 3x, this is a green light."
    );
  }
  riskAlerts.push(
    "CREATIVE FATIGUE WINDOW: High-performing creatives typically decay within 3-5 weeks on Meta. If you have not refreshed creatives in the last 2 weeks, ROAS degradation is the next risk."
  );
  if (riskAlerts.length < 3) {
    riskAlerts.push(
      "EFFICIENCY DECAY AT SCALE: Current metrics are strong, but larger budgets attract audience saturation. Monitor frequency - if average frequency crosses 3x on a cold audience, rotate creatives and expand targeting."
    );
  }

  const channelPlan: string[] = [
    `META: Run a 70/30 split - 70% budget on proven audiences (LAL 1-3%, warm retarget), 30% on cold broad to feed the funnel. Test one new creative angle per week with a fixed ${inrFmt(Math.round(spend * 0.05))} test budget; only graduate to scale if 3-day ROAS >= 3x.`,
    "GOOGLE: Separate brand and non-brand into distinct campaigns. Non-brand shopping is often the highest-intent purchase path in D2C - ensure your product feed is fully optimized (titles, images, price). Review search term reports weekly and add negatives.",
    `BUDGET GOVERNANCE: Set platform-level weekly CAC ceiling alerts. If any channel's 7-day CAC exceeds ${inrFmt(maxCac)}, freeze spend on that channel until root cause is identified.`,
    "ATTRIBUTION: Supplement platform-reported ROAS with self-reported attribution (ask customers how did you hear about us at checkout). Platform ROAS typically overstates by 20-40%."
  ];

  const experimentBacklog: string[] = [
    `HOOK TEST [WEEK 1]: Run 3 different video/static hooks on your best audience. Variables: problem-led hook vs result-led hook vs curiosity hook. Measure CTR at ${inrFmt(Math.round(spend * 0.03))} per variant - kill below 1.5% CTR after 3 days.`,
    "LANDING PAGE [WEEK 1-2]: A/B test two PDP variants - (A) current vs (B) with UGC/social proof block above the fold. Use Hotjar or Microsoft Clarity to identify scroll-drop-off points costing you CVR.",
    `OFFER ARCHITECTURE [WEEK 2]: Test free shipping threshold vs % discount on AOV. Hypothesis: Free shipping above ${inrFmt(dx.revenuePerOrder * 1.3)} converts better than 10% off for your price point. Run for 7 days with equal traffic.`,
    `POST-PURCHASE UPSELL [WEEK 3]: Implement a single post-checkout offer for your highest-margin SKU. Even a 5% take rate at ${inrFmt(dx.revenuePerOrder * 0.4)} adds meaningful monthly revenue with zero CAC.`,
    "RETENTION SEQUENCE [WEEK 3-4]: Build 3-email post-purchase flow. Email 1: D+3 usage tip + review ask. Email 2: D+14 complementary product recommendation. Email 3: D+30 loyalty offer."
  ];

  const cashflowActions: string[] = [
    "WEEKLY CONTRIBUTION REVIEW: Every Monday, calculate prior week's contribution after ads: Net Revenue - COGS - Fulfillment - Ad Spend. If this number is negative two weeks in a row, freeze all budget scaling until fixed.",
    `MEDIA CAP RULE: Set your monthly ad spend ceiling at a fixed % of net revenue, not an absolute number. A healthy D2C benchmark is 15-25% of net revenue. At ${inrFmt(netRevenue)} net revenue, your ceiling is ${inrFmt(netRevenue * 0.2)}-${inrFmt(netRevenue * 0.25)}.`,
    "INVENTORY TURNS: Scaling paid demand without inventory readiness creates stockouts. Maintain at least 45 days of top-SKU inventory before a budget step-up.",
    "PAYMENT TIMING: If using COD, model your actual cash cycle (order -> delivery -> collection -> bank) before scaling. COD at >30% of orders can create 2-3 week cash gaps."
  ];

  const next30Days: string[] = [];

  if (dx.businessProfile === "struggling" || dx.businessProfile === "breakeven") {
    next30Days.push(
      `WEEK 1 - STOP THE BLEED: Pause all campaigns with 7-day ROAS < 2x. Fix ${dx.bottleneck === "cac" ? "CAC overspend" : dx.bottleneck === "roas" ? "ROAS breach" : "margin gap"} before touching budgets.`
    );
    next30Days.push(
      "WEEK 2 - REBUILD FOUNDATION: Reactivate only your top 2-3 ad sets. Launch creative sprint with 5 new hook variants. Set daily KPI alerts."
    );
    next30Days.push(
      `WEEK 3 - VALIDATE RECOVERY: If ROAS >= 3x and CAC < ${inrFmt(maxCac)} for 7 consecutive days, you have the green light. Do not rush.`
    );
    next30Days.push(
      "WEEK 4 - CONTROLLED RE-ENTRY: Increase budgets by 10% only. Monitor daily. If efficiency holds, plan a 15% increase for week 5."
    );
  } else {
    next30Days.push(
      `WEEK 1 - LOCK IN WINS: Document exactly which campaigns, audiences, and creatives are driving your ${fmt(roas)}x ROAS. Create a do-not-touch policy for winning ad sets.`
    );
    next30Days.push(
      "WEEK 2 - SCALE TEST: Increase top-performing campaign budgets by 15%. Simultaneously launch 2 new landing page variants. Track daily ROAS decay rate."
    );
    next30Days.push(
      `WEEK 3 - EXPAND REACH: If week 2 efficiency held, expand to a new audience tier. Set CAC ceiling alert at ${inrFmt(maxCac * 1.05)}.`
    );
    next30Days.push(
      `WEEK 4 - CONSOLIDATE & PLAN: Review the month. If net margin held above ${pct(Math.max(npm, 0.12))}, plan next month's scale budget.`
    );
  }

  return {
    summary: summaryMap[dx.businessProfile],
    priorityFixes,
    growthLevers,
    riskAlerts: riskAlerts.slice(0, 6),
    channelPlan,
    experimentBacklog,
    cashflowActions,
    watchlistKpis: [
      `Blended ROAS: ${fmt(roas)}x -> Target >= 3.00x ${roas >= 3 ? "OK" : "NO"} (gap: ${fmt(Math.abs(3 - roas))}x)`,
      `Blended CAC: ${inrFmt(cac)} -> Max Allowable ${inrFmt(maxCac)} ${cac <= maxCac ? "OK" : "NO"} (utilization: ${pct(dx.cacUtilisation)})`,
      `Contribution Margin: ${pct(cm)} -> Target >= 30% ${cm >= 0.3 ? "OK" : "NO"}`,
      `Net Profit Margin: ${pct(npm)} -> Target >= 10% ${npm >= 0.1 ? "OK" : "NO"}`,
      `Health Score: ${dx.healthScore}/100 - ${dx.businessProfile.charAt(0).toUpperCase() + dx.businessProfile.slice(1)}`,
      `Scale Verdict: ${report.scalePlanner.readiness} | Primary Bottleneck: ${dx.bottleneck === "none" ? "None detected" : dx.bottleneck.toUpperCase()}`
    ],
    next30Days
  };
}

function buildGeminiPrompt(report: CalculatedReport, dx: Diagnosis, adMetrics: AdMetricsRow[] = []): string {
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const cm = report.unitEconomics.contributionMarginPct;
  const npm = report.monthlyPnl.netProfitMarginPct;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const ctr = report.adMetrics.blendedCtr ?? 0;
  const cvr = report.adMetrics.blendedCvr ?? 0;
  const netRevenue = report.monthlyPnl.netRevenueMonth;

  // Aggregate ad metrics by platform
  const platformStats = adMetrics.reduce((acc: any, m) => {
    if (!acc[m.platform]) {
      acc[m.platform] = { spend: 0, roas: 0, count: 0, campaigns: [] };
    }
    acc[m.platform].spend += m.spend || 0;
    acc[m.platform].roas += m.roas || 0;
    acc[m.platform].count++;
    acc[m.platform].campaigns.push(`${m.campaign_name} (${fmt(m.roas)}x)`);
    return acc;
  }, {});

  const platformContext =
    Object.entries(platformStats).length > 0
      ? Object.entries(platformStats)
          .map(
            ([platform, stats]: [string, any]) =>
              `\n${platform.toUpperCase()}:\n- Spend: INR ${Math.round(stats.spend).toLocaleString("en-IN")}\n- Avg ROAS: ${fmt(stats.roas / stats.count)}x\n- Campaigns: ${stats.campaigns.slice(0, 3).join(", ")}`
          )
          .join("\n")
      : "No connected ad accounts yet";

  return `You are a senior D2C growth operator and performance marketing strategist with 10+ years running paid media for Indian DTC brands on Meta and Google. You have managed brands from INR 10L to INR 10Cr monthly revenue. You think in unit economics, not vanity metrics.

## BUSINESS SNAPSHOT
- Health Score: ${dx.healthScore}/100 (${dx.businessProfile})
- Primary Bottleneck: ${dx.bottleneck === "none" ? "None - business is healthy" : dx.bottleneck.toUpperCase()}
- Critical Breaches: ${dx.criticalBreaches.length > 0 ? dx.criticalBreaches.join(" | ") : "None"}
- Warnings: ${dx.warningZones.length > 0 ? dx.warningZones.join(" | ") : "None"}
- Strengths: ${dx.strengths.join(" | ")}

## LIVE OPERATING DATA
\`\`\`
Blended ROAS:         ${fmt(roas)}x       (target >= 3.00x, delta: ${fmt(dx.roasDelta)}x)
Blended CAC:          INR ${Math.round(cac)}       (max allowable: INR ${Math.round(maxCac)}, utilization: ${pct(dx.cacUtilisation)})
Contribution Margin:  ${pct(cm)}          (target >= 30%, gap: ${pct(Math.abs(dx.cmGap))})
Net Profit Margin:    ${pct(npm)}          (target >= 10%, gap: ${pct(Math.abs(dx.npmGap))})
Total Ad Spend:       INR ${Math.round(spend).toLocaleString("en-IN")}
Total Revenue:        INR ${Math.round(revenue).toLocaleString("en-IN")}
Net Revenue:          INR ${Math.round(netRevenue).toLocaleString("en-IN")}
CTR:                  ${pct(ctr)}          (benchmark 2%, delta: ${pct(dx.ctrBenchmarkDelta)})
CVR:                  ${pct(cvr)}          (benchmark 1.8%, delta: ${pct(dx.cvrBenchmarkDelta)})
Revenue/Order:        INR ${Math.round(dx.revenuePerOrder).toLocaleString("en-IN")}
Cost/Click:           INR ${fmt(dx.effectiveCostPerClick)}
Scale Readiness:      ${report.scalePlanner.readiness}
\`\`\`

## CONNECTED AD PLATFORM PERFORMANCE
${platformContext}

## YOUR TASK
Generate insights that feel like a personal advisor reviewing their numbers, not a template. Consider connected ad account performance and recommend platform-specific optimizations.

Rules:
1. Every bullet must reference at least one actual number from the data above
2. Prioritize by business impact - what moves the needle most FIRST
3. Be direct about what is broken. Do not soften critical issues.
4. Prescribe exact actions (pause X, test Y at INR Z budget, set alert at N%)
5. Include platform-specific recommendations if ad accounts are connected
6. Each list: 4-6 bullets, operator-ready, 1-2 sentences max per bullet

Return ONLY strict JSON matching this exact shape (no markdown, no extra keys):
${JSON.stringify({
    summary: "2-3 sentence operator diagnosis of the business situation",
    priorityFixes: ["[LABEL]: specific action with numbers"],
    growthLevers: ["specific growth action referencing actual data"],
    riskAlerts: ["specific risk with trigger condition and number"],
    channelPlan: ["specific channel action with budget/metric reference"],
    experimentBacklog: ["specific test with hypothesis and success metric"],
    cashflowActions: ["specific cashflow or ops action with number"],
    watchlistKpis: ["KPI: value -> target status delta"],
    next30Days: ["WEEK N - LABEL: specific action plan"]
  })}`;
}

function mergeInsights(
  base: Omit<InsightPayload, "source" | "latencyMs">,
  model: Omit<InsightPayload, "source" | "latencyMs"> | null
): Omit<InsightPayload, "source" | "latencyMs"> {
  if (!model) return base;
  return {
    summary: model.summary?.length > 60 ? model.summary : base.summary,
    priorityFixes: model.priorityFixes.length >= 2 ? model.priorityFixes : base.priorityFixes,
    growthLevers: model.growthLevers.length >= 2 ? model.growthLevers : base.growthLevers,
    riskAlerts: model.riskAlerts.length >= 2 ? model.riskAlerts : base.riskAlerts,
    channelPlan: model.channelPlan.length >= 2 ? model.channelPlan : base.channelPlan,
    experimentBacklog: model.experimentBacklog.length >= 2 ? model.experimentBacklog : base.experimentBacklog,
    cashflowActions: model.cashflowActions.length >= 2 ? model.cashflowActions : base.cashflowActions,
    watchlistKpis: model.watchlistKpis.length >= 2 ? model.watchlistKpis : base.watchlistKpis,
    next30Days: model.next30Days.length >= 2 ? model.next30Days : base.next30Days
  };
}

function parseModelInsights(raw: string): Omit<InsightPayload, "source" | "latencyMs"> | null {
  const extract = (text: string): ModelInsights | null => {
    try {
      return JSON.parse(text) as ModelInsights;
    } catch {
      return null;
    }
  };

  let parsed = extract(raw);
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = extract(raw.slice(start, end + 1));
  }
  if (!parsed || typeof parsed.summary !== "string") return null;

  return {
    summary: parsed.summary.trim(),
    priorityFixes: sanitizeList(parsed.priorityFixes),
    growthLevers: sanitizeList(parsed.growthLevers),
    riskAlerts: sanitizeList(parsed.riskAlerts),
    channelPlan: sanitizeList(parsed.channelPlan),
    experimentBacklog: sanitizeList(parsed.experimentBacklog),
    cashflowActions: sanitizeList(parsed.cashflowActions),
    watchlistKpis: sanitizeList(parsed.watchlistKpis),
    next30Days: sanitizeList(parsed.next30Days)
  };
}

async function callGemini(apiKey: string, model: string, prompt: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (!apiKey) return null;
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1800,
        responseMimeType: "application/json"
      }
    };
    const baseUrl = "https://generativelanguage.googleapis.com";
    const modelPath = `/models/${model.replace(/^models\//, "")}:generateContent?key=${apiKey}`;

    let res = await fetch(`${baseUrl}/v1beta${modelPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${baseUrl}/v1${modelPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateInsights(report: CalculatedReport, adMetrics: AdMetricsRow[] = []): Promise<InsightPayload> {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY || "";
  const rawModel = process.env.GEMINI_MODEL || "";
  const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

  const dx = diagnose(report);
  const deterministic = buildDeterministicInsights(report, dx);

  const prompt = buildGeminiPrompt(report, dx, adMetrics);
  if (!apiKey || !rawModel) {
    return {
      ...deterministic,
      source: "fallback",
      latencyMs: Date.now() - startedAt
    };
  }

  const raw = await callGemini(apiKey, model, prompt, timeoutMs);
  const parsed = raw ? parseModelInsights(raw) : null;

  if (parsed) {
    return {
      ...mergeInsights(deterministic, parsed),
      source: "gemini",
      latencyMs: Date.now() - startedAt
    };
  }

  if (raw) {
    const repairPrompt = `Convert the following text into strict JSON only. No markdown. Use the same output shape as requested.\nText: ${raw}`;
    const repairedRaw = await callGemini(apiKey, model, repairPrompt, timeoutMs);
    const repaired = repairedRaw ? parseModelInsights(repairedRaw) : null;
    if (repaired) {
      return {
        ...mergeInsights(deterministic, repaired),
        source: "gemini",
        latencyMs: Date.now() - startedAt
      };
    }
  }

  return {
    ...deterministic,
    source: "fallback",
    latencyMs: Date.now() - startedAt
  };
}
