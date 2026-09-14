"use client";

import { Clock3, Database, ScanSearch } from "lucide-react";

function formatDate(value?: string | null) {
  if (!value) return "Waiting for first observation";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting for first observation";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdSpyTemporalFooter({
  total,
  page,
  totalPages,
  lastUpdatedAt,
}: {
  total: number;
  page: number;
  totalPages: number;
  lastUpdatedAt?: string | null;
}) {
  return (
    <footer className="adspy-temporal-footer relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="adspy-time-grid absolute inset-0" />
        <div className="adspy-time-orbit absolute left-[12%] top-1/2 h-24 w-24 -translate-y-1/2 rounded-full border border-blue-400/25" />
        <div className="adspy-time-orbit adspy-time-orbit-2 absolute left-[12%] top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300/30" />
      </div>

      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-blue-300">
            <Clock3 size={12} />
            Creative timeline
          </div>
          <p className="mt-1 text-sm font-medium text-slate-200">
            {total.toLocaleString("en-IN")} observed creatives · page {page}
            {totalPages ? ` of ${totalPages}` : ""}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            Latest observation · {formatDate(lastUpdatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[9px] font-semibold text-slate-300">
            <Database size={11} />
            Evidence stored
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-1.5 text-[9px] font-semibold text-blue-200">
            <ScanSearch size={11} />
            History ready
          </span>
        </div>
      </div>
    </footer>
  );
}
