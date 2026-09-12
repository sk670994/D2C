/* eslint-disable @next/next/no-img-element */

"use client";

import { Search, X, UserRound, Loader2 } from "lucide-react";
import type { AutocompleteAdvertiser, Platform, SearchMode } from "../adspy-types";

function compact(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function AdSpySearchBar({
  value,
  country,
  platform,
  mode,
  advertisers,
  autocompleteLoading,
  suggestionsOpen,
  selectedPageId,
  onChange,
  onSearch,
  onSelectAdvertiser,
  onSelectQuery,
  onFocus,
  onCloseSuggestions,
  onCountryChange,
}: {
  value: string;
  country: string;
  platform: Platform;
  mode: SearchMode;
  advertisers: AutocompleteAdvertiser[];
  autocompleteLoading: boolean;
  suggestionsOpen: boolean;
  selectedPageId: string | null;
  onChange: (value: string) => void;
  onSearch: () => void;
  onSelectAdvertiser: (advertiser: AutocompleteAdvertiser) => void;
  onSelectQuery: () => void;
  onFocus: () => void;
  onCloseSuggestions: () => void;
  onCountryChange: (value: string) => void;
}) {
  const showSuggestions = suggestionsOpen && mode === "advertiser" && platform === "meta" && value.trim().length >= 2;

  return (
    <div className="relative z-50 grid gap-3 lg:grid-cols-[minmax(0,1fr)_84px_132px]">
      <div className="relative">
        <div className={`flex h-14 items-center gap-3 rounded-2xl border bg-white px-4 shadow-sm transition ${showSuggestions ? "border-slate-400 ring-4 ring-slate-100" : "border-slate-200"}`}>
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
              if (event.key === "Escape") onCloseSuggestions();
            }}
            placeholder="Search an advertiser or keyword…"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search advertiser or keyword"
            autoComplete="off"
          />
          {selectedPageId ? <span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:inline">Exact advertiser</span> : null}
          {value ? <button type="button" onClick={() => onChange("")} aria-label="Clear search" title="Clear search" className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} /></button> : null}
        </div>

        {showSuggestions ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,.14)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <span>Suggestions</span>
              {autocompleteLoading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
            </div>

            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onSelectQuery} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white"><Search size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">Search “{value.trim()}”</span>
                <span className="mt-0.5 block text-xs text-slate-400">Search this exact phrase</span>
              </span>
            </button>

            <div className="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Advertisers</div>

            {advertisers.length ? advertisers.map((advertiser) => (
              <button key={advertiser.pageId || advertiser.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelectAdvertiser(advertiser)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
                  {advertiser.profileImageUrl ? <img src={advertiser.profileImageUrl} alt="" className="h-full w-full object-cover" /> : <UserRound size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold text-slate-900">
                    {advertiser.label}
                    {advertiser.verification === "VERIFIED" ? <span className="text-blue-600">✓</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">
                    {advertiser.category || "Advertiser"}{compact(advertiser.likes) ? ` · ${compact(advertiser.likes)} followers` : ""}
                  </span>
                </span>
              </button>
            )) : (
              <div className="px-4 pb-4 pt-1 text-xs text-slate-400">No indexed advertiser match yet. Search still works using the exact phrase.</div>
            )}
          </div>
        ) : null}
      </div>

      <input
        value={country}
        onChange={(event) => onCountryChange(event.target.value.toUpperCase().slice(0, 2))}
        maxLength={2}
        aria-label="Country code"
        className="h-14 rounded-2xl border border-slate-200 bg-white px-3 text-center text-sm font-bold uppercase text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
      />

      <button type="button" onClick={onSearch} className="h-14 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800">
        Search
      </button>
    </div>
  );
}


