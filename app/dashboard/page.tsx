"use client";

import { useEffect, useState } from "react";
import type { CalculatedReport } from "@/lib/types/domain";
import { KpiCard } from "@/components/dashboard/KpiCard";

function inr(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="grid grid-3">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [report, setReport] = useState<CalculatedReport | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsRequested, setInsightsRequested] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("report");
    if (raw) {
      try {
        setReport(JSON.parse(raw));
      } catch {
        setReport(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!report) return;

    const hasFinalInsights = report.insights.source !== "pending";

    if (hasFinalInsights || insightsLoading || insightsRequested) return;

    let cancelled = false;
    setInsightsLoading(true);
    setInsightsRequested(true);

    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((insights) => {
        if (cancelled || !insights) return;
        setReport((prev) => {
          if (!prev) return prev;
          const next = { ...prev, insights };
          sessionStorage.setItem("report", JSON.stringify(next));
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [report, insightsLoading, insightsRequested]);

  if (!report) {
    return (
      <main className="main">
        <div className="card">
          <h2>No report loaded</h2>
          <p className="muted">Upload a file first from the upload page.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="main grid" style={{ gap: 18 }}>
      <div className="card">
        <h1>Performance Overview</h1>
        <p className="muted">Computed from your uploaded sheet</p>
      </div>

      <section className="grid grid-3">
        <KpiCard title="Blended ROAS" value={report.adMetrics.blendedRoas.toFixed(2) + "x"} />
        <KpiCard title="Blended CAC" value={inr(report.adMetrics.blendedCac)} />
        <KpiCard title="Contribution Margin" value={pct(report.unitEconomics.contributionMarginPct)} />
      </section>

      <SectionBlock title="Unit Economics">
        <KpiCard title="Net Revenue / Order" value={inr(report.unitEconomics.netRevenueExGst)} />
        <KpiCard title="Total COGS / Order" value={inr(report.unitEconomics.totalCogs)} />
        <KpiCard title="Fulfillment / Order" value={inr(report.unitEconomics.fulfillmentCost)} />
        <KpiCard title="Gross Margin / Order" value={inr(report.unitEconomics.grossMargin)} />
        <KpiCard title="Contribution / Order" value={inr(report.unitEconomics.contributionMargin)} />
        <KpiCard title="Max Allowable CAC" value={inr(report.unitEconomics.maxAllowableCac)} />
      </SectionBlock>

      <SectionBlock title="Ad Metrics">
        <KpiCard title="Total Ad Spend" value={inr(report.adMetrics.totalAdSpend)} />
        <KpiCard title="Ad Revenue" value={inr(report.adMetrics.totalRevenue)} />
        <KpiCard title="Orders" value={String(report.adMetrics.totalOrders)} />
        <KpiCard title="CTR" value={pct(report.adMetrics.blendedCtr)} />
        <KpiCard title="CVR" value={pct(report.adMetrics.blendedCvr)} />
        <KpiCard title="CPC / CPM" value={`${inr(report.adMetrics.cpc)} / ${inr(report.adMetrics.cpm)}`} />
      </SectionBlock>

      <SectionBlock title="Agency Fee">
        <KpiCard title="Growth Stage" value={report.agencyFee.growthStage} />
        <KpiCard title="Recommended Fee" value={inr(report.agencyFee.recommendedFee)} />
        <KpiCard title="Break-even ROAS" value={report.agencyFee.breakevenRoasWithAgency.toFixed(2) + "x"} />
        <KpiCard title="Fee as % Revenue" value={pct(report.agencyFee.asPctRevenue)} />
        <KpiCard title="Fee as % Ad Spend" value={pct(report.agencyFee.asPctAdSpend)} />
        <KpiCard title="Model (Hybrid)" value={inr(report.agencyFee.hybridFee)} />
      </SectionBlock>

      <SectionBlock title="Scale Planner">
        <KpiCard title="Target Revenue" value={inr(report.scalePlanner.targetRevenue)} />
        <KpiCard title="Target Ad Spend" value={inr(report.scalePlanner.targetAdSpend)} />
        <KpiCard title="Target Orders" value={String(report.scalePlanner.targetOrders)} />
        <KpiCard title="Target CAC" value={inr(report.scalePlanner.targetCac)} />
        <KpiCard title="Budget Meta/Google/Other" value={`${inr(report.scalePlanner.budgetMeta)} / ${inr(report.scalePlanner.budgetGoogle)} / ${inr(report.scalePlanner.budgetOther)}`} />
        <KpiCard title="Scale Readiness" value={report.scalePlanner.readiness} />
      </SectionBlock>

      <SectionBlock title="Monthly P&L">
        <KpiCard title="Net Revenue" value={inr(report.monthlyPnl.netRevenueMonth)} />
        <KpiCard title="COGS" value={inr(report.monthlyPnl.cogsMonth)} />
        <KpiCard title="Fulfillment" value={inr(report.monthlyPnl.fulfillmentMonth)} />
        <KpiCard title="Contribution" value={inr(report.monthlyPnl.contributionMonth)} />
        <KpiCard title="Marketing Cost" value={inr(report.monthlyPnl.marketingMonth)} />
        <KpiCard title="Net Profit Margin" value={pct(report.monthlyPnl.netProfitMarginPct)} />
      </SectionBlock>

      <div className="card">
        <h3>AI Insights</h3>
        {insightsLoading ? <p className="muted">Generating insights...</p> : null}
        {!insightsLoading ? (
          <p className="muted">
            Source: {report.insights.source} | Latency: {report.insights.latencyMs}ms
          </p>
        ) : null}
        <textarea readOnly value={report.insights.summary + "\n\nPriority fixes:\n- " + report.insights.priorityFixes.join("\n- ")} />
      </div>
    </main>
  );
}
