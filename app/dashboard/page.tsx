"use client";

import { useEffect, useState } from "react";
import type { CalculatedReport } from "@/lib/types/domain";
import { KpiCard } from "@/components/dashboard/KpiCard";

export default function DashboardPage() {
  const [report, setReport] = useState<CalculatedReport | null>(null);

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
        <KpiCard title="Blended CAC" value={"INR " + report.adMetrics.blendedCac.toFixed(2)} />
        <KpiCard title="Contribution Margin" value={(report.unitEconomics.contributionMarginPct * 100).toFixed(1) + "%"} />
      </section>

      <div className="card">
        <h3>AI Insights</h3>
        <textarea readOnly value={report.insights.summary + "\n\nPriority fixes:\n- " + report.insights.priorityFixes.join("\n- ")} />
      </div>
    </main>
  );
}
