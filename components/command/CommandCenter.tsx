"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CalculatedReport } from "@/lib/types/domain";
import { buildDailyBrief } from "@/lib/decision/brief";
import { createExperiment, loadExperiments, saveExperiments, type Experiment } from "@/lib/experiments/store";
import { askZwirk } from "@/lib/zwirk/ask";
import { Button } from "@/components/ui/button";

export function CommandCenter({
  report,
  userName,
  connectedAds,
  onGoSection
}: {
  report: CalculatedReport;
  userName: string;
  connectedAds: boolean;
  onGoSection?: (id: string) => void;
}) {
  const brief = useMemo(() => buildDailyBrief(report, userName), [report, userName]);
  const [openWhy, setOpenWhy] = useState<string | null>(brief.attention[0]?.id ?? null);
  const [showMath, setShowMath] = useState(false);
  const [experiments, setExperiments] = useState<Experiment[]>(() => loadExperiments());

  function addExperiment(from: string) {
    const next = createExperiment({
      hypothesis: from,
      control: "Current live creative / spend mix",
      variant: "Recommended change from Command Center",
      primaryMetric: "Contribution per delivered order",
      status: "draft"
    });
    const list = [next, ...experiments];
    setExperiments(list);
    saveExperiments(list);
  }

  return (
    <section className="cc-shell">
      <div className="cc-mast">
        <div>
          <p className="cc-kicker">{brief.dateLabel}</p>
          <h1>{brief.greeting}</h1>
          <p className="cc-headline">{brief.headline}</p>
        </div>
        <div className="cc-health" data-tone={brief.healthLabel}>
          <span>Business health</span>
          <strong>{brief.healthScore}</strong>
          <small>/ 100</small>
        </div>
      </div>

      <div className="cc-kpi-row">
        {brief.kpis.map((kpi) => (
          <div key={kpi.label} className={`cc-kpi cc-${kpi.tone}`}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.hint}</small>
          </div>
        ))}
      </div>

      <div className="cc-split">
        <div className="cc-attention">
          <div className="cc-section-label">
            {brief.attention.filter((item) => item.kind === "warning").length} need attention
          </div>
          {brief.attention.map((item) => (
            <article key={item.id} className={`cc-item cc-${item.kind}`}>
              <button type="button" className="cc-item-head" onClick={() => setOpenWhy(openWhy === item.id ? null : item.id)}>
                <span className="cc-dot" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  {item.impact ? <p className="cc-impact">{item.impact}</p> : null}
                </div>
              </button>
              {openWhy === item.id ? (
                <div className="cc-why">
                  <p className="cc-section-label">Evidence</p>
                  <ul>
                    {item.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="cc-action">{item.action}</p>
                  <div className="cc-actions">
                    <Button type="button" onClick={() => askZwirk(`Explain this and tell me exactly what to do: ${item.title}. ${item.body}`)}>
                      Ask ZWIRK
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => addExperiment(item.action)}>
                      Create experiment
                    </Button>
                    {item.id === "cac" || item.id === "leak" ? (
                      <Button type="button" variant="secondary" onClick={() => onGoSection?.("ad")}>View ad metrics</Button>
                    ) : (
                      <Link href="/adspy"><Button type="button" variant="secondary">Analyze market</Button></Link>
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <aside className="cc-side">
          <div className="cc-zwirk">
            <p className="cc-section-label">ZWIRK</p>
            <p>{brief.zwirkTake}</p>
            <Button type="button" onClick={() => askZwirk("What are the three actions I should take today, with expected rupee impact?")}>
              Review today&apos;s plan
            </Button>
          </div>

          {!connectedAds ? (
            <div className="cc-empty">
              <p>Meta isn&apos;t connected yet.</p>
              <p className="muted-text">Connect it to compare reported ROAS with contribution ROAS.</p>
              <Button type="button" variant="secondary" onClick={() => onGoSection?.("ad")}>Connect ads in Ad Metrics</Button>
            </div>
          ) : null}

          <button type="button" className="cc-math-toggle" onClick={() => setShowMath((v) => !v)}>
            {showMath ? "Hide calculation" : `Why ${brief.transparency.result}?`}
          </button>
          {showMath ? (
            <div className="cc-math">
              <p className="cc-section-label">{brief.transparency.title}</p>
              {brief.transparency.lines.map((line) => (
                <div key={line.label} className={`cc-math-row ${line.tone ?? ""}`}>
                  <span>{line.label}</span>
                  <strong>{line.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          <div className="cc-experiments">
            <p className="cc-section-label">Experiments</p>
            {experiments.length === 0 ? (
              <p className="muted-text">No tests yet. Create one from an attention item so Zooptrack can learn.</p>
            ) : (
              <ul>
                {experiments.slice(0, 4).map((exp) => (
                  <li key={exp.id}>
                    <strong>{exp.id}</strong>
                    <span>{exp.hypothesis}</span>
                    <em>{exp.status}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
