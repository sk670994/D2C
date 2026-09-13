"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Search,
  Sparkles,
} from "lucide-react";

import {
  AdSpyAnalysis,
} from "./AdSpyAnalysis";

import {
  AdSpySearchBar,
} from "./components/AdSpySearchBar";

import {
  AdSpyCreativeCard,
} from "./components/AdSpyCreativeCard";

import {
  AdSpyCreativeModal,
} from "./components/AdSpyCreativeModal";

import {
  AdSpyStats,
} from "./components/AdSpyStats";

import {
  AdSpyToolbar,
} from "./components/AdSpyToolbar";

import {
  AdSpyCollectionStatus,
} from "./components/AdSpyCollectionStatus";

import {
  AdSpyEmptyState,
} from "./components/AdSpyEmptyState";

import {
  useAdSpyAutocomplete,
} from "./hooks/useAdSpyAutocomplete";

import {
  useAdSpyCollection,
} from "./hooks/useAdSpyCollection";

import {
  useAdSpySearch,
} from "./hooks/useAdSpySearch";

import type {
  Ad,
  AutocompleteAdvertiser,
  FilterId,
  Platform,
  SearchMode,
} from "./adspy-types";

import {
  isActiveJob,
} from "./adspy-types";

export type AdSpySectionProps = {
  query?: string;

  country?: string;

  platform?: Platform;

  onQueryChange?: (
    query: string,
  ) => void;

  onCountryChange?: (
    country: string,
  ) => void;

  onPlatformChange?: (
    platform: Platform,
  ) => void;

  onResultCountChange?: (
    count: number,
  ) => void;
};

export function AdSpySection({
  query = "",
  country = "IN",
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [
    input,
    setInput,
  ] =
    useState(query);

  const [
    countryInput,
    setCountryInput,
  ] =
    useState(
      country.toUpperCase(),
    );

  const [
    mode,
    setMode,
  ] =
    useState<SearchMode>(
      "advertiser",
    );

  const [
    selectedPageId,
    setSelectedPageId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    filter,
    setFilter,
  ] =
    useState<FilterId>(
      "all",
    );

  const [
    selectedAd,
    setSelectedAd,
  ] =
    useState<Ad | null>(
      null,
    );

  const [
    tracked,
    setTracked,
  ] =
    useState(false);

  const [
    submittedQuery,
    setSubmittedQuery,
  ] =
    useState("");

  const autocomplete =
    useAdSpyAutocomplete(
      input,
      countryInput,
      platform,
      mode,
    );

  const search =
    useAdSpySearch({
      query:
        input,

      country:
        countryInput,

      platform,

      mode,

      pageId:
        selectedPageId,
    });

  const {
    search:
      runSearch,

    setError:
      setSearchError,
  } =
    search;

  const refreshResults =
    useCallback(
      () =>
        runSearch(
          1,
          true,
        ),
      [
        runSearch,
      ],
    );

  const collection =
    useAdSpyCollection({
      query:
        input,

      country:
        countryInput,

      platform,

      mode,

      pageId:
        selectedPageId,

      onResultsChanged:
        refreshResults,
    });

  const visibleAds =
    useMemo(
      () => {
        const items =
          [
            ...search.ads,
          ];

        switch (
          filter
        ) {
          case "active":
            return items.filter(
              (
                ad,
              ) =>
                ad.isActive !==
                false,
            );

          case "video":
            return items.filter(
              (
                ad,
              ) =>
                ad.creativeType ===
                "video",
            );

          case "image":
            return items.filter(
              (
                ad,
              ) =>
                ad.creativeType ===
                  "image" ||
                !ad.creativeType,
            );

          case "carousel":
            return items.filter(
              (
                ad,
              ) =>
                ad.creativeType ===
                "carousel",
            );

          case "creator":
            return items.filter(
              (
                ad,
              ) =>
                Boolean(
                  ad.creatorName,
                ),
            );

          case "longest":
            return items.sort(
              (
                a,
                b,
              ) =>
                Number(
                  b.runningDays ??
                    0,
                ) -
                Number(
                  a.runningDays ??
                    0,
                ),
            );

          default:
            return items;
        }
      },
      [
        filter,
        search.ads,
      ],
    );

  const doSearch =
    useCallback(
      async (
        queryOverride?:
          | string
          | undefined,

        pageIdOverride?:
          | string
          | null
          | undefined,
      ) => {
        const nextQuery =
          (
            queryOverride ??
            input
          ).trim();

        const nextPageId =
          pageIdOverride !==
          undefined
            ? pageIdOverride
            : selectedPageId;

        const nextCountry =
          countryInput
            .trim()
            .toUpperCase() ||
          "IN";

        if (
          nextQuery.length <
          2
        ) {
          setSearchError(
            "Enter at least 2 characters.",
          );

          return;
        }

        setInput(
          nextQuery,
        );

        setSelectedPageId(
          nextPageId ??
            null,
        );

        autocomplete.setOpen(
          false,
        );

        onQueryChange?.(
          nextQuery,
        );

        onCountryChange?.(
          nextCountry,
        );

        onPlatformChange?.(
          platform,
        );

        setSubmittedQuery(
          nextQuery,
        );

        /*
         * The actual creative/metrics search is the critical path.
         *
         * Tracking state is intentionally checked after the
         * search response has already been allowed to render.
         */
        const result =
          await runSearch(
            1,
            false,
            {
              query:
                nextQuery,

              pageId:
                nextPageId,

              country:
                nextCountry,

              platform,

              mode,
            },
          );

        if (!result) {
          return;
        }

        const active =
          Boolean(
            result.isRefreshing ||
              isActiveJob(
                result
                  .collectionJob
                  ?.status,
              ),
          );

        if (
          active &&
          result.collectionJob?.id
        ) {
          void collection.refresh(
            result.collectionJob.id,
          );
        } else if (
          Number(
            result.total ??
              0,
          ) === 0 &&
          result.collectionJobId
        ) {
          void collection.refresh(
            result.collectionJobId,
          );
        }

        /*
         * Do not block the result UI on the tracking lookup.
         */
        void collection
          .checkExisting()
          .then(
            (
              tracking,
            ) => {
              if (
                tracking
              ) {
                setTracked(
                  Boolean(
                    tracking.tracked,
                  ),
                );
              }
            },
          );

        onResultCountChange?.(
          Number(
            result.total ??
              0,
          ),
        );
      },
      [
        autocomplete,
        collection,
        countryInput,
        input,
        mode,
        onCountryChange,
        onPlatformChange,
        onQueryChange,
        onResultCountChange,
        platform,
        runSearch,
        setSearchError,
        selectedPageId,
      ],
    );

  const handleAdvertiserSelect =
    useCallback(
      (
        advertiser:
          AutocompleteAdvertiser,
      ) => {
        void doSearch(
          advertiser.label,
          advertiser.pageId,
        );
      },
      [
        doSearch,
      ],
    );

  const handleTrack =
    useCallback(
      async () => {
        search.setError(
          "",
        );

        try {
          const result =
            await collection.track();

          setTracked(
            Boolean(
              result.tracked,
            ),
          );

          if (
            result.job?.id
          ) {
            void collection.refresh(
              result.job.id,
            );
          }
        } catch (
          error
        ) {
          search.setError(
            error instanceof
              Error
              ? error.message
              : "Failed to track competitor.",
          );
        }
      },
      [
        collection,
        search,
      ],
    );

  const changeMode =
    useCallback(
      (
        nextMode: SearchMode,
      ) => {
        setMode(
          nextMode,
        );

        setSelectedPageId(
          null,
        );

        autocomplete.setOpen(
          false,
        );
      },
      [
        autocomplete,
      ],
    );

  const collecting =
    collection.refreshing ||
    search.refreshing ||
    isActiveJob(
      collection.job?.status ||
        search.job?.status,
    );

  const currentJob =
    collection.job ??
    search.job;

  const nextPage =
    Math.min(
      search.totalPages,
      search.page + 1,
    );

  const previousPage =
    Math.max(
      1,
      search.page - 1,
    );

  return (
    <section className="mx-auto w-[min(1380px,calc(100%-32px))] pb-20 pt-8 sm:w-[min(1380px,calc(100%-48px))]">
      <div className="overflow-visible rounded-4xl border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,.08)]">
        <header className="relative overflow-visible rounded-4xl bg-slate-950 px-5 py-8 text-white sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(59,130,246,.18),transparent_25%),radial-gradient(circle_at_10%_100%,rgba(37,99,235,.13),transparent_30%)]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
              <Sparkles
                size={13}
              />

              Ad intelligence workspace
            </div>

            <div className="mt-5 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
              <div>
                <h1 className="max-w-3xl text-4xl font-bold tracking-tighter sm:text-5xl">
                  See how competitors advertise.
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                  Search a brand, lock onto the exact advertiser identity, then inspect the public creative footprint behind its hooks, offers, formats and persistence.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <CheckCircle2
                    size={15}
                    className="text-emerald-400"
                  />

                  Evidence-first intelligence
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Publicly observable ad data only. Performance figures are never invented.
                </p>
              </div>
            </div>

            <div className="relative z-60 mt-8">
              <AdSpySearchBar
                value={input}
                country={
                  countryInput
                }
                platform={
                  platform
                }
                mode={
                  mode
                }
                advertisers={
                  autocomplete.advertisers
                }
                autocompleteLoading={
                  autocomplete.loading
                }
                suggestionsOpen={
                  autocomplete.open
                }
                selectedPageId={
                  selectedPageId
                }
                onChange={(
                  value,
                ) => {
                  setInput(
                    value,
                  );

                  setSelectedPageId(
                    null,
                  );

                  autocomplete.setOpen(
                    value.trim()
                      .length >=
                      2,
                  );
                }}
                onSearch={() =>
                  void doSearch()
                }
                onSelectAdvertiser={
                  handleAdvertiserSelect
                }
                onSelectQuery={() =>
                  void doSearch()
                }
                onFocus={() =>
                  autocomplete.setOpen(
                    input.trim()
                      .length >=
                      2,
                  )
                }
                onCloseSuggestions={() =>
                  autocomplete.setOpen(
                    false,
                  )
                }
                onCountryChange={
                  setCountryInput
                }
              />
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 sm:p-7">
          <AdSpyCollectionStatus
            job={
              currentJob
            }
            error={
              search.error ||
              collection.error
            }
          />

          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <Search
                  size={13}
                />

                {submittedQuery
                  ? "Current intelligence"
                  : "Start a search"}
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                {submittedQuery ||
                  "Search an advertiser or keyword above"}
              </div>
            </div>

            {search.lastUpdatedAt ? (
              <span className="text-xs text-slate-400">
                Last indexed{" "}
                {new Date(
                  search.lastUpdatedAt,
                ).toLocaleString(
                  "en-IN",
                  {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </span>
            ) : null}
          </div>

          <AdSpyStats
            summary={{
              ...search.summary,

              totalAds:
                search.summary
                  .totalAds ||
                search.total,
            }}
          />

          <AdSpyToolbar
            mode={
              mode
            }
            platform={
              platform
            }
            filter={
              filter
            }
            tracked={
              tracked
            }
            refreshing={
              collecting
            }
            disabled={
              input.trim()
                .length <
              2
            }
            onModeChange={
              changeMode
            }
            onFilterChange={
              setFilter
            }
            onRefresh={() =>
              void collection.refresh(
                currentJob?.id ??
                  null,
              )
            }
            onTrack={() =>
              void handleTrack()
            }
          />

          {search.ads.length ? (
            <>
              <div className="flex items-end justify-between gap-4 px-1">
                <div>
                  <div className="text-xl font-bold tracking-tight text-slate-950">
                    Creative library
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {
                      visibleAds.length
                    }{" "}
                    visible ·{" "}
                    {
                      search.total
                    }{" "}
                    indexed
                  </div>
                </div>

                {search.totalPages >
                1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        search.page <=
                          1 ||
                        search.loading
                      }
                      onClick={async () => {
                        const result =
                          await search.search(
                            previousPage,
                            true,
                          );

                        if (
                          result
                        ) {
                          onResultCountChange?.(
                            Number(
                              result.total ??
                                0,
                            ),
                          );
                        }
                      }}
                      title="Previous page"
                      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowLeft
                        size={15}
                      />
                    </button>

                    <span className="min-w-18.5 text-center text-xs font-bold text-slate-500">
                      {
                        search.page
                      }{" "}
                      /{" "}
                      {
                        search.totalPages
                      }
                    </span>

                    <button
                      type="button"
                      disabled={
                        search.page >=
                          search.totalPages ||
                        search.loading
                      }
                      onClick={async () => {
                        const result =
                          await search.search(
                            nextPage,
                            true,
                          );

                        if (
                          result
                        ) {
                          onResultCountChange?.(
                            Number(
                              result.total ??
                                0,
                            ),
                          );
                        }
                      }}
                      title="Next page"
                      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowRight
                        size={15}
                      />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {visibleAds.map(
                  (
                    ad,
                  ) => (
                    <AdSpyCreativeCard
                      key={`${ad.platform}:${ad.id}`}
                      ad={ad}
                      onInspect={() =>
                        setSelectedAd(
                          ad,
                        )
                      }
                    />
                  ),
                )}
              </div>
            </>
          ) : (
            <AdSpyEmptyState
              query={input}
              collecting={
                collecting ||
                search.loading
              }
            />
          )}

          {submittedQuery.length >=
          2 ? (
            <AdSpyAnalysis
              query={
                submittedQuery
              }
              country={
                countryInput
              }
              platform={
                platform
              }
            />
          ) : null}
        </div>
      </div>

      {selectedAd ? (
        <AdSpyCreativeModal
          ad={
            selectedAd
          }
          onClose={() =>
            setSelectedAd(
              null,
            )
          }
        />
      ) : null}
    </section>
  );
}