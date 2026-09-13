"use client";

import { BrainCircuit, Lightbulb, LineChart, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReactBitsAnimatedList } from "@/components/ui/adspy/ReactBitsAnimatedList";

const ITEMS = [
  {
    icon: BrainCircuit,
    label: "GK FACT",
    text: "The first modern advertising agency is commonly associated with Volney B. Palmer in Philadelphia in 1841.",
  },
  {
    icon: LineChart,
    label: "MARKET NOTE",
    text: "Creative persistence is more useful as an observed signal when repeated hooks, formats and offers are considered together.",
  },
  {
    icon: Lightbulb,
    label: "ZOOPTRACK NOTE",
    text: "The strongest AdSpy advantage comes from comparing an advertiser's creative footprint across time.",
  },
  {
    icon: Sparkles,
    label: "RESEARCH TIP",
    text: "Cluster hooks, offers, creators and formats before turning repeated patterns into a strategic conclusion.",
  },
  {
    icon: BrainCircuit,
    label: "EVIDENCE RULE",
    text: "Observed advertising evidence should stay separate from interpretation so the intelligence remains auditable.",
  },
  {
    icon: Sparkles,
    label: "SANTA-BANTA",
    text: "Santa: Competitor ka ad itna lamba kyun chal raha hai? Banta: Budget nahi, bhai — creative ki job security hai!",
  },
];

export function AdSpyIntelligencePulse() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const renderedItems = useMemo(
    () =>
      ITEMS.map(({ icon: Icon, label, text }) => (
        <div key={`${label}-${text}`} className="flex min-h-[60px] items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
            <p className="mt-0.5 text-[11px] leading-4.5 text-slate-700">{text}</p>
          </div>
        </div>
      )),
    [],
  );

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ITEMS.length);
    }, 6200);

    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      data-adspy-framework="react-bits-research-pulse"
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,.035)]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:w-[205px] sm:shrink-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-white shadow-sm">
            <Sparkles size={13} />
          </div>
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">Research pulse</div>
            <div className="truncate text-[10px] font-semibold text-slate-800">Live context while you inspect the market</div>
          </div>
        </div>

        <ReactBitsAnimatedList items={renderedItems} activeIndex={index} pauseOnHover className="min-h-[60px] flex-1" />

        <div className="flex items-center justify-between gap-2 sm:w-[132px] sm:shrink-0 sm:justify-end">
          <div className="flex items-center gap-1" aria-hidden="true">
            {ITEMS.map((item, dot) => (
              <span key={item.label} className={dot === index ? "h-1.5 w-5 rounded-full bg-slate-900 transition-all" : "h-1.5 w-1.5 rounded-full bg-slate-200 transition-all"} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Resume research pulse" : "Pause research pulse"}
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
        </div>
      </div>
    </section>
  );
}
