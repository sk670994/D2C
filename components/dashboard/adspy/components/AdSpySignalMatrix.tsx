"use client";

import { Activity, Layers3, Play, Users } from "lucide-react";

export function AdSpySignalMatrix({
  total,
  active,
  video,
  creators,
}: {
  total: number;
  active: number;
  video: number;
  creators: number;
}) {
  const items = [
    ["Library", total, Layers3],
    ["Active", active, Activity],
    ["Video", video, Play],
    ["Creators", creators, Users],
  ] as const;

  return (
    <section className="adspy-signal-matrix relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="pointer-events-none absolute inset-0 [perspective:900px]">
        <div className="adspy-signal-plane absolute inset-x-10 top-2 h-px bg-blue-100" />
        <div className="adspy-signal-plane adspy-signal-plane-2 absolute inset-x-20 top-1/2 h-px bg-slate-100" />
      </div>

      <div className="relative grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map(([label, value, Icon], index) => (
          <div
            key={label}
            className="adspy-signal-node flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/75 px-3 py-2.5"
            style={{ "--adspy-node-delay": `${index * 180}ms` } as React.CSSProperties}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-600">
              <Icon size={13} />
            </span>
            <span>
              <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {label}
              </span>
              <span className="block text-sm font-semibold text-slate-900">
                {value.toLocaleString("en-IN")}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
