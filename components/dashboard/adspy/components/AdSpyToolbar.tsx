import {
  Bookmark,
  Check,
  RefreshCw,
} from "lucide-react";

import type {
  FilterId,
  Platform,
  SearchMode,
} from "../adspy-types";

import {
  FILTERS,
} from "../adspy-types";

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
  onModeChange: (
    value: SearchMode,
  ) => void;
  onFilterChange: (
    value: FilterId,
  ) => void;
  onRefresh: () => void;
  onTrack: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-[0_5px_20px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* MODE */}
        <div className="inline-flex w-fit rounded-xl bg-slate-50 p-1">
          <button
            type="button"
            onClick={() =>
              onModeChange(
                "advertiser",
              )
            }
            className={[
              "rounded-lg px-3 py-2 text-[11px] font-bold transition",
              mode === "advertiser"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            Advertiser
          </button>

          <button
            type="button"
            onClick={() =>
              onModeChange(
                "keyword",
              )
            }
            className={[
              "rounded-lg px-3 py-2 text-[11px] font-bold transition",
              mode === "keyword"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            Keyword
          </button>
        </div>

        {/* ACTIONS */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={
              disabled ||
              refreshing
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw
              size={13}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            {refreshing
              ? "Collecting…"
              : "Refresh dataset"}
          </button>

          <button
            type="button"
            onClick={onTrack}
            disabled={
              disabled
            }
            className={[
              "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[11px] font-bold transition",
              tracked
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {tracked ? (
              <Check
                size={13}
              />
            ) : (
              <Bookmark
                size={13}
              />
            )}

            {tracked
              ? "Tracking"
              : "Track brand"}
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5">
        {FILTERS.map(
          ([
            id,
            label,
          ]) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                onFilterChange(
                  id,
                )
              }
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] font-bold transition",
                filter ===
                id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
              ].join(" ")}
            >
              {label}
            </button>
          ),
        )}

        <span className="ml-auto hidden whitespace-nowrap text-[10px] font-medium text-slate-400 md:inline">
          {platform ===
          "meta"
            ? "Meta Ad Library"
            : platform}
        </span>
      </div>
    </div>
  );
}