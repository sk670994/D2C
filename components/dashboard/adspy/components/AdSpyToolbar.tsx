import { Bookmark, Check, RefreshCw } from "lucide-react";
import type { FilterId, Platform, SearchMode } from "../adspy-types";
import { FILTERS } from "../adspy-types";

export function AdSpyToolbar({ mode, platform, filter, tracked, refreshing, disabled, onModeChange, onFilterChange, onRefresh, onTrack }: {
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
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => onModeChange("advertiser")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "advertiser" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Advertiser</button>
          <button type="button" onClick={() => onModeChange("keyword")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "keyword" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Keyword</button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={disabled || refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Collecting…" : "Refresh dataset"}</button>
          <button type="button" onClick={onTrack} disabled={disabled} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${tracked ? "bg-emerald-50 text-emerald-700" : "border border-slate-200 text-slate-700"}`}>{tracked ? <Check size={14} /> : <Bookmark size={14} />}{tracked ? "Tracking" : "Track brand"}</button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 pt-3">
        {FILTERS.map(([id, label]) => <button key={id} type="button" onClick={() => onFilterChange(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${filter === id ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{label}</button>)}
        <span className="ml-auto hidden whitespace-nowrap text-xs text-slate-400 md:inline">{platform === "meta" ? "Meta Ad Library" : platform}</span>
      </div>
    </div>
  );
}


