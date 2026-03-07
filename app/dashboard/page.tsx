"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";
import { calculateReport } from "@/lib/calc/report";
import { DEFAULT_REPORT_INPUT } from "@/lib/constants/defaultInput";

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
  const [reportInput, setReportInput] = useState<ParsedReport>(DEFAULT_REPORT_INPUT);
  const [report, setReport] = useState<CalculatedReport>(() => calculateReport(DEFAULT_REPORT_INPUT));
  const [selectedSection, setSelectedSection] = useState<SectionId>("all");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    const savedInput = sessionStorage.getItem("reportInput");
    const savedReport = sessionStorage.getItem("report");

    if (savedInput) {
      try {
        const parsedInput = JSON.parse(savedInput) as ParsedReport;
        setReportInput(parsedInput);
        setReport(calculateReport(parsedInput));
      } catch {
        setReportInput(DEFAULT_REPORT_INPUT);
        setReport(calculateReport(DEFAULT_REPORT_INPUT));
      }
    }

    if (savedReport) {
      try {
        const parsedReport = JSON.parse(savedReport) as CalculatedReport;
        if (parsedReport?.insights) {
          setReport((prev) => ({ ...prev, insights: parsedReport.insights }));
        }
      } catch {
        // no-op
      }
    }
  }, []);

  const allocationTotal = useMemo(
    () => reportInput.scalePlannerInput.allocationMetaPct + reportInput.scalePlannerInput.allocationGooglePct + reportInput.scalePlannerInput.allocationOtherPct,
    [reportInput]
  );

  function updateNumber(path: string, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;

    setReportInput((prev) => {
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

  function updateGrowthStage(value: string) {
    setReportInput((prev) => ({
      ...prev,
      agencyInput: {
        ...prev.agencyInput,
        growthStage: value
      }
    }));
  }

  function applyChanges() {
    setRecalcLoading(true);
    try {
      const next = calculateReport(reportInput);
      const merged = {
        ...next,
        insights: {
          summary: "Insights not generated yet",
          priorityFixes: [],
          source: "pending" as const,
          latencyMs: 0
        }
      };
      setReport(merged);
      sessionStorage.setItem("reportInput", JSON.stringify(reportInput));
      sessionStorage.setItem("report", JSON.stringify(merged));
    } finally {
      setRecalcLoading(false);
    }
  }

  async function generateInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report)
      });
      if (!res.ok) throw new Error("Insights API failed");
      const insights = await res.json();
      const merged = { ...report, insights };
      setReport(merged);
      sessionStorage.setItem("report", JSON.stringify(merged));
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Unable to generate insights");
    } finally {
      setInsightsLoading(false);
    }
  }

  function renderSection(id: SectionId, data: CalculatedReport) {
    if (id === "unit") {
      return (
        <SectionRail title="📊 Unit Economics">
          <MetricCard title="Net Revenue / Order" value={inr(data.unitEconomics.netRevenueExGst)} />
          <MetricCard title="Total COGS / Order" value={inr(data.unitEconomics.totalCogs)} />
          <MetricCard title="Fulfillment / Order" value={inr(data.unitEconomics.fulfillmentCost)} />
          <MetricCard title="Gross Margin / Order" value={inr(data.unitEconomics.grossMargin)} />
          <MetricCard title="Contribution / Order" value={inr(data.unitEconomics.contributionMargin)} />
          <MetricCard title="Contribution Margin %" value={pct(data.unitEconomics.contributionMarginPct)} />
          <MetricCard title="Max Allowable CAC" value={inr(data.unitEconomics.maxAllowableCac)} />
        </SectionRail>
      );
    }

    if (id === "ad") {
      return (
        <SectionRail title="📣 Ad Metrics">
          <MetricCard title="Total Ad Spend" value={inr(data.adMetrics.totalAdSpend)} />
          <MetricCard title="Ad Revenue" value={inr(data.adMetrics.totalRevenue)} />
          <MetricCard title="Orders" value={String(data.adMetrics.totalOrders)} />
          <MetricCard title="Blended ROAS" value={`${data.adMetrics.blendedRoas.toFixed(2)}x`} />
          <MetricCard title="Blended CAC" value={inr(data.adMetrics.blendedCac)} />
          <MetricCard title="CTR" value={pct(data.adMetrics.blendedCtr)} />
          <MetricCard title="CVR" value={pct(data.adMetrics.blendedCvr)} />
          <MetricCard title="CPC / CPM" value={`${inr(data.adMetrics.cpc)} / ${inr(data.adMetrics.cpm)}`} />
        </SectionRail>
      );
    }

    if (id === "agency") {
      return (
        <SectionRail title="💰 Agency Fee Calc">
          <MetricCard title="Growth Stage" value={data.agencyFee.growthStage} />
          <MetricCard title="Recommended Fee" value={inr(data.agencyFee.recommendedFee)} />
          <MetricCard title="Fee % of Revenue" value={pct(data.agencyFee.asPctRevenue)} />
          <MetricCard title="Fee % of Ad Spend" value={pct(data.agencyFee.asPctAdSpend)} />
          <MetricCard title="Hybrid Model Fee" value={inr(data.agencyFee.hybridFee)} />
          <MetricCard title="Break-even ROAS" value={`${data.agencyFee.breakevenRoasWithAgency.toFixed(2)}x`} />
        </SectionRail>
      );
    }

    if (id === "scale") {
      return (
        <SectionRail title="📈 Scale Planner">
          <MetricCard title="Target Revenue" value={inr(data.scalePlanner.targetRevenue)} />
          <MetricCard title="Target Ad Spend" value={inr(data.scalePlanner.targetAdSpend)} />
          <MetricCard title="Target Orders" value={String(data.scalePlanner.targetOrders)} />
          <MetricCard title="Target CAC" value={inr(data.scalePlanner.targetCac)} />
          <MetricCard title="Meta Budget" value={inr(data.scalePlanner.budgetMeta)} />
          <MetricCard title="Google Budget" value={inr(data.scalePlanner.budgetGoogle)} />
          <MetricCard title="Other Budget" value={inr(data.scalePlanner.budgetOther)} />
          <MetricCard title="Scale Verdict" value={data.scalePlanner.readiness} />
        </SectionRail>
      );
    }

    return (
      <SectionRail title="📅 Monthly P&L">
        <MetricCard title="Net Revenue" value={inr(data.monthlyPnl.netRevenueMonth)} />
        <MetricCard title="COGS" value={inr(data.monthlyPnl.cogsMonth)} />
        <MetricCard title="Fulfillment" value={inr(data.monthlyPnl.fulfillmentMonth)} />
        <MetricCard title="Contribution" value={inr(data.monthlyPnl.contributionMonth)} />
        <MetricCard title="Marketing Cost" value={inr(data.monthlyPnl.marketingMonth)} />
        <MetricCard title="Net Profit" value={inr(data.monthlyPnl.netProfitMonth)} />
        <MetricCard title="Net Profit Margin" value={pct(data.monthlyPnl.netProfitMarginPct)} />
      </SectionRail>
    );
  }

  return (
    <main className="main grid" style={{ gap: 18 }}>
      <div className="card">
        <h1>🚀 D2C Performance Marketing Calculator</h1>
        <p className="muted">Fill the blue cells, click apply, and review all computed sections in cards.</p>
      </div>

      <div className="card grid" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>⚠️ Input Cells (Blue) {"->"} Auto-Calculated Sections</h3>
        <div className="toolbar">
          <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value as SectionId)}>
            {sectionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <button type="button" onClick={applyChanges} disabled={recalcLoading}>
            {recalcLoading ? "Applying..." : "Apply Changes"}
          </button>
        </div>

        <div className="editor-grid">
          <label>MRP <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.sellingPrice} onChange={(e) => updateNumber("unitEconomicsInput.sellingPrice", e.target.value)} /></label>
          <label>Discount <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.discount} onChange={(e) => updateNumber("unitEconomicsInput.discount", e.target.value)} /></label>
          <label>GST % (0.18) <input className="input-blue" type="number" step="0.01" value={reportInput.unitEconomicsInput.gstRate} onChange={(e) => updateNumber("unitEconomicsInput.gstRate", e.target.value)} /></label>
          <label>Raw Material <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.cogsParts[0]} onChange={(e) => updateNumber("unitEconomicsInput.cogsParts.0", e.target.value)} /></label>
          <label>Packaging <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.cogsParts[1]} onChange={(e) => updateNumber("unitEconomicsInput.cogsParts.1", e.target.value)} /></label>
          <label>Quality/Wastage <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.cogsParts[2]} onChange={(e) => updateNumber("unitEconomicsInput.cogsParts.2", e.target.value)} /></label>
          <label>Inbound Freight <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.cogsParts[3]} onChange={(e) => updateNumber("unitEconomicsInput.cogsParts.3", e.target.value)} /></label>
          <label>Shipping <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.shipping} onChange={(e) => updateNumber("unitEconomicsInput.shipping", e.target.value)} /></label>
          <label>COD Fee <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.codFee} onChange={(e) => updateNumber("unitEconomicsInput.codFee", e.target.value)} /></label>
          <label>PG Fee % <input className="input-blue" type="number" step="0.01" value={reportInput.unitEconomicsInput.paymentGatewayPct} onChange={(e) => updateNumber("unitEconomicsInput.paymentGatewayPct", e.target.value)} /></label>
          <label>Returns % <input className="input-blue" type="number" step="0.01" value={reportInput.unitEconomicsInput.returnsRate} onChange={(e) => updateNumber("unitEconomicsInput.returnsRate", e.target.value)} /></label>
          <label>Return Shipping <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.returnShipping} onChange={(e) => updateNumber("unitEconomicsInput.returnShipping", e.target.value)} /></label>
          <label>Warehouse / 3PL <input className="input-blue" type="number" value={reportInput.unitEconomicsInput.warehouse} onChange={(e) => updateNumber("unitEconomicsInput.warehouse", e.target.value)} /></label>

          <label>Total Ad Spend <input className="input-blue" type="number" value={reportInput.adMetricsInput.totalAdSpend} onChange={(e) => updateNumber("adMetricsInput.totalAdSpend", e.target.value)} /></label>
          <label>Impressions <input className="input-blue" type="number" value={reportInput.adMetricsInput.impressions} onChange={(e) => updateNumber("adMetricsInput.impressions", e.target.value)} /></label>
          <label>Clicks <input className="input-blue" type="number" value={reportInput.adMetricsInput.clicks} onChange={(e) => updateNumber("adMetricsInput.clicks", e.target.value)} /></label>
          <label>Orders <input className="input-blue" type="number" value={reportInput.adMetricsInput.orders} onChange={(e) => updateNumber("adMetricsInput.orders", e.target.value)} /></label>
          <label>Revenue <input className="input-blue" type="number" value={reportInput.adMetricsInput.revenue} onChange={(e) => updateNumber("adMetricsInput.revenue", e.target.value)} /></label>

          <label>Growth Stage
            <select className="input-blue" value={reportInput.agencyInput.growthStage} onChange={(e) => updateGrowthStage(e.target.value)}>
              <option>Early Stage</option>
              <option>Growth</option>
              <option>Scale</option>
            </select>
          </label>

          <label>Revenue Growth % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.revenueGrowthTargetPct} onChange={(e) => updateNumber("scalePlannerInput.revenueGrowthTargetPct", e.target.value)} /></label>
          <label>Ad Spend Growth % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.adSpendGrowthTargetPct} onChange={(e) => updateNumber("scalePlannerInput.adSpendGrowthTargetPct", e.target.value)} /></label>
          <label>Orders Growth % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.ordersGrowthTargetPct} onChange={(e) => updateNumber("scalePlannerInput.ordersGrowthTargetPct", e.target.value)} /></label>
          <label>CAC Improvement % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.cacImprovementTargetPct} onChange={(e) => updateNumber("scalePlannerInput.cacImprovementTargetPct", e.target.value)} /></label>
          <label>Meta Allocation % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.allocationMetaPct} onChange={(e) => updateNumber("scalePlannerInput.allocationMetaPct", e.target.value)} /></label>
          <label>Google Allocation % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.allocationGooglePct} onChange={(e) => updateNumber("scalePlannerInput.allocationGooglePct", e.target.value)} /></label>
          <label>Other Allocation % <input className="input-blue" type="number" step="0.01" value={reportInput.scalePlannerInput.allocationOtherPct} onChange={(e) => updateNumber("scalePlannerInput.allocationOtherPct", e.target.value)} /></label>
        </div>

        <p className={Math.abs(allocationTotal - 1) < 0.001 ? "muted" : "warning"}>
          Allocation total: {(allocationTotal * 100).toFixed(1)}% {Math.abs(allocationTotal - 1) < 0.001 ? "(OK)" : "(Should be 100%)"}
        </p>
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
        {!insightsLoading ? (
          <p className="muted">Source: {report.insights.source} | Latency: {report.insights.latencyMs}ms</p>
        ) : (
          <p className="muted">Generating insights...</p>
        )}
        {insightsError ? <p style={{ color: "crimson" }}>{insightsError}</p> : null}
        <button type="button" onClick={generateInsights} disabled={insightsLoading}>
          {insightsLoading ? "Generating..." : "Generate AI Insights"}
        </button>
        <textarea readOnly value={report.insights.summary + "\n\nPriority fixes:\n- " + report.insights.priorityFixes.join("\n- ")} />
      </div>
    </main>
  );
}
