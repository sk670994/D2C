"use client";

import { BrainCircuit, Lightbulb, LineChart, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReactBitsAnimatedList } from "@/components/ui/adspy/ReactBitsAnimatedList";

const ITEMS = [
  {
    icon: BrainCircuit,
    label: "GK FACT",
    text: "The first modern advertising agency is commonly credited to Volney B. Palmer in Philadelphia in 1841.",
  },
  {
    icon: LineChart,
    label: "MARKET INTELLIGENCE",
    text: "Creative breadth can reveal positioning: repeated hooks and formats often expose a stronger strategy than one isolated ad.",
  },
  {
    icon: Lightbulb,
    label: "ZOOPTRACK NOTE",
    text: "AdSpy becomes more valuable when today's creative footprint can be compared with the same advertiser weeks later.",
  },
  {
    icon: Sparkles,
    label: "RESEARCH TIP",
    text: "Repeated hooks, offers, creators and formats are stronger clues than judging a single polished creative.",
  },
  {
    icon: BrainCircuit,
    label: "INTELLIGENCE CHECK",
    text: "Keep observed facts separate from derived strategic interpretation so the evidence remains auditable.",
  },
  {
    icon: Sparkles,
    label: "SANTA-BANTA",
    text: "Santa: Ad kab band hui? Banta: Jab creative ne bola — bhai, ab mujhe rest day de!",
  },
];

export function AdSpyLoadingIntelligence({
  compact = false,
  loading = true,
}: {
  compact?: boolean;
  loading?: boolean;
}) {
  const [index, setIndex] = useState(0);

  const renderedItems = useMemo(
    () =>
      ITEMS.map((item, itemIndex) => {
        const Icon = item.icon;
        return (
          <div
            key={`${item.label}-${itemIndex}`}
            className="flex min-h-16 items-start gap-3"
          >
            <Icon size={15} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </div>
              <p
                className={[
                  "mt-1 text-sm leading-5 text-slate-800",
                  compact ? "line-clamp-2" : "",
                ].join(" ")}
              >
                {item.text}
              </p>
            </div>
          </div>
        );
      }),
    [compact],
  );

  useEffect(() => {
    if (!loading) return;

    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % renderedItems.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [loading, renderedItems.length]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden bg-slate-100">
        <div className="h-full w-24 animate-[adspy-scan_2.8s_ease-in-out_infinite] bg-slate-400/60" />
      </div>

      <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
          <Sparkles size={15} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Studying the advertising footprint
          </div>

          <ReactBitsAnimatedList
            items={renderedItems}
            activeIndex={index}
            className={compact ? "mt-1 h-11" : "mt-2 h-14"}
          />
        </div>

        <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 rounded-full bg-slate-300"
              style={{
                animation: `adspy-dot 1.2s ease-in-out ${dot * 160}ms infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes adspy-scan {
          0% { transform: translateX(-120px); }
          50%, 100% { transform: translateX(420px); }
        }
        @keyframes adspy-dot {
          0%, 100% { opacity: .35; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-1px); }
        }
      `}</style>
    </div>
  );
}
