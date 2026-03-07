"use client";

import { useEffect, useState } from "react";
import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";
import { calculateReport } from "@/lib/calc/report";

const sectionOptions = [
  { id: "all", label: "All Sections" },
  { id: "unit", label: "Unit Economics" },
  { id: "ad", label: "Ad Metrics" },
  { id: "agency", label: "Agency Fee" },
  { id: "scale", label: "Scale Planner" },
  { id: "pnl", label: "Monthly P&L" }
] as const;

type SectionId = (typeof sectionOptions)[number]["id"];

function inr(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="muted">{title}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function SectionRail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="scroll-rail">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [report, setReport] = useState<CalculatedReport | null>(null);
  const [reportInput, setReportInput] = useState<ParsedReport | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<SectionId>("all");
  const [recalcLoading, setRecalcLoading] = useState(false);

  function updateInsights(next: CalculatedReport["insights"]) {
    setReport((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, insights: next };
      sessionStorage.setItem("report", JSON.stringify(merged));
      return merged;
    });
  }

  useEffect(() => {
    const reportRaw = sessionStorage.getItem("report");
    const inputRaw = sessionStorage.getItem("reportInput");

    if (reportRaw) {
      try {
        const parsed = JSON.parse(reportRaw) as Partial<CalculatedReport>;
        const normalized = {
          ...parsed,
          insights: {
            summary: parsed.insights?.summary ?? "Insights not generated yet",
            priorityFixes: parsed.insights?.priorityFixes ?? [],
            source: parsed.insights?.source ?? "pending",
            latencyMs: parsed.insights?.latencyMs ?? 0
          }
        } as CalculatedReport;
        setReport(normalized);
      } catch {
        setReport(null);
      }
    }

    if (inputRaw) {
      try {
        setReportInput(JSON.parse(inputRaw) as ParsedReport);
      } catch {
        setReportInput(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!report) return;
    if (report.insights.source !== "pending") return;

    let cancelled = false;
    setInsightsLoading(true);
    setInsightsError(null);

    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    })
      .then((res) => {
        if (!res.ok) throw new Error("Insights API failed");
        return res.json();
      })
      .then((insights) => {
        if (cancelled || !insights) return;
        updateInsights(insights);
      })
      .catch((err) => {
        if (cancelled) return;
        setInsightsError(err instanceof Error ? err.message : "Unable to generate insights");
        updateInsights({
          summary: "Insights could not be generated in time. Click Retry Insights.",
          priorityFixes: ["Retry insights, then verify Ollama model availability and timeout settings."],
          source: "fallback",
          latencyMs: 0
        });
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [report]);

  if (!report || !reportInput) {
    return (
      <main className="main">
        <div className="card">
          <h2>No report loaded</h2>
          <p className="muted">Upload a file first from the upload page.</p>
        </div>
      </main>
    );
  }

  async function recalculateFromInput() {
    if (!reportInput) return;
    setRecalcLoading(true);
    try {
      const calcJson = calculateReport(reportInput);
      const reset = {
        ...calcJson,
        insights: {
          summary: "Insights not generated yet",
          priorityFixes: [] as string[],
          source: "pending" as const,
          latencyMs: 0
        }
      };
      setReport(reset);
      sessionStorage.setItem("report", JSON.stringify(reset));
      sessionStorage.setItem("reportInput", JSON.stringify(reportInput));
    } finally {
      setRecalcLoading(false);
    }
  }

  function updateNumber(path: string, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;

    setReportInput((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const keys = path.split(".");
      let ref: unknown = next;

      for (let i = 0; i < keys.length - 1; i += 1) {
        ref = (ref as Record<string, unknown>)[keys[i]];
      }

      (ref as Record<string, unknown>)[keys[keys.length - 1]] = n;
      return next;
    });
  }

  function renderSection(id: SectionId, data: CalculatedReport) {
    if (id === "unit") {
      return (
        <SectionRail title="Unit Economics">
          <MetricCard title="Net Revenue / Order" value={inr(data.unitEconomics.netRevenueExGst)} />
          <MetricCard title="Total COGS / Order" value={inr(data.unitEconomics.totalCogs)} />
          <MetricCard title="Fulfillment / Order" value={inr(data.unitEconomics.fulfillmentCost)} />
          <MetricCard title="Gross Margin / Order" value={inr(data.unitEconomics.grossMargin)} />
          <MetricCard title="Contribution / Order" value={inr(data.unitEconomics.contributionMargin)} />
          <MetricCard title="Max Allowable CAC" value={inr(data.unitEconomics.maxAllowableCac)} />
        </SectionRail>
      );
    }

    if (id === "ad") {
      return (
        <SectionRail title="Ad Metrics">
          <MetricCard title="Total Ad Spend" value={inr(data.adMetrics.totalAdSpend)} />
          <MetricCard title="Ad Revenue" value={inr(data.adMetrics.totalRevenue)} />
          <MetricCard title="Orders" value={String(data.adMetrics.totalOrders)} />
          <MetricCard title="Blended ROAS" value={`${data.adMetrics.blendedRoas.toFixed(2)}x`} />
          <MetricCard title="CTR" value={pct(data.adMetrics.blendedCtr)} />
          <MetricCard title="CVR" value={pct(data.adMetrics.blendedCvr)} />
          <MetricCard title="CPC" value={inr(data.adMetrics.cpc)} />
          <MetricCard title="CPM" value={inr(data.adMetrics.cpm)} />
        </SectionRail>
      );
    }

    if (id === "agency") {
      return (
        <SectionRail title="Agency Fee">
          <MetricCard title="Growth Stage" value={data.agencyFee.growthStage} />
          <MetricCard title="Recommended Fee" value={inr(data.agencyFee.recommendedFee)} />
          <MetricCard title="Break-even ROAS" value={`${data.agencyFee.breakevenRoasWithAgency.toFixed(2)}x`} />
          <MetricCard title="Fee % of Revenue" value={pct(data.agencyFee.asPctRevenue)} />
          <MetricCard title="Fee % of Ad Spend" value={pct(data.agencyFee.asPctAdSpend)} />
          <MetricCard title="Hybrid Fee" value={inr(data.agencyFee.hybridFee)} />
        </SectionRail>
      );
    }

    if (id === "scale") {
      return (
        <SectionRail title="Scale Planner">
          <MetricCard title="Target Revenue" value={inr(data.scalePlanner.targetRevenue)} />
          <MetricCard title="Target Ad Spend" value={inr(data.scalePlanner.targetAdSpend)} />
          <MetricCard title="Target Orders" value={String(data.scalePlanner.targetOrders)} />
          <MetricCard title="Target CAC" value={inr(data.scalePlanner.targetCac)} />
          <MetricCard title="Meta Budget" value={inr(data.scalePlanner.budgetMeta)} />
          <MetricCard title="Google Budget" value={inr(data.scalePlanner.budgetGoogle)} />
          <MetricCard title="Other Budget" value={inr(data.scalePlanner.budgetOther)} />
          <MetricCard title="Readiness" value={data.scalePlanner.readiness} />
        </SectionRail>
      );
    }

    return (
      <SectionRail title="Monthly P&L">
        <MetricCard title="Net Revenue" value={inr(data.monthlyPnl.netRevenueMonth)} />
        <MetricCard title="COGS" value={inr(data.monthlyPnl.cogsMonth)} />
        <MetricCard title="Fulfillment" value={inr(data.monthlyPnl.fulfillmentMonth)} />
        <MetricCard title="Contribution" value={inr(data.monthlyPnl.contributionMonth)} />
        <MetricCard title="Marketing Cost" value={inr(data.monthlyPnl.marketingMonth)} />
        <MetricCard title="Net Profit Margin" value={pct(data.monthlyPnl.netProfitMarginPct)} />
      </SectionRail>
    );
  }

  return (
    <main className="main grid" style={{ gap: 18 }}>
      <div className="card">
        <h1>Performance Dashboard</h1>
        <p className="muted">Dynamic dashboard with editable what-if controls.</p>
      </div>

      <div className="card grid" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Tool Selector + Editable Inputs</h3>
        <div className="toolbar">
          <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value as SectionId)}>
            {sectionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <button type="button" onClick={recalculateFromInput} disabled={recalcLoading}>
            {recalcLoading ? "Recalculating..." : "Apply Changes"}
          </button>
        </div>

        <div className="editor-grid">
          <label>MRP <input type="number" value={reportInput.unitEconomicsInput.sellingPrice} onChange={(e) => updateNumber("unitEconomicsInput.sellingPrice", e.target.value)} /></label>
          <label>Discount <input type="number" value={reportInput.unitEconomicsInput.discount} onChange={(e) => updateNumber("unitEconomicsInput.discount", e.target.value)} /></label>
          <label>Ad Spend <input type="number" value={reportInput.adMetricsInput.totalAdSpend} onChange={(e) => updateNumber("adMetricsInput.totalAdSpend", e.target.value)} /></label>
          <label>Ad Revenue <input type="number" value={reportInput.adMetricsInput.revenue} onChange={(e) => updateNumber("adMetricsInput.revenue", e.target.value)} /></label>
          <label>Orders <input type="number" value={reportInput.adMetricsInput.orders} onChange={(e) => updateNumber("adMetricsInput.orders", e.target.value)} /></label>
          <label>Revenue Growth % <input type="number" step="0.01" value={reportInput.scalePlannerInput.revenueGrowthTargetPct} onChange={(e) => updateNumber("scalePlannerInput.revenueGrowthTargetPct", e.target.value)} /></label>
          <label>Ad Spend Growth % <input type="number" step="0.01" value={reportInput.scalePlannerInput.adSpendGrowthTargetPct} onChange={(e) => updateNumber("scalePlannerInput.adSpendGrowthTargetPct", e.target.value)} /></label>
          <label>Meta Allocation % <input type="number" step="0.01" value={reportInput.scalePlannerInput.allocationMetaPct} onChange={(e) => updateNumber("scalePlannerInput.allocationMetaPct", e.target.value)} /></label>
          <label>Google Allocation % <input type="number" step="0.01" value={reportInput.scalePlannerInput.allocationGooglePct} onChange={(e) => updateNumber("scalePlannerInput.allocationGooglePct", e.target.value)} /></label>
          <label>Other Allocation % <input type="number" step="0.01" value={reportInput.scalePlannerInput.allocationOtherPct} onChange={(e) => updateNumber("scalePlannerInput.allocationOtherPct", e.target.value)} /></label>
        </div>
      </div>

      {selectedSection === "all" ? (
        <>
          {renderSection("unit", report)}
          {renderSection("ad", report)}
          {renderSection("agency", report)}
          {renderSection("scale", report)}
          {renderSection("pnl", report)}
        </>
      ) : (
        renderSection(selectedSection, report)
      )}

      <div className="card">
        <h3>AI Insights</h3>
        {insightsLoading ? <p className="muted">Generating insights...</p> : null}
        {insightsError ? <p style={{ color: "crimson" }}>{insightsError}</p> : null}
        {!insightsLoading ? (
          <p className="muted">Source: {report.insights.source} | Latency: {report.insights.latencyMs}ms</p>
        ) : null}
        {!insightsLoading ? (
          <button
            type="button"
            onClick={() => {
              setInsightsError(null);
              updateInsights({
                summary: "Insights not generated yet",
                priorityFixes: [],
                source: "pending",
                latencyMs: 0
              });
            }}
          >
            Retry Insights
          </button>
        ) : null}
        <textarea readOnly value={report.insights.summary + "\n\nPriority fixes:\n- " + report.insights.priorityFixes.join("\n- ")} />
      </div>
    </main>
  );
}
