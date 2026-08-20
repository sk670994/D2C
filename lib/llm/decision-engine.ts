import type { CalculatedReport } from "@/lib/types/domain";

export type ActionItem = {
  priority: "critical" | "high" | "medium" | "low";
  category: "pause" | "pause-audience" | "reduce-spend" | "increase-spend" | "change-creative" | "expand-audience" | "improve-landing" | "test-new-angle";
  title: string;
  description: string;
  expectedImpact: string;
  estimatedWeeklyRevenue?: number;
  estimatedWeeklyLoss?: number;
};

export type OpportunityScan = {
  score: number; // 0-100
  trend: "critical" | "warning" | "healthy" | "excellent";
  breakdown: {
    roas: { score: number; status: string };
    cac: { score: number; status: string };
    margin: { score: number; status: string };
    spend: { score: number; status: string };
    volume: { score: number; status: string };
  };
  todayActions: ActionItem[];
  thisWeekActions: ActionItem[];
  opportunityRank: {
    label: string;
    nextMilestone: string;
  };
};

export type MoneyAlert = {
  type: "losing-money" | "low-efficiency" | "high-risk" | "opportunity" | "good-news";
  severity: "critical" | "warning" | "info" | "success";
  headline: string;
  message: string;
  metric: string;
  currentValue: string;
  threshold: string;
  action?: string;
  weeklyImpact?: number;
};

/**
 * Core Decision Engine: Converts metrics → actions
 */
export function generateDecisions(report: CalculatedReport): OpportunityScan {
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const cm = report.unitEconomics.contributionMarginPct;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const orders = report.adMetrics.totalOrders || 1;
  const ctr = report.adMetrics.blendedCtr || 0;
  const cvr = report.adMetrics.blendedCvr || 0;
  const cpc = report.adMetrics.cpc || 0;

  // Calculate scores (0-100)
  const roasScore = calculateRoasScore(roas);
  const cacScore = calculateCacScore(cac, maxCac);
  const marginScore = calculateMarginScore(cm);
  const spendScore = calculateSpendScore(spend, revenue);
  const volumeScore = calculateVolumeScore(orders, spend);

  const overallScore = Math.round(
    (roasScore * 0.35 + cacScore * 0.25 + marginScore * 0.2 + spendScore * 0.1 + volumeScore * 0.1)
  );

  // Determine trend
  const trend = overallScore >= 80 ? "excellent" : overallScore >= 60 ? "healthy" : overallScore >= 40 ? "warning" : "critical";

  // Generate actions
  const todayActions = generateTodayActions(report);
  const thisWeekActions = generateWeekActions(report);

  // Opportunity ranking
  const opportunityRank = rankOpportunity(roas, cac, maxCac, spend, revenue);

  return {
    score: overallScore,
    trend,
    breakdown: {
      roas: { score: roasScore, status: roasStatusText(roas) },
      cac: { score: cacScore, status: cacStatusText(cac, maxCac) },
      margin: { score: marginScore, status: marginStatusText(cm) },
      spend: { score: spendScore, status: spendStatusText(spend, revenue) },
      volume: { score: volumeScore, status: volumeStatusText(orders) },
    },
    todayActions,
    thisWeekActions,
    opportunityRank,
  };
}

/**
 * Generate critical actions for today
 */
function generateTodayActions(report: CalculatedReport): ActionItem[] {
  const actions: ActionItem[] = [];
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const ctr = report.adMetrics.blendedCtr || 0;
  const cvr = report.adMetrics.blendedCvr || 0;

  // Critical: ROAS below breakeven
  if (roas < 1.5) {
    actions.push({
      priority: "critical",
      category: "pause",
      title: "🚨 PAUSE ALL CAMPAIGNS",
      description: `ROAS is ${roas.toFixed(2)}x - below breakeven. Every rupee spent loses money.`,
      expectedImpact: "Stop daily losses immediately",
      estimatedWeeklyLoss: (spend / 7) * (1 - roas),
    });
  }

  // High: ROAS below 2.5x but above breakeven
  if (roas >= 1.5 && roas < 2.5) {
    actions.push({
      priority: "high",
      category: "reduce-spend",
      title: "⚠️ REDUCE SPEND by 40%",
      description: `ROAS ${roas.toFixed(2)}x is low. Reduce spend to optimize CAC.`,
      expectedImpact: `Improve unit economics, test creative alternatives`,
      estimatedWeeklyRevenue: (revenue / 7) * 0.6,
    });
  }

  // High: CAC above max allowable
  if (cac > maxCac * 1.2) {
    actions.push({
      priority: "high",
      category: "pause-audience",
      title: "📍 PAUSE HIGH-CAC AUDIENCES",
      description: `CAC ₹${Math.round(cac)} exceeds max allowable ₹${Math.round(maxCac)} by 20%+`,
      expectedImpact: "Reduce customer acquisition cost",
    });
  }

  // Medium: Low CTR
  if (ctr < 0.008) {
    actions.push({
      priority: "medium",
      category: "change-creative",
      title: "🎬 REFRESH AD CREATIVE",
      description: `CTR ${(ctr * 100).toFixed(2)}% is weak. Audience is not engaging.`,
      expectedImpact: "Improve CTR by 40-60% with fresh hooks",
    });
  }

  // Medium: Low CVR
  if (cvr < 0.01) {
    actions.push({
      priority: "medium",
      category: "improve-landing",
      title: "🛑 FIX LANDING PAGE",
      description: `Conversion rate ${(cvr * 100).toFixed(2)}% is low. Visitors not buying.`,
      expectedImpact: "Improve CVR by 30-50% with better UX",
    });
  }

  return actions.slice(0, 3);
}

/**
 * Generate week-long actions
 */
function generateWeekActions(report: CalculatedReport): ActionItem[] {
  const actions: ActionItem[] = [];
  const roas = report.adMetrics.blendedRoas;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const orders = report.adMetrics.totalOrders || 1;

  // Opportunity: Scale if ROAS >= 3.5x
  if (roas >= 3.5) {
    const potentialSpend = spend * 1.3;
    const potentialRevenue = potentialSpend * roas;
    actions.push({
      priority: "high",
      category: "increase-spend",
      title: "📈 SCALE BUDGET by 30%",
      description: `ROAS ${roas.toFixed(2)}x is excellent. Safe to scale.`,
      expectedImpact: `Add ₹${Math.round(spend * 0.3 / 7)}/day, expect ${Math.round((potentialRevenue - revenue) / 7)}/day revenue`,
      estimatedWeeklyRevenue: potentialRevenue,
    });
  }

  // Opportunity: Test new audience if volume < threshold
  if (orders < 50) {
    actions.push({
      priority: "medium",
      category: "expand-audience",
      title: "🎯 TEST NEW AUDIENCE SEGMENTS",
      description: `Low volume (${orders} orders/period). Expand reach to new segments.`,
      expectedImpact: "2-3x volume growth potential",
    });
  }

  // Opportunity: A/B test if ROAS 2.5-3.5x
  if (roas >= 2.5 && roas < 3.5) {
    actions.push({
      priority: "medium",
      category: "test-new-angle",
      title: "🧪 A/B TEST NEW ANGLES",
      description: `ROAS ${roas.toFixed(2)}x is good. Test new hooks to break through to 4x+`,
      expectedImpact: "Discover next-level creative",
    });
  }

  return actions.slice(0, 3);
}

/**
 * Generate money alerts
 */
export function generateMoneyAlerts(report: CalculatedReport): MoneyAlert[] {
  const alerts: MoneyAlert[] = [];
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const spend = report.adMetrics.totalAdSpend;
  const revenue = report.adMetrics.totalRevenue;
  const cm = report.unitEconomics.contributionMarginPct;
  const orders = report.adMetrics.totalOrders || 1;

  // Critical: Losing money
  if (roas < 1.5 && spend > 5000) {
    const dailyLoss = (spend / 30) * (1 - roas);
    alerts.push({
      type: "losing-money",
      severity: "critical",
      headline: "🚨 LOSING MONEY DAILY",
      message: `You are spending ₹${Math.round(spend / 30)}/day but losing ₹${Math.round(dailyLoss)}/day. Pause campaigns immediately.`,
      metric: "Daily Loss",
      currentValue: `₹${Math.round(dailyLoss)}`,
      threshold: `₹0 (breakeven)`,
      action: "Pause all campaigns and audit creative",
      weeklyImpact: -dailyLoss * 7,
    });
  }

  // Warning: Low efficiency
  if (roas >= 1.5 && roas < 2.5) {
    alerts.push({
      type: "low-efficiency",
      severity: "warning",
      headline: "⚠️ LOW EFFICIENCY",
      message: `ROAS ${roas.toFixed(2)}x is below 2.5x minimum. Revenue growth is limited.`,
      metric: "ROAS",
      currentValue: roas.toFixed(2) + "x",
      threshold: "2.5x",
    });
  }

  // Warning: CAC too high
  if (cac > maxCac) {
    alerts.push({
      type: "high-risk",
      severity: "warning",
      headline: "⚠️ CAC EXCEEDS BUDGET",
      message: `Customer acquisition cost ₹${Math.round(cac)} exceeds your max ₹${Math.round(maxCac)}. Profitability at risk.`,
      metric: "CAC vs Max",
      currentValue: `₹${Math.round(cac)}`,
      threshold: `₹${Math.round(maxCac)}`,
    });
  }

  // Opportunity: High ROAS
  if (roas >= 4.0) {
    alerts.push({
      type: "opportunity",
      severity: "info",
      headline: "✅ ELITE PERFORMANCE",
      message: `ROAS ${roas.toFixed(2)}x is top-quartile. Safe to scale budget by 30-50%.`,
      metric: "ROAS",
      currentValue: roas.toFixed(2) + "x",
      threshold: "3.5x",
    });
  }

  // Good news: Margin healthy
  if (cm > 0.35) {
    alerts.push({
      type: "good-news",
      severity: "success",
      headline: "🎉 MARGINS STRONG",
      message: `Contribution margin ${(cm * 100).toFixed(1)}% is healthy. Room to invest in growth.`,
      metric: "Contribution Margin",
      currentValue: `${(cm * 100).toFixed(1)}%`,
      threshold: "30%",
    });
  }

  return alerts;
}

// ============= SCORING FUNCTIONS =============

function calculateRoasScore(roas: number): number {
  if (roas >= 5.0) return 100;
  if (roas >= 3.5) return 90;
  if (roas >= 2.5) return 70;
  if (roas >= 1.5) return 40;
  if (roas >= 1.0) return 20;
  return 0;
}

function calculateCacScore(cac: number, maxCac: number): number {
  if (maxCac === 0) return 50;
  const ratio = cac / maxCac;
  if (ratio <= 0.7) return 100;
  if (ratio <= 0.9) return 80;
  if (ratio <= 1.1) return 60;
  if (ratio <= 1.3) return 30;
  return 0;
}

function calculateMarginScore(cm: number): number {
  if (cm >= 0.4) return 100;
  if (cm >= 0.3) return 80;
  if (cm >= 0.2) return 60;
  if (cm >= 0.1) return 30;
  return 0;
}

function calculateSpendScore(spend: number, revenue: number): number {
  if (spend === 0) return 50;
  const ratio = revenue / spend;
  if (ratio >= 4.0) return 100;
  if (ratio >= 2.5) return 80;
  if (ratio >= 1.5) return 60;
  if (ratio >= 1.0) return 30;
  return 0;
}

function calculateVolumeScore(orders: number, spend: number): number {
  if (orders < 20) return 30;
  if (orders < 50) return 50;
  if (orders < 150) return 70;
  if (orders >= 300) return 100;
  return 80;
}

function roasStatusText(roas: number): string {
  if (roas >= 5.0) return "Elite (5x+)";
  if (roas >= 3.5) return "Strong (3.5x+)";
  if (roas >= 2.5) return "Good (2.5x+)";
  if (roas >= 1.5) return "Poor (1.5x)";
  return "Losing Money";
}

function cacStatusText(cac: number, maxCac: number): string {
  if (maxCac === 0) return "Unknown";
  const ratio = cac / maxCac;
  if (ratio <= 0.7) return "Excellent (70% under)";
  if (ratio <= 1.0) return "On Budget";
  if (ratio <= 1.2) return "Over 10-20%";
  return "Over 30%";
}

function marginStatusText(cm: number): string {
  if (cm >= 0.4) return "Strong (40%+)";
  if (cm >= 0.3) return "Healthy (30%+)";
  if (cm >= 0.2) return "Moderate (20%+)";
  return "Weak (< 20%)";
}

function spendStatusText(spend: number, revenue: number): string {
  if (spend === 0) return "No data";
  const ratio = revenue / spend;
  if (ratio >= 4.0) return "Excellent ROI";
  if (ratio >= 2.5) return "Strong ROI";
  if (ratio >= 1.5) return "Healthy ROI";
  return "Low ROI";
}

function volumeStatusText(orders: number): string {
  if (orders < 20) return "Very Low";
  if (orders < 50) return "Low";
  if (orders < 150) return "Moderate";
  if (orders >= 300) return "High";
  return "Good";
}

function rankOpportunity(roas: number, cac: number, maxCac: number, spend: number, revenue: number) {
  if (roas < 1.5) {
    return {
      label: "🔴 CRISIS",
      nextMilestone: "Fix creative → reach 1.5x ROAS",
    };
  }
  if (roas < 2.5) {
    return {
      label: "🟠 OPTIMIZE",
      nextMilestone: "Reduce CAC → reach 2.5x ROAS",
    };
  }
  if (roas < 3.5) {
    return {
      label: "🟡 GROW",
      nextMilestone: "Test new angles → reach 3.5x ROAS",
    };
  }
  if (roas < 5.0) {
    return {
      label: "🟢 SCALING",
      nextMilestone: "Increase budget safely → reach 5x ROAS",
    };
  }
  return {
    label: "🟢 DOMINANT",
    nextMilestone: "Maintain excellence, test new markets",
  };
}
