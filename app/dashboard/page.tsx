"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";
import { calculateReport } from "@/lib/calc/report";
import { DEFAULT_REPORT_INPUT } from "@/lib/constants/defaultInput";
import { createClient } from "@/lib/supabase/client";
import { SignOutButton } from "@/components/auth/SignOutButton";

const sectionOptions = [
  { id: "all", label: "All" },
  { id: "unit", label: "Unit Economics" },
  { id: "ad", label: "Ad Metrics" },
  { id: "agency", label: "Agency Fee" },
  { id: "scale", label: "Scale Planner" },
  { id: "pnl", label: "Monthly P&L" }
] as const;

type SectionId = (typeof sectionOptions)[number]["id"];
type ActiveSection = Exclude<SectionId, "all">;

type MetricTone = "good" | "warn" | "neutral";

type MetricItem = {
  title: string;
  value: string;
  hint: string;
  tone: MetricTone;
  benchmark?: string;
};

type ToastTone = "good" | "warn" | "neutral";

type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
};

type ScenarioSnapshot = {
  id: number;
  name: string;
  report: CalculatedReport;
  input: ParsedReport;
  createdAt: string;
};

function inr(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function MetricTile({ item }: { item: MetricItem }) {
  return (
    <article className={`metric-tile tone-${item.tone}`}>
      <div className="metric-top">
        <p className="metric-title">{item.title}</p>
        {item.benchmark ? (
          <span className="hint-wrap" tabIndex={0}>
            i
            <span className="hint-bubble">{item.benchmark}</span>
          </span>
        ) : null}
      </div>
      <p className="metric-value">{item.value}</p>
      <p className="metric-hint">{item.hint}</p>
    </article>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1"
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <label className="input-row">
      <span>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function DashboardPage() {
  const [reportInput, setReportInput] = useState<ParsedReport>(DEFAULT_REPORT_INPUT);
  const [report, setReport] = useState<CalculatedReport>(() => calculateReport(DEFAULT_REPORT_INPUT));
  const [selectedSection, setSelectedSection] = useState<SectionId>("all");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);

  function pushToast(text: string, tone: ToastTone = "neutral") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }

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

  useEffect(() => {
    const seen = localStorage.getItem("seenOnboardingV1");
    if (!seen) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const allocationTotal = useMemo(
    () =>
      reportInput.scalePlannerInput.allocationMetaPct +
      reportInput.scalePlannerInput.allocationGooglePct +
      reportInput.scalePlannerInput.allocationOtherPct,
    [reportInput]
  );

  const sectionStatus = useMemo(() => {
    return {
      unit: report.unitEconomics.contributionMarginPct >= 0.3 ? "Healthy" : "Warning",
      ad: report.adMetrics.blendedRoas >= 3 && report.adMetrics.blendedCac <= report.unitEconomics.maxAllowableCac ? "Healthy" : "Warning",
      agency: report.agencyFee.asPctAdSpend <= 0.2 ? "Healthy" : "High Fee",
      scale: report.scalePlanner.readiness === "READY TO SCALE" ? "Ready" : "Hold",
      pnl: report.monthlyPnl.netProfitMarginPct >= 0.1 ? "Healthy" : "Low Margin"
    };
  }, [report]);

  const heroKpis = useMemo(
    () => [
      {
        title: "Contribution Margin",
        value: pct(report.unitEconomics.contributionMarginPct),
        hint: report.unitEconomics.contributionMarginPct >= 0.3 ? "Strong unit economics" : "Needs cost correction",
        tone: report.unitEconomics.contributionMarginPct >= 0.3 ? "good" : "warn",
        benchmark: "Target > 30% for healthy scale"
      },
      {
        title: "Blended ROAS",
        value: `${report.adMetrics.blendedRoas.toFixed(2)}x`,
        hint: report.adMetrics.blendedRoas >= 3 ? "Ad engine efficient" : "Under target",
        tone: report.adMetrics.blendedRoas >= 3 ? "good" : "warn",
        benchmark: "Target >= 3x blended ROAS"
      },
      {
        title: "Net Profit Margin",
        value: pct(report.monthlyPnl.netProfitMarginPct),
        hint: report.monthlyPnl.netProfitMarginPct >= 0.1 ? "Healthy monthly profile" : "Profit pressure",
        tone: report.monthlyPnl.netProfitMarginPct >= 0.1 ? "good" : "warn",
        benchmark: "Target > 10% net margin"
      },
      {
        title: "Scale Verdict",
        value: report.scalePlanner.readiness,
        hint: dirty ? "Draft not applied" : "Based on latest applied plan",
        tone: report.scalePlanner.readiness === "READY TO SCALE" ? "good" : "neutral",
        benchmark: "Needs ROAS + CAC + margin alignment"
      }
    ],
    [report, dirty]
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

    setDirty(true);
  }

  function updateGrowthStage(value: string) {
    setReportInput((prev) => ({
      ...prev,
      agencyInput: {
        ...prev.agencyInput,
        growthStage: value
      }
    }));
    setDirty(true);
  }

  function applyChanges(scopeLabel = "All") {
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
      setDirty(false);
      pushToast(`${scopeLabel} changes applied`, "good");
    } finally {
      setRecalcLoading(false);
    }
  }

  function applySectionChanges(id: ActiveSection) {
    setSelectedSection(id);
    const sectionLabel = sectionOptions.find((opt) => opt.id === id)?.label ?? id;
    applyChanges(sectionLabel);
  }

  function resetToDefaults() {
    setReportInput(DEFAULT_REPORT_INPUT);
    const next = calculateReport(DEFAULT_REPORT_INPUT);
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
    sessionStorage.setItem("reportInput", JSON.stringify(DEFAULT_REPORT_INPUT));
    sessionStorage.setItem("report", JSON.stringify(merged));
    setDirty(false);
    pushToast("Default assumptions loaded", "neutral");
  }

  function loadSampleData() {
    setSelectedSection("all");
    setReportInput(DEFAULT_REPORT_INPUT);
    const next = calculateReport(DEFAULT_REPORT_INPUT);
    const merged = {
      ...next,
      insights: {
        summary: "Sample dataset loaded. Fine-tune each section and apply changes.",
        priorityFixes: ["Start with Unit Economics + Ad Metrics before scaling."],
        source: "fallback" as const,
        latencyMs: 0
      }
    };
    setReport(merged);
    sessionStorage.setItem("reportInput", JSON.stringify(DEFAULT_REPORT_INPUT));
    sessionStorage.setItem("report", JSON.stringify(merged));
    setDirty(false);
    pushToast("Sample data loaded", "good");
  }

  function closeOnboarding() {
    setShowOnboarding(false);
    localStorage.setItem("seenOnboardingV1", "1");
  }

  function saveScenario() {
    const nextScenario: ScenarioSnapshot = {
      id: Date.now(),
      name: `Scenario ${scenarios.length + 1}`,
      report,
      input: reportInput,
      createdAt: new Date().toLocaleString()
    };
    setScenarios((prev) => [nextScenario, ...prev].slice(0, 3));
    setSelectedScenarioId(nextScenario.id);
    pushToast(`${nextScenario.name} saved`, "good");
  }

  function loadScenario(id: number) {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    setReportInput(structuredClone(scenario.input));
    setReport(structuredClone(scenario.report));
    setSelectedScenarioId(id);
    setDirty(false);
    sessionStorage.setItem("reportInput", JSON.stringify(scenario.input));
    sessionStorage.setItem("report", JSON.stringify(scenario.report));
    pushToast(`${scenario.name} loaded`, "neutral");
  }

  function applyPriorityFix(index: number) {
    const fix = report.insights.priorityFixes[index];
    if (!fix) return;

    const nextInput = structuredClone(reportInput);
    const lower = fix.toLowerCase();

    if (lower.includes("roas")) {
      nextInput.adMetricsInput.revenue = Math.round(nextInput.adMetricsInput.revenue * 1.1);
    } else if (lower.includes("contribution")) {
      nextInput.unitEconomicsInput.cogsParts = nextInput.unitEconomicsInput.cogsParts.map((v) => Math.max(0, Math.round(v * 0.95)));
    } else if (lower.includes("cac")) {
      nextInput.adMetricsInput.totalAdSpend = Math.round(nextInput.adMetricsInput.totalAdSpend * 0.9);
    } else {
      nextInput.unitEconomicsInput.discount = Math.max(0, Math.round(nextInput.unitEconomicsInput.discount * 0.95));
    }

    setReportInput(nextInput);
    setDirty(true);
    pushToast("Applied AI fix draft to inputs", "good");
  }

  function dismissPriorityFix(index: number) {
    const nextFixes = report.insights.priorityFixes.filter((_, i) => i !== index);
    const merged = {
      ...report,
      insights: {
        ...report.insights,
        priorityFixes: nextFixes
      }
    };
    setReport(merged);
    sessionStorage.setItem("report", JSON.stringify(merged));
    pushToast("Priority fix dismissed", "neutral");
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
      pushToast("AI insights generated", "good");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate insights";
      setInsightsError(message);
      pushToast(message, "warn");
    } finally {
      setInsightsLoading(false);
    }
  }

  function runCommand(commandId: string) {
    switch (commandId) {
      case "go-all":
        setSelectedSection("all");
        break;
      case "go-unit":
        setSelectedSection("unit");
        break;
      case "go-ad":
        setSelectedSection("ad");
        break;
      case "go-agency":
        setSelectedSection("agency");
        break;
      case "go-scale":
        setSelectedSection("scale");
        break;
      case "go-pnl":
        setSelectedSection("pnl");
        break;
      case "apply":
        applyChanges();
        break;
      case "reset":
        resetToDefaults();
        break;
      case "sample":
        loadSampleData();
        break;
      case "scenario":
        saveScenario();
        break;
      case "insights":
        generateInsights();
        break;
      default:
        break;
    }
    setPaletteOpen(false);
    setPaletteQuery("");
  }

  function getSectionMetrics(id: SectionId, data: CalculatedReport): MetricItem[] {
    if (id === "unit") {
      return [
        { title: "Net Revenue / Order", value: inr(data.unitEconomics.netRevenueExGst), hint: "Post GST adjustment", tone: "neutral" },
        { title: "Total COGS / Order", value: inr(data.unitEconomics.totalCogs), hint: "Material + packaging + freight", tone: "neutral" },
        { title: "Fulfillment / Order", value: inr(data.unitEconomics.fulfillmentCost), hint: "Shipping + returns + warehouse", tone: "neutral" },
        { title: "Gross Margin / Order", value: inr(data.unitEconomics.grossMargin), hint: "Revenue minus direct product costs", tone: "neutral" },
        {
          title: "Contribution / Order",
          value: inr(data.unitEconomics.contributionMargin),
          hint: data.unitEconomics.contributionMargin > 0 ? "Positive after variable costs" : "Negative contribution",
          tone: data.unitEconomics.contributionMargin > 0 ? "good" : "warn"
        },
        {
          title: "Contribution Margin %",
          value: pct(data.unitEconomics.contributionMarginPct),
          hint: data.unitEconomics.contributionMarginPct >= 0.3 ? "Above 30% benchmark" : "Below 30% benchmark",
          tone: data.unitEconomics.contributionMarginPct >= 0.3 ? "good" : "warn",
          benchmark: "Target > 30%"
        },
        { title: "Max Allowable CAC", value: inr(data.unitEconomics.maxAllowableCac), hint: "Upper bound before losing contribution", tone: "neutral" }
      ];
    }

    if (id === "ad") {
      return [
        { title: "Total Ad Spend", value: inr(data.adMetrics.totalAdSpend), hint: "Current media budget", tone: "neutral" },
        { title: "Ad Revenue", value: inr(data.adMetrics.totalRevenue), hint: "Attributed topline", tone: "neutral" },
        { title: "Orders", value: String(data.adMetrics.totalOrders), hint: "Converted purchases", tone: "neutral" },
        {
          title: "Blended ROAS",
          value: `${data.adMetrics.blendedRoas.toFixed(2)}x`,
          hint: data.adMetrics.blendedRoas >= 3 ? "Efficient spend" : "Efficiency below 3x",
          tone: data.adMetrics.blendedRoas >= 3 ? "good" : "warn",
          benchmark: "Target >= 3x"
        },
        {
          title: "Blended CAC",
          value: inr(data.adMetrics.blendedCac),
          hint: data.adMetrics.blendedCac <= data.unitEconomics.maxAllowableCac ? "Within allowable CAC" : "Above allowable CAC",
          tone: data.adMetrics.blendedCac <= data.unitEconomics.maxAllowableCac ? "good" : "warn",
          benchmark: "Should stay below Max Allowable CAC"
        },
        { title: "CTR", value: pct(data.adMetrics.blendedCtr), hint: "Creative and targeting response", tone: "neutral" },
        { title: "CVR", value: pct(data.adMetrics.blendedCvr), hint: "Landing and checkout conversion", tone: "neutral" },
        { title: "CPC / CPM", value: `${inr(data.adMetrics.cpc)} / ${inr(data.adMetrics.cpm)}`, hint: "Traffic pricing", tone: "neutral" }
      ];
    }

    if (id === "agency") {
      return [
        { title: "Growth Stage", value: data.agencyFee.growthStage, hint: "Selected operating stage", tone: "neutral" },
        { title: "Recommended Fee", value: inr(data.agencyFee.recommendedFee), hint: "Model-selected pricing", tone: "neutral" },
        {
          title: "Fee % of Revenue",
          value: pct(data.agencyFee.asPctRevenue),
          hint: data.agencyFee.asPctRevenue <= 0.1 ? "Lean agency profile" : "Heavy share of topline",
          tone: data.agencyFee.asPctRevenue <= 0.1 ? "good" : "warn"
        },
        {
          title: "Fee % of Ad Spend",
          value: pct(data.agencyFee.asPctAdSpend),
          hint: data.agencyFee.asPctAdSpend <= 0.2 ? "Within benchmark" : "Over 20% benchmark",
          tone: data.agencyFee.asPctAdSpend <= 0.2 ? "good" : "warn",
          benchmark: "Target <= 20%"
        },
        { title: "Hybrid Model Fee", value: inr(data.agencyFee.hybridFee), hint: "Retainer + performance blend", tone: "neutral" },
        { title: "Break-even ROAS", value: `${data.agencyFee.breakevenRoasWithAgency.toFixed(2)}x`, hint: "ROAS needed with agency cost", tone: "neutral" }
      ];
    }

    if (id === "scale") {
      return [
        { title: "Target Revenue", value: inr(data.scalePlanner.targetRevenue), hint: "Projected topline", tone: "neutral" },
        { title: "Target Ad Spend", value: inr(data.scalePlanner.targetAdSpend), hint: "Projected media budget", tone: "neutral" },
        { title: "Target Orders", value: String(data.scalePlanner.targetOrders), hint: "Projected demand", tone: "neutral" },
        { title: "Target CAC", value: inr(data.scalePlanner.targetCac), hint: "Required customer cost", tone: "neutral" },
        { title: "Meta Budget", value: inr(data.scalePlanner.budgetMeta), hint: "Platform allocation", tone: "neutral" },
        { title: "Google Budget", value: inr(data.scalePlanner.budgetGoogle), hint: "Platform allocation", tone: "neutral" },
        { title: "Other Budget", value: inr(data.scalePlanner.budgetOther), hint: "Platform allocation", tone: "neutral" },
        {
          title: "Scale Verdict",
          value: data.scalePlanner.readiness,
          hint: data.scalePlanner.readiness === "READY TO SCALE" ? "Current profile supports growth" : "Fix unit/media constraints first",
          tone: data.scalePlanner.readiness === "READY TO SCALE" ? "good" : "warn",
          benchmark: "Needs margin + CAC + ROAS + 100% allocation"
        }
      ];
    }

    return [
      { title: "Net Revenue", value: inr(data.monthlyPnl.netRevenueMonth), hint: "Monthly net topline", tone: "neutral" },
      { title: "COGS", value: inr(data.monthlyPnl.cogsMonth), hint: "Product cost load", tone: "neutral" },
      { title: "Fulfillment", value: inr(data.monthlyPnl.fulfillmentMonth), hint: "Ops + logistics", tone: "neutral" },
      { title: "Contribution", value: inr(data.monthlyPnl.contributionMonth), hint: "Margin before fixed costs", tone: "neutral" },
      { title: "Marketing Cost", value: inr(data.monthlyPnl.marketingMonth), hint: "Media + acquisition spend", tone: "neutral" },
      {
        title: "Net Profit",
        value: inr(data.monthlyPnl.netProfitMonth),
        hint: data.monthlyPnl.netProfitMonth > 0 ? "Profitable month" : "Loss-making month",
        tone: data.monthlyPnl.netProfitMonth > 0 ? "good" : "warn"
      },
      {
        title: "Net Profit Margin",
        value: pct(data.monthlyPnl.netProfitMarginPct),
        hint: data.monthlyPnl.netProfitMarginPct >= 0.1 ? "Above 10% benchmark" : "Below 10% benchmark",
        tone: data.monthlyPnl.netProfitMarginPct >= 0.1 ? "good" : "warn",
        benchmark: "Target > 10%"
      }
    ];
  }

  function getSectionInputSnapshot(id: ActiveSection) {
    if (id === "unit") return reportInput.unitEconomicsInput;
    if (id === "ad") return reportInput.adMetricsInput;
    if (id === "agency") return reportInput.agencyInput;
    if (id === "scale") return reportInput.scalePlannerInput;
    return {
      note: "Monthly P&L is derived from other sections",
      dependencies: {
        unitEconomicsInput: reportInput.unitEconomicsInput,
        adMetricsInput: reportInput.adMetricsInput,
        agencyInput: reportInput.agencyInput,
        scalePlannerInput: reportInput.scalePlannerInput
      }
    };
  }

  function saveSectionSheet(id: ActiveSection) {
    const sheet = {
      section: id,
      exportedAt: new Date().toISOString(),
      input: getSectionInputSnapshot(id),
      output: getSectionMetrics(id, report)
    };

    const blob = new Blob([JSON.stringify(sheet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}-sheet-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    pushToast(`${sectionOptions.find((opt) => opt.id === id)?.label ?? id} sheet saved`, "good");
  }

  function sectionInputs(id: ActiveSection): React.ReactNode {
    if (id === "unit") {
      return (
        <div className="editor-grid">
          <NumberField label="Selling Price (MRP)" value={reportInput.unitEconomicsInput.sellingPrice} onChange={(v) => updateNumber("unitEconomicsInput.sellingPrice", v)} />
          <NumberField label="Discount" value={reportInput.unitEconomicsInput.discount} onChange={(v) => updateNumber("unitEconomicsInput.discount", v)} />
          <NumberField label="GST Rate" step="0.01" value={reportInput.unitEconomicsInput.gstRate} onChange={(v) => updateNumber("unitEconomicsInput.gstRate", v)} />
          <NumberField label="Raw Material" value={reportInput.unitEconomicsInput.cogsParts[0]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.0", v)} />
          <NumberField label="Packaging" value={reportInput.unitEconomicsInput.cogsParts[1]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.1", v)} />
          <NumberField label="Quality/Wastage" value={reportInput.unitEconomicsInput.cogsParts[2]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.2", v)} />
          <NumberField label="Inbound Freight" value={reportInput.unitEconomicsInput.cogsParts[3]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.3", v)} />
          <NumberField label="Shipping" value={reportInput.unitEconomicsInput.shipping} onChange={(v) => updateNumber("unitEconomicsInput.shipping", v)} />
          <NumberField label="COD Fee" value={reportInput.unitEconomicsInput.codFee} onChange={(v) => updateNumber("unitEconomicsInput.codFee", v)} />
          <NumberField label="Payment Gateway %" step="0.01" value={reportInput.unitEconomicsInput.paymentGatewayPct} onChange={(v) => updateNumber("unitEconomicsInput.paymentGatewayPct", v)} />
          <NumberField label="Returns Rate" step="0.01" value={reportInput.unitEconomicsInput.returnsRate} onChange={(v) => updateNumber("unitEconomicsInput.returnsRate", v)} />
          <NumberField label="Return Shipping" value={reportInput.unitEconomicsInput.returnShipping} onChange={(v) => updateNumber("unitEconomicsInput.returnShipping", v)} />
          <NumberField label="Warehouse / 3PL" value={reportInput.unitEconomicsInput.warehouse} onChange={(v) => updateNumber("unitEconomicsInput.warehouse", v)} />
        </div>
      );
    }

    if (id === "ad") {
      return (
        <div className="editor-grid">
          <NumberField label="Total Ad Spend" value={reportInput.adMetricsInput.totalAdSpend} onChange={(v) => updateNumber("adMetricsInput.totalAdSpend", v)} />
          <NumberField label="Impressions" value={reportInput.adMetricsInput.impressions} onChange={(v) => updateNumber("adMetricsInput.impressions", v)} />
          <NumberField label="Clicks" value={reportInput.adMetricsInput.clicks} onChange={(v) => updateNumber("adMetricsInput.clicks", v)} />
          <NumberField label="Orders" value={reportInput.adMetricsInput.orders} onChange={(v) => updateNumber("adMetricsInput.orders", v)} />
          <NumberField label="Revenue" value={reportInput.adMetricsInput.revenue} onChange={(v) => updateNumber("adMetricsInput.revenue", v)} />
        </div>
      );
    }

    if (id === "agency") {
      return (
        <div className="editor-grid">
          <label className="input-row">
            <span>Growth Stage</span>
            <select value={reportInput.agencyInput.growthStage} onChange={(e) => updateGrowthStage(e.target.value)}>
              <option>Early Stage</option>
              <option>Growth</option>
              <option>Scale</option>
            </select>
          </label>
        </div>
      );
    }

    if (id === "scale") {
      return (
        <>
          <div className="editor-grid">
            <NumberField label="Revenue Growth Target %" step="0.01" value={reportInput.scalePlannerInput.revenueGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.revenueGrowthTargetPct", v)} />
            <NumberField label="Ad Spend Growth Target %" step="0.01" value={reportInput.scalePlannerInput.adSpendGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.adSpendGrowthTargetPct", v)} />
            <NumberField label="Orders Growth Target %" step="0.01" value={reportInput.scalePlannerInput.ordersGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.ordersGrowthTargetPct", v)} />
            <NumberField label="CAC Improvement Target %" step="0.01" value={reportInput.scalePlannerInput.cacImprovementTargetPct} onChange={(v) => updateNumber("scalePlannerInput.cacImprovementTargetPct", v)} />
            <NumberField label="Meta Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationMetaPct} onChange={(v) => updateNumber("scalePlannerInput.allocationMetaPct", v)} />
            <NumberField label="Google Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationGooglePct} onChange={(v) => updateNumber("scalePlannerInput.allocationGooglePct", v)} />
            <NumberField label="Other Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationOtherPct} onChange={(v) => updateNumber("scalePlannerInput.allocationOtherPct", v)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={Math.abs(allocationTotal - 1) < 0.001 ? "tag tag-good" : "tag tag-warn"}>Allocation {(allocationTotal * 100).toFixed(1)}%</span>
          </div>
        </>
      );
    }

    return <p className="muted-text">Monthly P&L is auto-derived from the previous sections and updates when you apply changes.</p>;
  }

  function statusTone(status: string): MetricTone {
    if (status === "Healthy" || status === "Ready") return "good";
    if (status === "Warning" || status === "High Fee" || status === "Low Margin" || status === "Hold") return "warn";
    return "neutral";
  }

  function renderSectionBlock(id: ActiveSection) {
    const sectionHealth = sectionStatus[id];
    const tone = statusTone(sectionHealth);

    return (
      <section className={`surface section-surface section-block tone-${tone}`} key={id}>
        <div className="section-head section-head-rich">
          <h3>{sectionOptions.find((opt) => opt.id === id)?.label ?? id}</h3>
          <span className={`status-dot status-${tone}`}>{sectionHealth}</span>
        </div>
        <div className="section-block-grid">
          <article className="input-cluster">
            <h4>{id === "pnl" ? "Input Dependencies" : "Section Inputs"}</h4>
            {sectionInputs(id)}
            <div className="section-actions">
              <button type="button" onClick={() => applySectionChanges(id)} disabled={recalcLoading}>
                {recalcLoading ? "Applying..." : `Apply ${sectionOptions.find((opt) => opt.id === id)?.label} Changes`}
              </button>
              <button type="button" className="button-ghost" onClick={() => saveSectionSheet(id)}>
                Save Sheet
              </button>
            </div>
          </article>
          <article className="output-cluster">
            <h4>Section Output</h4>
            <div className="metrics-grid metrics-grid-tight">
              {getSectionMetrics(id, report).map((item) => (
                <MetricTile key={`${id}-${item.title}`} item={item} />
              ))}
            </div>
          </article>
        </div>
      </section>
    );
  }

  const commands = [
    { id: "go-all", label: "Go to All Sections" },
    { id: "go-unit", label: "Go to Unit Economics" },
    { id: "go-ad", label: "Go to Ad Metrics" },
    { id: "go-agency", label: "Go to Agency Fee" },
    { id: "go-scale", label: "Go to Scale Planner" },
    { id: "go-pnl", label: "Go to Monthly P&L" },
    { id: "apply", label: "Apply Changes" },
    { id: "reset", label: "Reset Defaults" },
    { id: "sample", label: "Load Sample Data" },
    { id: "scenario", label: "Save Scenario Snapshot" },
    { id: "insights", label: "Generate AI Insights" }
  ];

  const filteredCommands = commands.filter((c) => c.label.toLowerCase().includes(paletteQuery.toLowerCase()));
  const sectionSequence: ActiveSection[] = ["unit", "ad", "agency", "scale", "pnl"];
  const completedSections = sectionSequence.filter((id) => statusTone(sectionStatus[id]) === "good").length;
  const checklist = [
    { label: "Unit Economics Healthy", done: sectionStatus.unit === "Healthy" },
    { label: "Ad Metrics Healthy", done: sectionStatus.ad === "Healthy" },
    { label: "Agency Fee In Range", done: sectionStatus.agency === "Healthy" },
    { label: "Scale Planner Ready", done: sectionStatus.scale === "Ready" },
    { label: "Monthly Margin Healthy", done: sectionStatus.pnl === "Healthy" },
    { label: "Insights Generated", done: report.insights.source !== "pending" }
  ];

  return (
    <div className="dashboard-shell">
      <aside className="command-rail surface">
        <div className="rail-top">
          <p className="eyebrow">Control</p>
          <h3>Sections</h3>
        </div>
        <div className="section-list">
          {sectionOptions.map((opt) => {
            const key = opt.id === "all" ? "unit" : opt.id;
            const status = opt.id === "all" ? (dirty ? "Unsaved" : "Synced") : sectionStatus[key as "unit" | "ad" | "agency" | "scale" | "pnl"];
            const tone = opt.id === "all" ? (dirty ? "warn" : "good") : statusTone(status);

            return (
              <button
                key={opt.id}
                type="button"
                className={`section-chip ${selectedSection === opt.id ? "active" : ""}`}
                onClick={() => setSelectedSection(opt.id)}
              >
                <span>{opt.label}</span>
                <small className={`rail-status rail-${tone}`}>{status}</small>
              </button>
            );
          })}
        </div>
        <div className="rail-shortcuts">
          <p>Command Palette</p>
          <kbd>Ctrl</kbd>
          <span>+</span>
          <kbd>K</kbd>
        </div>
      </aside>

      <main className="dashboard-content-grid">
        <section className="surface utility-bar">
          <button type="button" className="button-ghost" onClick={() => setPaletteOpen(true)}>
            Open Command Palette
          </button>
          <button type="button" className="button-ghost" onClick={loadSampleData}>
            Load Sample Data
          </button>
          <button type="button" className="button-ghost" onClick={saveScenario}>
            Save Scenario
          </button>
          <span className="tag">{completedSections}/{sectionSequence.length} sections healthy</span>
          <span className={dirty ? "tag tag-warn" : "tag tag-good"}>{dirty ? "Unsaved Draft" : "All Saved"}</span>
        </section>

        <section className="surface progress-strip">
          {sectionSequence.map((id) => {
            const tone = statusTone(sectionStatus[id]);
            return (
              <button key={id} type="button" className={`progress-pill tone-${tone}`} onClick={() => setSelectedSection(id)}>
                <span>{sectionOptions.find((opt) => opt.id === id)?.label}</span>
                <small>{sectionStatus[id]}</small>
              </button>
            );
          })}
        </section>

        <section className="surface hero-surface">
          <div>
            <p className="eyebrow">D2C Operating System</p>
            <h1>Growth Intelligence Command Center</h1>
            <p className="hero-copy">Fast signal loops for unit economics, paid media, agency cost, and scale readiness with visible levers and actionable AI guidance.</p>
          </div>
          <div className="hero-meta">
            <span className="muted-text">{userEmail ? `Signed in as ${userEmail}` : "Not signed in"}</span>
            <SignOutButton />
          </div>
        </section>

        <section className="hero-kpi-grid">
          {heroKpis.map((item) => (
            <MetricTile key={item.title} item={item as MetricItem} />
          ))}
        </section>

        <section className="surface action-surface">
          <div className="section-head">
            <h3>Execution Controls</h3>
            <p>Apply edits instantly, reset assumptions, and trigger AI insight generation.</p>
          </div>
          <div className="action-row">
            <button type="button" onClick={() => applyChanges()} disabled={recalcLoading}>
              {recalcLoading ? "Applying..." : "Apply All Changes"}
            </button>
            <button type="button" onClick={resetToDefaults} className="button-ghost">
              Reset Defaults
            </button>
            <button type="button" onClick={generateInsights} disabled={insightsLoading} className="button-ghost">
              {insightsLoading ? "Generating..." : "Generate AI Insights"}
            </button>
          </div>
        </section>

        <section className="surface checklist-surface">
          <div className="section-head">
            <h3>Launch Checklist</h3>
            <p>Track the readiness gates before scaling budgets.</p>
          </div>
          <div className="checklist-grid">
            {checklist.map((item) => (
              <div key={item.label} className={`check-item ${item.done ? "done" : ""}`}>
                <span>{item.done ? "✓" : "○"}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        {selectedSection === "all" ? sectionSequence.map((id) => renderSectionBlock(id)) : renderSectionBlock(selectedSection as ActiveSection)}

        <section className="surface section-surface">
          <div className="section-head">
            <h3>Scenario Lab</h3>
            <p>Save and compare up to 3 scenarios for revenue, profit and ROAS.</p>
          </div>
          <div className="scenario-grid">
            {scenarios.length === 0 ? <p className="muted-text">No scenario saved yet. Use “Save Scenario” after applying changes.</p> : null}
            {scenarios.map((scenario) => (
              <article key={scenario.id} className={`scenario-card ${selectedScenarioId === scenario.id ? "active" : ""}`}>
                <h4>{scenario.name}</h4>
                <p className="muted-text">{scenario.createdAt}</p>
                <div className="scenario-bars">
                  <label>
                    Revenue
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, (scenario.report.monthlyPnl.netRevenueMonth / Math.max(report.monthlyPnl.netRevenueMonth, 1)) * 100)}%` }} />
                    </div>
                  </label>
                  <label>
                    Profit
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, Math.max(5, (scenario.report.monthlyPnl.netProfitMonth / Math.max(report.monthlyPnl.netProfitMonth, 1)) * 100))}%` }} />
                    </div>
                  </label>
                  <label>
                    ROAS
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, (scenario.report.adMetrics.blendedRoas / Math.max(report.adMetrics.blendedRoas, 0.1)) * 100)}%` }} />
                    </div>
                  </label>
                </div>
                <button type="button" className="button-ghost" onClick={() => loadScenario(scenario.id)}>
                  Load Scenario
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="surface section-surface insights-surface">
          <div className="section-head">
            <h3>AI Insights</h3>
            <p>Priority fixes and executive summary from the latest model run.</p>
          </div>
          <div className="insight-meta-row">
            <span className="tag">Source: {report.insights.source}</span>
            <span className="tag">Latency: {report.insights.latencyMs}ms</span>
            <span className={insightsLoading ? "tag tag-warn" : "tag tag-good"}>{insightsLoading ? "Generating" : "Ready"}</span>
            <span className="tag">Confidence: {report.insights.source === "ollama" ? "High" : "Medium"}</span>
          </div>
          {insightsError ? <p className="error-text">{insightsError}</p> : null}
          {report.insights.priorityFixes.length > 0 ? (
            <div className="fix-grid">
              {report.insights.priorityFixes.map((fix, index) => (
                <article key={`${fix}-${index}`} className="fix-card">
                  <p>{fix}</p>
                  <div className="fix-actions">
                    <button type="button" onClick={() => applyPriorityFix(index)}>Apply Draft</button>
                    <button type="button" className="button-ghost" onClick={() => dismissPriorityFix(index)}>Dismiss</button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <textarea
            readOnly
            value={
              report.insights.summary +
              "\n\nPriority fixes:\n" +
              (report.insights.priorityFixes.length > 0 ? report.insights.priorityFixes.map((fix) => `- ${fix}`).join("\n") : "- No priority fixes yet")
            }
          />
        </section>
      </main>

      {toasts.length > 0 ? (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-card toast-${toast.tone}`}>
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}

      {paletteOpen ? (
        <div className="palette-backdrop" onClick={() => setPaletteOpen(false)}>
          <div className="palette-card" onClick={(e) => e.stopPropagation()}>
            <input autoFocus placeholder="Type a command..." value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} className="palette-input" />
            <div className="palette-list">
              {filteredCommands.map((cmd) => (
                <button key={cmd.id} type="button" className="palette-item" onClick={() => runCommand(cmd.id)}>
                  {cmd.label}
                </button>
              ))}
              {filteredCommands.length === 0 ? <p className="muted-text">No commands found</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mobile-nav">
        {sectionSequence.map((id) => (
          <button key={id} type="button" className={selectedSection === id ? "active" : ""} onClick={() => setSelectedSection(id)}>
            {sectionOptions.find((opt) => opt.id === id)?.label?.split(" ")[0]}
          </button>
        ))}
      </nav>

      {showOnboarding ? (
        <div className="palette-backdrop" onClick={closeOnboarding}>
          <div className="palette-card onboarding-card" onClick={(e) => e.stopPropagation()}>
            <h3>Welcome to D2C Command Center</h3>
            <p className="muted-text">Quick start in 3 steps:</p>
            <ol>
              <li>Load sample data to see a full working model.</li>
              <li>Edit inputs section-by-section and apply changes.</li>
              <li>Generate AI insights and use Apply Draft on priority fixes.</li>
            </ol>
            <div className="action-row">
              <button type="button" onClick={() => { loadSampleData(); closeOnboarding(); }}>Load Sample + Start</button>
              <button type="button" className="button-ghost" onClick={closeOnboarding}>Skip</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
