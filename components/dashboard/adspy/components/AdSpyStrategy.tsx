"use client";

import {
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Minus,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

type StrategySignal = {
  type: string;
  severity:
    | "info"
    | "watch"
    | "important";
  title: string;
  summary: string;
  evidence: string[];
  windowDays: number;
  score: number;
};

type StrategyIntelligence = {
  state:
    | "stable"
    | "evolving"
    | "shifting";

  confidence:
    | "low"
    | "medium"
    | "high";

  score: number;

  signals: StrategySignal[];

  dominantBefore:
    | string
    | null;

  dominantNow:
    | string
    | null;

  summary: string;

  evidenceCount: number;

  windowDays: number;

  generatedAt: string;
};

function stateLabel(
  state: StrategyIntelligence["state"],
) {
  if (state === "shifting") {
    return "Strategy shifting";
  }

  if (state === "evolving") {
    return "Strategy evolving";
  }

  return "Strategy stable";
}

function severityIcon(
  severity: StrategySignal["severity"],
) {
  if (
    severity ===
    "important"
  ) {
    return (
      <CircleAlert
        size={14}
      />
    );
  }

  if (
    severity ===
    "watch"
  ) {
    return (
      <TrendingUp
        size={14}
      />
    );
  }

  return (
    <Minus
      size={14}
    />
  );
}

export function AdSpyStrategy({
  strategy,
}: {
  strategy:
    | StrategyIntelligence
    | null
    | undefined;
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  if (!strategy) {
    return null;
  }

 

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
      <div className="p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
              <BrainCircuit size={18} />
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Strategy intelligence
              </div>

              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                {stateLabel(
                  strategy.state,
                )}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {strategy.summary}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {strategy.confidence} confidence
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {strategy.evidenceCount} evidence points
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {strategy.windowDays}d window
            </span>
          </div>
        </div>

        {strategy.dominantBefore &&
        strategy.dominantNow &&
        strategy.dominantBefore !==
          strategy.dominantNow ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Earlier messaging
              </div>

              <div className="mt-1 text-sm font-bold text-slate-800">
                {strategy.dominantBefore}
              </div>
            </div>

            <ArrowRight
              size={15}
              className="hidden text-slate-400 sm:block"
            />

            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Recent messaging
              </div>

              <div className="mt-1 text-sm font-bold text-slate-950">
                {strategy.dominantNow}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-2 md:grid-cols-3">
          {strategy.signals
            .slice(0, 3)
            .map((signal) => (
              <div
                key={`${signal.type}:${signal.title}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {severityIcon(
                    signal.severity,
                  )}
                  {signal.severity}
                </div>

                <div className="mt-2 text-sm font-bold text-slate-900">
                  {signal.title}
                </div>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {signal.summary}
                </p>
              </div>
            ))}
        </div>

        {strategy.signals.length >
        3 ? (
          <button
            type="button"
            onClick={() =>
              setExpanded(
                (value) =>
                  !value,
              )
            }
            className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-slate-600 transition hover:text-slate-950"
          >
            {expanded
              ? "Hide evidence"
              : `View ${
                  strategy.signals.length -
                  3
                } more signals`}

            {expanded ? (
              <ChevronUp
                size={14}
              />
            ) : (
              <ChevronDown
                size={14}
              />
            )}
          </button>
        ) : null}

        {expanded ? (
          <div className="mt-5 space-y-3">
            {strategy.signals
              .slice(3)
              .map(
                (signal) => (
                  <div
                    key={`${signal.type}:${signal.title}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-white">
                        {severityIcon(
                          signal.severity,
                        )}
                      </div>

                      <div className="text-sm font-bold text-slate-900">
                        {signal.title}
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {signal.summary}
                    </p>

                    <div className="mt-3 space-y-1.5">
                      {signal.evidence.map(
                        (item) => (
                          <div
                            key={item}
                            className="flex gap-2 text-xs text-slate-500"
                          >
                            <ShieldCheck
                              size={13}
                              className="mt-0.5 shrink-0"
                            />

                            <span>
                              {item}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ),
              )}
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-400">
          <ShieldCheck size={13} />
          Derived from observed creative and historical data. Strategy
          signals are evidence-based interpretations, not proof of
          campaign performance.
        </div>
      </div>
    </section>
  );
}