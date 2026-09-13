"use client";

import {
  BrainCircuit,
  Lightbulb,
  LineChart,
  Sparkles,
} from "lucide-react";

const items = [
  {
    icon: BrainCircuit,
    label: "Creative intelligence",
    text: "Long-running creatives can be a stronger signal of advertiser conviction than a single visible launch.",
  },
  {
    icon: LineChart,
    label: "Market research",
    text: "Comparing creative formats, offers and messaging often reveals positioning patterns before performance data is available.",
  },
  {
    icon: Lightbulb,
    label: "Zooptrack note",
    text: "AdSpy becomes more valuable when today's creative footprint can be compared with the same advertiser weeks later.",
  },
  {
    icon: Sparkles,
    label: "Research tip",
    text: "Look for repeated hooks, recurring offers and creator patterns instead of judging one ad in isolation.",
  },
  {
    icon: BrainCircuit,
    label: "Quick fact",
    text: "A good competitive intelligence system should separate observed facts from derived interpretations.",
  },
  {
    icon: Sparkles,
    label: "Santa-Banta",
    text: "Santa: Ad kab band hui? Banta: Jab creative ne bola — bhai, ab mujhe rest day de!",
  },
];

export function AdSpyLoadingIntelligence() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="relative px-5 py-6 sm:px-7">
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden bg-slate-100">
          <div className="h-full w-1/3 animate-[adspy-scan_2.8s_ease-in-out_infinite] bg-slate-400/60" />
        </div>

        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
            <Sparkles size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Studying the advertising footprint
            </div>

            <div className="mt-3 h-16 overflow-hidden">
              <div className="animate-[adspy-loading-copy_18s_ease-in-out_infinite]">
                {items.map(
                  ({ icon: Icon, label, text }) => (
                    <div
                      key={`${label}:${text}`}
                      className="flex min-h-16 items-start gap-3"
                    >
                      <Icon
                        size={15}
                        className="mt-1 shrink-0 text-slate-500"
                      />

                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {label}
                        </div>

                        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                          {text}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:160ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:320ms]" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes adspy-scan {
          0% {
            transform: translateX(-120%);
          }
          50% {
            transform: translateX(220%);
          }
          100% {
            transform: translateX(220%);
          }
        }

        @keyframes adspy-loading-copy {
          0%,
          10% {
            transform: translateY(0);
          }

          13%,
          26% {
            transform: translateY(-64px);
          }

          29%,
          42% {
            transform: translateY(-128px);
          }

          45%,
          58% {
            transform: translateY(-192px);
          }

          61%,
          74% {
            transform: translateY(-256px);
          }

          77%,
          90% {
            transform: translateY(-320px);
          }

          93%,
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}