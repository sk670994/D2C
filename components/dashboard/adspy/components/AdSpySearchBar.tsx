/* eslint-disable @next/next/no-img-element */

"use client";

import { ArrowUpRight, Check, Loader2, Search, UserRound, X } from "lucide-react";
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
  const show =
    suggestionsOpen &&
    mode === "advertiser" &&
    platform === "meta" &&
    value.trim().length >= 2;

  const selectAdvertiser = (advertiser: AutocompleteAdvertiser) => {
    onCloseSuggestions();
    onSelectAdvertiser(advertiser);
  };

  return (
    <div className="relative z-[10000] grid gap-2 lg:grid-cols-[minmax(0,1fr)_72px_112px]">
      <div className="relative min-w-0">
        <div
          className={`flex h-10 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm ${
            show ? "border-blue-300 ring-4 ring-blue-50" : "border-slate-200"
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
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            autoComplete="off"
            role="combobox"
            aria-expanded={show}
            aria-controls="adspy-autocomplete-list"
          />

          {selectedPageId ? (
            <span className="hidden shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700 sm:inline-flex">
              <Check size={10} />
              Exact
            </span>
          ) : null}

          {autocompleteLoading ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-blue-600" />
          ) : null}

          {value ? (
            <button
              type="button"
              onClick={() => {
                onCloseSuggestions();
                onChange("");
              }}
              aria-label="Clear"
              title="Clear"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>

        {show ? (
          <div
            id="adspy-autocomplete-list"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+5px)] z-[2147483000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,.16)]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Advertisers
              </span>
              <span className="text-[9px] font-semibold text-slate-400">
                {autocompleteLoading ? "Finding…" : `${advertisers.length} matches`}
              </span>
            </div>

            {advertisers.length > 0 ? (
              <div className="max-h-[360px] overflow-y-auto py-1">
                {advertisers.map((advertiser) => (
                  <button
                    key={advertiser.pageId || advertiser.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectAdvertiser(advertiser)}
                    data-adspy-control="suggestion"
                    className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-blue-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                      {advertiser.profileImageUrl ? (
                        <img
                          src={advertiser.profileImageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound size={15} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-xs font-bold text-slate-900">
                        {advertiser.label}
                        {advertiser.verification?.toUpperCase().includes("VERIFIED") ? (
                          <Check size={12} className="shrink-0 text-blue-600" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                        {advertiser.category || "Advertiser"}
                        {compact(advertiser.likes) ? ` · ${compact(advertiser.likes)} likes` : ""}
                      </span>
                    </span>

                    <span className="shrink-0 text-[9px] font-semibold text-slate-300 transition group-hover:text-blue-600">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {autocompleteLoading && advertisers.length === 0 ? (
              <div className="px-3.5 py-3.5 text-[10px] leading-5 text-slate-400">
                Finding advertisers…
              </div>
            ) : null}

            {!autocompleteLoading && advertisers.length === 0 ? (
              <button
                type="button"
                aria-label="Search exact phrase"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onCloseSuggestions();
                  onSelectQuery();
                }}
                className="flex w-full items-center justify-between gap-3 border-t border-slate-100 px-3.5 py-3 text-left hover:bg-blue-50"
              >
                <span>
                  <span className="block text-xs font-bold text-slate-800">Search exact phrase</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">No matching advertiser was returned.</span>
                </span>
                <ArrowUpRight size={13} className="text-slate-300" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <input
        value={country}
        onChange={(event) => onCountryChange(event.target.value.toUpperCase().slice(0, 2))}
        maxLength={2}
        aria-label="Country code"
        className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-bold uppercase text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
      />

      <button
        type="button"
        onClick={onSearch}
        data-adspy-control="primary"
        className="h-10 rounded-xl bg-slate-950 px-3.5 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800"
      >
        Search
      </button>
    </div>
  );
}
