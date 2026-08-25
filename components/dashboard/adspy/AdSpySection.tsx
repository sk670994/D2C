"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type {
  GlobalAdRecord,
  GlobalLanguage,
  GlobalMarket,
  GlobalSearchSummary,
} from "@/lib/ad-intelligence/global/types";

import { AdAutocomplete } from "./AdAutocomplete";
import { AdCreativeCard } from "./AdCreativeCard";
import { AdDetailDrawer } from "./AdDetailDrawer";
import { AdMarketLanguageIntelligence } from "./AdMarketLanguageIntelligence";

import styles from "./AdSpyPremium.module.css";

/* =========================================================
 * TYPES
 * ======================================================= */

type Platform =
  | "meta"
  | "google"
  | "linkedin";

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
};

type ApiResponse = {
  success: boolean;

  pending?: boolean;

  jobId?: string | null;

  message?: string;

  error?: string;

  ads?: GlobalAdRecord[];

  count?: number;

  pagination?: Pagination;

  summary?: Partial<GlobalSearchSummary> | null;

  intelligence?: {
    languages?: GlobalLanguage[];

    markets?: GlobalMarket[];
  };

  meta?: {
    source?: string;

    lastUpdatedAt?: string | null;

    refreshing?: boolean;

    collectionJobId?: string | null;

    stale?: boolean;

    cacheHit?: boolean;
  };
};

type JobResponse = {
  success: boolean;

  job?: {
    id: string;

    status: string;

    stage: string;

    discoveredAds: number;

    normalizedAds: number;

    persistedAds: number;

    errorMessage: string | null;

    updatedAt: string;
  };

  error?: string;
};

export type AdSpySectionProps = {
  query: string;

  country: string;

  platform?: Platform;

  onQueryChange: (
    query: string,
  ) => void;

  onCountryChange: (
    country: string,
  ) => void;

  onPlatformChange?: (
    platform: Platform,
  ) => void;

  onResultCountChange?: (
    count: number,
  ) => void;
};

/* =========================================================
 * HELPERS
 * ======================================================= */

function numeric(
  value: unknown,
  fallback = 0,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return fallback;
}

function emptySummary(): GlobalSearchSummary {
  return {
    totalAds: 0,

    activeAds: 0,

    inactiveAds: 0,

    videoAds: 0,

    imageAds: 0,

    carouselAds: 0,

    creatorAds: 0,

    averageRunningDays: 0,

    longestRunningDays: 0,
  };
}

/**
 * The backend has had several summary versions while
 * the global intelligence layer is being introduced.
 *
 * Never allow an incomplete stored/API summary to reach
 * JSX as undefined numeric fields.
 */
function normalizeSummary(
  value:
    | Partial<GlobalSearchSummary>
    | null
    | undefined,
  fallbackAdsCount = 0,
): GlobalSearchSummary {
  const fallback =
    emptySummary();

  const source =
    value ?? {};

  return {
    totalAds:
      numeric(
        source.totalAds,
        fallbackAdsCount,
      ),

    activeAds:
      numeric(
        source.activeAds,
      ),

    inactiveAds:
      numeric(
        source.inactiveAds,
      ),

    videoAds:
      numeric(
        source.videoAds,
      ),

    imageAds:
      numeric(
        source.imageAds,
      ),

    carouselAds:
      numeric(
        source.carouselAds,
      ),

    creatorAds:
      numeric(
        source.creatorAds,
      ),

    averageRunningDays:
      numeric(
        source.averageRunningDays,
      ),

    longestRunningDays:
      numeric(
        source.longestRunningDays,
      ),
  };
}

function formatUpdated(
  value?: string | null,
): string {
  if (!value) {
    return "Not indexed yet";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not indexed yet";
  }

  return `Updated ${date.toLocaleString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  )}`;
}

function stageLabel(
  stage?: string,
): string {
  const labels: Record<
    string,
    string
  > = {
    queued:
      "Preparing dataset",

    scraping:
      "Collecting public creatives",

    normalizing:
      "Normalizing creatives",

    enriching:
      "Updating intelligence",

    finalizing:
      "Finalizing dataset",

    complete:
      "Ready",

    failed:
      "Collection failed",
  };

  return (
    labels[
      stage ?? ""
    ] ??
    "Updating public creative data"
  );
}

/* =========================================================
 * COMPONENT
 * ======================================================= */

export function AdSpySection({
  query,
  country,
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [
    ads,
    setAds,
  ] =
    useState<
      GlobalAdRecord[]
    >([]);

  const [
    pagination,
    setPagination,
  ] =
    useState<Pagination | null>(
      null,
    );

  const [
    summary,
    setSummary,
  ] =
    useState<GlobalSearchSummary>(
      emptySummary(),
    );

  const [
    languages,
    setLanguages,
  ] =
    useState<GlobalLanguage[]>(
      [],
    );

  const [
    markets,
    setMarkets,
  ] =
    useState<GlobalMarket[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    pendingJobId,
    setPendingJobId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    jobStage,
    setJobStage,
  ] =
    useState("queued");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    selectedAd,
    setSelectedAd,
  ] =
    useState<GlobalAdRecord | null>(
      null,
    );

  const [
    tracked,
    setTracked,
  ] =
    useState(false);

  const requestIdRef =
    useRef(0);

  const abortRef =
    useRef<AbortController | null>(
      null,
    );

  /* =======================================================
   * SAFE SUMMARY
   * ===================================================== */

  const safeSummary =
    useMemo(
      () =>
        normalizeSummary(
          summary,
          pagination?.total ??
            ads.length,
        ),
      [
        ads.length,
        pagination?.total,
        summary,
      ],
    );

  /* =======================================================
   * SEARCH
   * ===================================================== */

  const fetchResults =
    useCallback(
      async (
        pageToLoad: number,
        options?: {
          background?: boolean;
        },
      ) => {
        const trimmedQuery =
          query.trim();

        const normalizedCountry =
          country
            .trim()
            .toUpperCase() ||
          "IN";

        if (!trimmedQuery) {
          setError(
            "Enter a brand or keyword.",
          );

          return;
        }

        const requestId =
          ++requestIdRef.current;

        abortRef.current?.abort();

        const controller =
          new AbortController();

        abortRef.current =
          controller;

        if (
          !options?.background
        ) {
          setLoading(true);
        }

        setError("");

        try {
          const params =
            new URLSearchParams({
              q: trimmedQuery,

              country:
                normalizedCountry,

              page:
                String(
                  pageToLoad,
                ),

              limit: "20",

              platform,

              mode: "advertiser",
            });

          const response =
            await fetch(
              `/api/ad-intelligence/search?${params.toString()}`,
              {
                cache:
                  "no-store",

                signal:
                  controller.signal,
              },
            );

          const data =
            (await response.json()) as ApiResponse;

          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          if (
            !response.ok &&
            response.status !==
              202
          ) {
            throw new Error(
              data.message ??
                data.error ??
                "AdSpy search failed.",
            );
          }

          const nextAds =
            Array.isArray(
              data.ads,
            )
              ? data.ads
              : [];

          const nextPagination =
            data.pagination ??
            null;

          /*
           * The summary is normalized immediately.
           *
           * This is the critical fix for legacy/shared-cache
           * responses that do not contain every field.
           */
          const nextSummary =
            normalizeSummary(
              data.summary,
              nextPagination?.total ??
                data.count ??
                nextAds.length,
            );

          setAds(
            nextAds,
          );

          setPagination(
            nextPagination,
          );

          setSummary(
            nextSummary,
          );

          setLanguages(
            Array.isArray(
              data.intelligence
                ?.languages,
            )
              ? data.intelligence!
                  .languages!
              : [],
          );

          setMarkets(
            Array.isArray(
              data.intelligence
                ?.markets,
            )
              ? data.intelligence!
                  .markets!
              : [],
          );

          const total =
            nextPagination?.total ??
            data.count ??
            nextAds.length;

          onResultCountChange?.(
            total,
          );

          const jobId =
            data.meta
              ?.collectionJobId ??
            data.jobId ??
            null;

          setPendingJobId(
            jobId,
          );

          const nextRefreshing =
            Boolean(
              data.meta
                ?.refreshing,
            ) ||
            Boolean(
              data.pending,
            );

          setRefreshing(
            nextRefreshing,
          );

          if (
            data.pending &&
            jobId
          ) {
            setJobStage(
              "queued",
            );
          }

          if (
            !data.pending &&
            !data.meta?.refreshing
          ) {
            setRefreshing(
              false,
            );
          }

          if (
            !data.success &&
            !data.pending
          ) {
            throw new Error(
              data.message ??
                data.error ??
                "AdSpy search failed.",
            );
          }
        } catch (err) {
          if (
            err instanceof
              DOMException &&
            err.name ===
              "AbortError"
          ) {
            return;
          }

          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setAds([]);

          setPagination(
            null,
          );

          setSummary(
            emptySummary(),
          );

          setLanguages(
            [],
          );

          setMarkets(
            [],
          );

          setPendingJobId(
            null,
          );

          setRefreshing(
            false,
          );

          setError(
            err instanceof
              Error
              ? err.message
              : "Unable to search AdSpy.",
          );

          onResultCountChange?.(
            0,
          );
        } finally {
          if (
            requestId ===
              requestIdRef.current &&
            !options?.background
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        country,
        onResultCountChange,
        platform,
        query,
      ],
    );

  /* =======================================================
   * CLEANUP
   * ===================================================== */

  useEffect(
    () => () =>
      abortRef.current?.abort(),
    [],
  );

  /* =======================================================
   * BACKGROUND JOB POLLING
   * ===================================================== */

  useEffect(() => {
    if (!pendingJobId) {
      return;
    }

    let stopped =
      false;

    const poll =
      async () => {
        try {
          const response =
            await fetch(
              `/api/ad-intelligence/search/status/${encodeURIComponent(
                pendingJobId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            (await response.json()) as JobResponse;

          if (
            stopped ||
            !data.success ||
            !data.job
          ) {
            return;
          }

          setJobStage(
            data.job.stage,
          );

          if (
            data.job.status ===
            "complete"
          ) {
            setPendingJobId(
              null,
            );

            setRefreshing(
              false,
            );

            await fetchResults(
              pagination?.page ??
                1,
              {
                background:
                  true,
              },
            );

            return;
          }

          if (
            data.job.status ===
            "failed"
          ) {
            setPendingJobId(
              null,
            );

            setRefreshing(
              false,
            );

            setError(
              data.job
                .errorMessage ??
                "The background collection failed. Existing indexed data remains available.",
            );
          }
        } catch {
          /*
           * Polling errors are intentionally silent.
           * The next interval retries.
           */
        }
      };

    void poll();

    const timer =
      window.setInterval(
        () => void poll(),
        1600,
      );

    return () => {
      stopped = true;

      window.clearInterval(
        timer,
      );
    };
  }, [
    fetchResults,
    pagination?.page,
    pendingJobId,
  ]);

  /* =======================================================
   * ACTIONS
   * ===================================================== */

  const runSearch = (
    page = 1,
  ) =>
    void fetchResults(
      page,
    );

  async function toggleTrack() {
    if (!query.trim()) {
      return;
    }

    try {
      const response =
        await fetch(
          "/api/ad-intelligence/track",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                query:
                  query.trim(),

                country:
                  country
                    .trim()
                    .toUpperCase() ||
                  "IN",

                platform,
              }),
          },
        );

      if (response.ok) {
        setTracked(
          true,
        );
      }
    } catch {
      /*
       * Tracking failure does not block discovery.
       */
    }
  }

  /* =======================================================
   * DERIVED UI DATA
   * ===================================================== */

  const activeShare =
    safeSummary.totalAds >
    0
      ? Math.round(
          (safeSummary.activeAds /
            safeSummary.totalAds) *
            100,
        )
      : 0;

  const staticAds =
    Math.max(
      0,
      safeSummary.imageAds +
        safeSummary.carouselAds,
    );

  const videoShare =
    safeSummary.totalAds >
    0
      ? Math.round(
          (safeSummary.videoAds /
            safeSummary.totalAds) *
            100,
        )
      : 0;

  const sortedMarketPreview =
    useMemo(
      () =>
        Array.isArray(
          markets,
        )
          ? markets.slice(
              0,
              12,
            )
          : [],
      [markets],
    );

  const sortedLanguagePreview =
    useMemo(
      () =>
        Array.isArray(
          languages,
        )
          ? languages.slice(
              0,
              10,
            )
          : [],
      [languages],
    );

  const updatedLabel =
    useMemo(
      () => {
        /*
         * At this stage the backend's meta timestamp may not
         * be present on older responses. Never pretend it is.
         */
        return formatUpdated(
          undefined,
        );
      },
      [],
    );

  /* =======================================================
   * RENDER
   * ===================================================== */

  return (
    <section
      className={
        styles.workspaceSection
      }
    >
      <div
        className={
          styles.sectionTop
        }
      >
        <div>
          <p
            className={
              styles.kicker
            }
          >
            AD INTELLIGENCE
          </p>

          <h2>
            Discover competitor
            creatives.
          </h2>

          <p
            className={
              styles.sectionLead
            }
          >
            A persistent market
            dataset, continuously
            refreshed in the
            background. Your search
            state stays private to
            your workspace.
          </p>
        </div>

        <div
          className={
            styles.sourcePill
          }
        >
          <span
            className={
              styles.sourceDot
            }
          />

          {platform ===
          "meta"
            ? "Meta Ad Library"
            : platform ===
              "google"
              ? "Google + YouTube"
              : "LinkedIn"}
        </div>
      </div>

      <div
        className={
          styles.searchShell
        }
      >
        <div
          className={
            styles.searchRow
          }
        >
          <label
            className={
              styles.field
            }
          >
            <span>
              Platform
            </span>

            <select
              value={platform}
              onChange={(event) =>
                onPlatformChange?.(
                  event.target
                    .value as Platform,
                )
              }
            >
              <option value="meta">
                Meta (Facebook +
                Instagram)
              </option>

              <option value="google">
                Google + YouTube
              </option>

              <option value="linkedin">
                LinkedIn
              </option>
            </select>
          </label>

          <label
            className={`${styles.field} ${styles.queryField}`}
          >
            <span>
              Brand or keyword
            </span>

            <AdAutocomplete
              value={query}
              onChange={
                onQueryChange
              }
              onSelect={(
                item,
              ) =>
                onQueryChange(
                  item.name,
                )
              }
            />
          </label>

          <label
            className={
              styles.fieldSmall
            }
          >
            <span>
              Country
            </span>

            <input
              value={country}
              maxLength={2}
              onChange={(
                event,
              ) =>
                onCountryChange(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /[^A-Z]/g,
                      "",
                    )
                    .slice(
                      0,
                      2,
                    ),
                )
              }
            />
          </label>

          <div
            className={
              styles.actionField
            }
          >
            <button
              className={
                styles.primaryButton
              }
              type="button"
              disabled={
                loading
              }
              onClick={() =>
                runSearch(
                  1,
                )
              }
            >
              {loading
                ? "Searching…"
                : "Search AdSpy"}
            </button>

            <button
              className={
                styles.secondaryButton
              }
              type="button"
              disabled={
                !query.trim()
              }
              onClick={
                toggleTrack
              }
            >
              {tracked
                ? "Tracked"
                : "Track brand"}
            </button>
          </div>
        </div>

        <div
          className={
            styles.searchMeta
          }
        >
          <span>
            {pagination
              ? `${numeric(
                  pagination.total,
                ).toLocaleString(
                  "en-IN",
                )} indexed ads`
              : "Search the indexed market"}
          </span>

          {pagination ? (
            <span>
              Page{" "}
              {
                pagination.page
              }{" "}
              /{" "}
              {
                pagination.totalPages ||
                1
              }
            </span>
          ) : null}

          <span>
            {updatedLabel}
          </span>

          {refreshing ? (
            <span
              className={
                styles.liveStatus
              }
            >
              <i />

              Updating source
              data
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          className={
            styles.errorPanel
          }
        >
          {error}
        </div>
      ) : null}

      {loading &&
      !ads.length ? (
        <div
          className={
            styles.loadingPanel
          }
        >
          <div
            className={
              styles.loadingOrb
            }
          >
            ↗
          </div>

          <div>
            <strong>
              Preparing your market
              view
            </strong>

            <p>
              Zooptrack will return
              indexed data
              immediately and
              refresh the public
              dataset in the
              background.
            </p>
          </div>

          <div
            className={
              styles.loadingStage
            }
          >
            {
              stageLabel(
                jobStage,
              )
            }
          </div>
        </div>
      ) : null}

      {refreshing &&
      !loading ? (
        <div
          className={
            styles.refreshPanel
          }
        >
          <span
            className={
              styles.liveStatus
            }
          >
            <i />

            Live refresh in
            progress
          </span>

          <span>
            {
              stageLabel(
                jobStage,
              )
            }
          </span>

          <span
            className={
              styles.refreshHint
            }
          >
            Existing results remain
            available while the
            dataset updates.
          </span>
        </div>
      ) : null}

      {ads.length > 0 ? (
        <>
          <div
            className={
              styles.summaryPanel
            }
          >
            <div
              className={
                styles.summaryHead
              }
            >
              <div>
                <p
                  className={
                    styles.kicker
                  }
                >
                  MARKET SNAPSHOT
                </p>

                <h3>
                  {safeSummary.totalAds.toLocaleString(
                    "en-IN",
                  )}{" "}
                  creatives indexed
                </h3>
              </div>

              <span
                className={
                  styles.dataNote
                }
              >
                Source facts are
                separated from
                Zooptrack-derived
                intelligence.
              </span>
            </div>

            <div
              className={
                styles.metricGrid
              }
            >
              <div>
                <span>
                  Active
                </span>

                <strong>
                  {safeSummary.activeAds.toLocaleString(
                    "en-IN",
                  )}
                </strong>

                <small>
                  {activeShare}% of
                  indexed ads
                </small>
              </div>

              <div>
                <span>
                  Static
                </span>

                <strong>
                  {staticAds.toLocaleString(
                    "en-IN",
                  )}
                </strong>

                <small>
                  Image + carousel
                </small>
              </div>

              <div>
                <span>
                  Video
                </span>

                <strong>
                  {safeSummary.videoAds.toLocaleString(
                    "en-IN",
                  )}
                </strong>

                <small>
                  {videoShare}% of
                  indexed ads
                </small>
              </div>

              <div>
                <span>
                  Creators
                </span>

                <strong>
                  {safeSummary.creatorAds.toLocaleString(
                    "en-IN",
                  )}
                </strong>

                <small>
                  Creator signals
                  detected
                </small>
              </div>

              <div>
                <span>
                  Avg. running
                </span>

                <strong>
                  {safeSummary.averageRunningDays
                    ? `${safeSummary.averageRunningDays}d`
                    : "—"}
                </strong>

                <small>
                  Observation-based
                </small>
              </div>

              <div>
                <span>
                  Longest running
                </span>

                <strong>
                  {safeSummary.longestRunningDays
                    ? `${safeSummary.longestRunningDays}d`
                    : "—"}
                </strong>

                <small>
                  Observation-based
                </small>
              </div>
            </div>
          </div>

          <AdMarketLanguageIntelligence
            languages={
              sortedLanguagePreview
            }
            markets={
              sortedMarketPreview
            }
          />

          <div
            className={
              styles.gridHeader
            }
          >
            <div>
              <p
                className={
                  styles.kicker
                }
              >
                CREATIVE LIBRARY
              </p>

              <h3>
                Research the ads,
                not the scorecards.
              </h3>
            </div>

            <span>
              {pagination
                ? `Showing ${
                    (pagination.page -
                      1) *
                      pagination.limit +
                    1
                  }–${Math.min(
                    pagination.page *
                      pagination.limit,
                    pagination.total,
                  )} of ${
                    pagination.total
                  }`
                : `${ads.length} ads`}
            </span>
          </div>

          <div
            className={
              styles.cardGrid
            }
          >
            {ads.map(
              (ad) => (
                <AdCreativeCard
                  key={`${ad.platform}-${ad.id}`}
                  ad={ad}
                  onOpen={
                    setSelectedAd
                  }
                />
              ),
            )}
          </div>

          {pagination &&
          pagination.totalPages >
            1 ? (
            <div
              className={
                styles.pagination
              }
            >
              <button
                className={
                  styles.secondaryButton
                }
                disabled={
                  !pagination.hasPreviousPage ||
                  loading
                }
                onClick={() =>
                  runSearch(
                    pagination.page -
                      1,
                  )
                }
              >
                Previous
              </button>

              <span>
                Page{" "}
                {
                  pagination.page
                }{" "}
                of{" "}
                {
                  pagination.totalPages
                }
              </span>

              <button
                className={
                  styles.primaryButton
                }
                disabled={
                  !pagination.hasNextPage ||
                  loading
                }
                onClick={() =>
                  runSearch(
                    pagination.page +
                      1,
                  )
                }
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading &&
      !ads.length &&
      !error &&
      !refreshing ? (
        <div
          className={
            styles.emptyPanel
          }
        >
          <div
            className={
              styles.emptyIcon
            }
          >
            ⌕
          </div>

          <h3>
            Search the advertising
            market
          </h3>

          <p>
            Start with a brand like
            BEARDO, Mamaearth or
            Nike. Zooptrack will
            search the persistent
            intelligence layer and
            only collect fresh
            source data when the
            dataset needs it.
          </p>
        </div>
      ) : null}

      <AdDetailDrawer
        ad={selectedAd}
        onClose={() =>
          setSelectedAd(null)
        }
      />
    </section>
  );
}