/* eslint-disable @next/next/no-img-element */

"use client";

import { ArrowUpRight, Loader2, Search, UserRound, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
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
  const normalized = value.trim().toLowerCase();

  const displayAdvertisers = advertisers;

  const showSuggestions =
    suggestionsOpen &&
    mode === "advertiser" &&
    platform === "meta" &&
    normalized.length >= 2;

  const selectAdvertiser = (advertiser: AutocompleteAdvertiser) => {
    onCloseSuggestions();
    onSelectAdvertiser(advertiser);
  };

  return (
    <div className="relative z-50 grid gap-2 lg:grid-cols-[minmax(0,1fr)_74px_126px]">
      <div className="relative">
        <motion.div
          data-adspy-search-shell
          animate={{
            boxShadow: showSuggestions
              ? "0 0 0 4px rgba(37,99,235,.08), 0 14px 40px rgba(15,23,42,.08)"
              : "0 1px 3px rgba(15,23,42,.04)",
          }}
          className={`flex h-10 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition ${
            showSuggestions ? "border-blue-300" : "border-slate-200"
          }`}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Search size={16} className="shrink-0 text-slate-400" />

          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
              if (event.key === "Escape") onCloseSuggestions();
            }}
            placeholder="Search an advertiser or keyword…"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search advertiser or keyword"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls="adspy-autocomplete-list"
            aria-autocomplete="list"
            autoComplete="off"
          />

          {selectedPageId ? (
            <span className="hidden rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700 sm:inline">
              Exact
            </span>
          ) : null}

          {value ? (
            <button
              type="button"
              onClick={() => {
                onCloseSuggestions();
                onChange("");
              }}
              aria-label="Clear search"
              title="Clear search"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <img src="/adspy/icons/close.svg" alt="" width="12" height="12" />
            </button>
          ) : null}
        </motion.div>

        {showSuggestions ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-[10000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,.14)]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <span>Suggestions</span>
              {autocompleteLoading ? (
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  indexing
                </span>
              ) : (
                <span>{displayAdvertisers.length} matches</span>
              )}
            </div>

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCloseSuggestions();
                onSelectQuery();
              }}
              data-adspy-control="suggestion"
              role="option"
              aria-selected="false"
              className="group flex w-full items-center gap-2.5 border-b border-slate-100 px-3.5 py-2.5 text-left transition hover:bg-blue-50/55"
            >
              <span data-adspy-control="suggestion-icon" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-950 text-white shadow-sm">
                <Sparkles size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-slate-900">
                  Search “{value.trim()}”
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  {autocompleteLoading ? "Search now; advertiser index is updating in parallel" : "Search this exact phrase"}
                </span>
              </span>
              <ArrowUpRight size={13} className="text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600" />
            </button>

            <div className="px-3.5 pb-1.5 pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Advertisers
            </div>

            {displayAdvertisers.length ? (
              displayAdvertisers.map((advertiser) => (
                <button
                  key={advertiser.pageId || advertiser.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectAdvertiser(advertiser)}
                  data-adspy-control="suggestion"
                  className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                    {advertiser.profileImageUrl ? (
                      <img src={advertiser.profileImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={15} />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-xs font-bold text-slate-900">
                      {advertiser.label}
                      {advertiser.verification === "VERIFIED" ? (
                        <span className="text-blue-600">✓</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {advertiser.category || "Advertiser"}
                      {compact(advertiser.likes) ? ` · ${compact(advertiser.likes)} followers` : ""}
                    </span>
                  </span>

                  <ArrowUpRight size={12} className="text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-800" />
                </button>
              ))
            ) : (
              <div className="px-3.5 pb-3.5 text-[10px] text-slate-400">
                {autocompleteLoading ? "Finding indexed advertisers…" : "No indexed advertiser match yet."}
              </div>
            )}
          </motion.div>
        ) : null}
      </div>

      <input
        value={country}
        onChange={(event) => onCountryChange(event.target.value.toUpperCase().slice(0, 2))}
        maxLength={2}
        aria-label="Country code"
        className="h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-center text-xs font-bold uppercase text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
      />

      <motion.button
        type="button"
        onClick={() => {
          onCloseSuggestions();
          onSearch();
        }}
        data-adspy-control="primary"
        whileHover={{ y: -1, rotateX: -2, rotateY: 2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="h-10 rounded-xl bg-slate-950 px-3.5 text-[10px] font-bold text-white shadow-[0_10px_26px_rgba(15,23,42,.14)]"
        style={{ transformStyle: "preserve-3d", perspective: 700 }}
      >
        <span>Search</span>
      </motion.button>
    </div>
  );
}
