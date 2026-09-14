import { Bookmark, Check, ChevronDown, RefreshCw } from "lucide-react";

import type { FilterId, Platform, SearchMode } from "../adspy-types";
import { FILTERS } from "../adspy-types";

export function AdSpyToolbar({
  mode,
  platform,
  filter,
  tracked,
  refreshing,
  disabled,
  onModeChange,
  onFilterChange,
  onRefresh,
  onTrack,
}: {
  mode: SearchMode;
  platform: Platform;
  filter: FilterId;
  tracked: boolean;
  refreshing: boolean;
  disabled: boolean;
  onModeChange: (value: SearchMode) => void;
  onFilterChange: (value: FilterId) => void;
  onRefresh: () => void;
  onTrack: () => void;
}) {
  return (
    <div
      data-adspy-toolbar
      className="rounded-xl border border-slate-200 bg-white p-2 shadow-[0_5px_18px_rgba(15,23,42,.035)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["advertiser", "keyword"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              data-adspy-control={mode === value ? "mode-active" : "mode"}
              className="rounded-md px-2.5 py-1.5 text-[10px] font-bold"
            >
              {value === "advertiser" ? "Advertiser" : "Keyword"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || refreshing}
            data-adspy-control="secondary"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing…" : "Refresh"}
          </button>

          <button
            type="button"
            onClick={onTrack}
            disabled={disabled}
            data-adspy-control={tracked ? "tracked" : "secondary"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold disabled:opacity-45"
          >
            {tracked ? <Check size={12} /> : <Bookmark size={12} />}
            {tracked ? "Tracking" : "Track"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 overflow-x-auto border-t border-slate-100 pt-2">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onFilterChange(id)}
            data-adspy-control={filter === id ? "filter-active" : "filter"}
            className="whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[9px] font-bold"
          >
            {label}
          </button>
        ))}

        <span className="ml-auto hidden items-center gap-1 whitespace-nowrap text-[9px] font-semibold text-slate-400 md:inline-flex">
          <ChevronDown size={10} />
          {platform === "meta" ? "Meta Ad Library" : platform}
        </span>
      </div>
    </div>
  );
}
