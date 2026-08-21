import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InsightList } from "@/components/dashboard/DashboardPrimitives";
import type { CalculatedReport } from "@/lib/types/domain";

export function DashboardInsightsSection({
  report,
  loading,
  error,
  appliedFixes,
  onGenerate,
  onApplyFix,
  onDismissFix
}: {
  report: CalculatedReport;
  loading: boolean;
  error: string | null;
  appliedFixes: number[];
  onGenerate: () => void;
  onApplyFix: (index: number) => void;
  onDismissFix: (index: number) => void;
}) {
  const { insights } = report;

  return (
    <section className="surface section-surface insights-surface">
      <div className="section-head">
        <h3>AI Insights</h3>
        <p>Operator-grade insights for profitability, scaling, and execution.</p>
        <Button type="button" onClick={onGenerate} disabled={loading}>
          {loading ? "Generating..." : "Get AI Insights"}
        </Button>
      </div>
      <div className="insight-meta-row">
        <Badge variant="secondary">Source: {insights.source}</Badge>
        <Badge variant="secondary">Latency: {insights.latencyMs}ms</Badge>
        <Badge variant={loading ? "warning" : "success"}>
          {loading ? "Generating" : insights.basedOnPreviousCalculation ? "Needs Refresh" : "Ready"}
        </Badge>
        <Badge variant="secondary">Confidence: {insights.source === "gemini" ? "High" : "Medium"}</Badge>
      </div>
      {insights.source !== "pending" ? (
        <div className="mt-2 text-sm text-muted-foreground">
          {insights.basedOnPreviousCalculation
            ? "Based on last generated analysis. Your assumptions have changed."
            : "Based on current calculation."}
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {insights.priorityFixes.length > 0 ? (
        <div className="fix-grid">
          {insights.priorityFixes.map((fix, index) => (
            <article key={`${fix}-${index}`} className="fix-card">
              <p>{fix}</p>
              <div className="fix-actions">
                <Button type="button" onClick={() => onApplyFix(index)} disabled={appliedFixes.includes(index)}>
                  {appliedFixes.includes(index) ? "Applied" : "Apply Draft"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => onDismissFix(index)}>Dismiss</Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <article className="fix-card">
        <p className="metric-title">Executive Summary</p>
        <p className="muted-text">{insights.summary}</p>
      </article>
      <div className="fix-grid">
        <InsightList title="Growth Levers" items={insights.growthLevers} />
        <InsightList title="Risk Alerts" items={insights.riskAlerts} />
        <InsightList title="Channel Plan" items={insights.channelPlan} />
        <InsightList title="Experiment Backlog" items={insights.experimentBacklog} />
        <InsightList title="Cashflow Actions" items={insights.cashflowActions} />
        <InsightList title="KPI Watchlist" items={insights.watchlistKpis} />
        <InsightList title="Next 30 Days" items={insights.next30Days} />
      </div>
      <Textarea readOnly value={insights.summary} />
    </section>
  );
}
