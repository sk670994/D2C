/* eslint-disable @next/next/no-img-element */

"use client";

import { Loader2, Search, UserRound, X } from "lucide-react";
import type { AutocompleteAdvertiser, Platform, SearchMode } from "../adspy-types";

function compact(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
  const showSuggestions =
    suggestionsOpen &&
    mode === "advertiser" &&
    platform === "meta" &&
    value.trim().length >= 2;

  return (
    <div className="relative z-50 grid gap-2 lg:grid-cols-[minmax(0,1fr)_72px_112px]">
      <div className="relative min-w-0">
        <div
          className={`flex h-11 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm transition ${
            showSuggestions
              ? "border-blue-300 ring-2 ring-blue-100"
              : "border-slate-200"
          }`}
        >
          <Search size={15} className="shrink-0 text-slate-400" />

          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
              if (event.key === "Escape") onCloseSuggestions();
            }}
            placeholder="Search advertiser or keyword…"
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search advertiser or keyword"
            autoComplete="off"
          />

          {selectedPageId ? (
            <span className="hidden shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700 sm:inline">
              Exact
            </span>
          ) : null}

          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear search"
              title="Clear search"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>

        {showSuggestions ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <span>Live suggestions</span>
              {autocompleteLoading ? (
                <Loader2 size={12} className="animate-spin text-blue-500" />
              ) : null}
            </div>

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSelectQuery}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50/60"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                <Search size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-900">
                  Search “{value.trim()}”
                </span>
                <span className="block text-[10px] text-slate-400">
                  Search this phrase
                </span>
              </span>
            </button>

            <div className="border-t border-slate-100 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Advertisers
            </div>

            {advertisers.length ? (
              advertisers.map((advertiser) => (
                <button
                  key={advertiser.pageId || advertiser.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectAdvertiser(advertiser)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50/60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
                    {advertiser.profileImageUrl ? (
                      <img
                        src={advertiser.profileImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <UserRound size={14} />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-xs font-semibold text-slate-900">
                      {advertiser.label}
                      {advertiser.verification === "VERIFIED" ? (
                        <span className="text-blue-600">✓</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {advertiser.category || "Meta advertiser"}
                      {compact(advertiser.likes)
                        ? ` · ${compact(advertiser.likes)} likes`
                        : ""}
                      {compact(advertiser.igFollowers)
                        ? ` · ${compact(advertiser.igFollowers)} IG`
                        : ""}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 pb-3 pt-1 text-[10px] text-slate-400">
                Fetching live advertiser matches…
              </div>
            )}
          </div>
        ) : null}
      </div>

      <input
        value={country}
        onChange={(event) =>
          onCountryChange(event.target.value.toUpperCase().slice(0, 2))
        }
        maxLength={2}
        aria-label="Country code"
        className="h-11 rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-bold uppercase text-slate-800 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />

      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-blue-950"
      >
        <Search size={14} />
        Search
      </button>
    </div>
  );
}
