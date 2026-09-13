import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Job,
  Platform,
  SearchMode,
} from "../adspy-types";

const FIRST_POLL_MS =
  700;

const MAX_POLL_MS =
  3000;

const POLL_GROWTH =
  1.25;

const COLLECTION_TIMEOUT_MS =
  10 * 60_000;

export function useAdSpyCollection({
  query,
  country,
  platform,
  mode,
  pageId,
  onResultsChanged,
}: {
  query: string;
  country: string;
  platform: Platform;
  mode: SearchMode;
  pageId: string | null;
  onResultsChanged: () =>
    | Promise<unknown>
    | unknown;
}) {
  const [
    job,
    setJob,
  ] =
    useState<Job | null>(
      null,
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const abortRef =
    useRef<
      AbortController | null
    >(null);

  const activeJobRef =
    useRef<
      string | null
    >(null);

  useEffect(
    () => {
      return () => {
        abortRef.current?.abort();
      };
    },
    [],
  );

  const refresh =
    useCallback(
      async (
        existingJobId?:
          | string
          | null,
      ) => {
        const q =
          query.trim();

        if (
          q.length <
          2
        ) {
          return;
        }

        setError(
          "",
        );

        const controller =
          new AbortController();

        abortRef.current?.abort();

        abortRef.current =
          controller;

        let jobId =
          existingJobId ??
          activeJobRef.current ??
          job?.id ??
          null;

        try {
          /*
           * Do not start another collection job if we already
           * have a usable job ID.
           */
          if (
            !jobId
          ) {
            const url =
              new URL(
                "/api/ad-intelligence/refresh",
                window.location.origin,
              );

            url.searchParams.set(
              "q",
              q,
            );

            url.searchParams.set(
              "country",
              country
                .trim()
                .toUpperCase() ||
                "IN",
            );

            url.searchParams.set(
              "platform",
              platform,
            );

            url.searchParams.set(
              "mode",
              mode,
            );

            if (
              pageId &&
              platform ===
                "meta" &&
              mode ===
                "advertiser"
            ) {
              url.searchParams.set(
                "pageId",
                pageId,
              );
            }

            const response =
              await fetch(
                url,
                {
                  method:
                    "POST",

                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                },
              );

            const data =
              (await response.json()) as {
                success:
                  boolean;

                job?:
                  Job;

                error?:
                  string;
              };

            if (
              !response.ok ||
              !data.success ||
              !data.job
            ) {
              throw new Error(
                data.error ??
                  "Could not start collection.",
              );
            }

            jobId =
              data.job.id;

            activeJobRef.current =
              jobId;

            setJob(
              data.job,
            );
          }

          if (
            !jobId
          ) {
            return;
          }

          activeJobRef.current =
            jobId;

          setRefreshing(
            true,
          );

          const startedAt =
            Date.now();

          let delay =
            FIRST_POLL_MS;

          let lastPersisted =
            Number(
              job?.persistedAds ??
                -1,
            );

          let lastDiscovered =
            Number(
              job?.discoveredAds ??
                -1,
            );

          while (
            Date.now() -
              startedAt <
            COLLECTION_TIMEOUT_MS
          ) {
            await new Promise<void>(
              (
                resolve,
              ) => {
                window.setTimeout(
                  resolve,
                  delay,
                );
              },
            );

            if (
              controller.signal.aborted
            ) {
              return;
            }

            const statusUrl =
              `/api/ad-intelligence/search/status/${encodeURIComponent(
                jobId,
              )}`;

            const response =
              await fetch(
                statusUrl,
                {
                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                },
              );

            if (
              response.status ===
              401
            ) {
              throw new Error(
                "Your session expired. Please sign in again.",
              );
            }

            const data =
              (await response.json()) as {
                success:
                  boolean;

                job?:
                  Job;

                error?:
                  string;
              };

            if (
              !response.ok ||
              !data.success ||
              !data.job
            ) {
              throw new Error(
                data.error ??
                  "Collection status unavailable.",
              );
            }

            const nextJob =
              data.job;

            setJob(
              nextJob,
            );

            const persisted =
              Number(
                nextJob.persistedAds ??
                  0,
              );

            const discovered =
              Number(
                nextJob.discoveredAds ??
                  0,
              );

            const changed =
              persisted !==
                lastPersisted ||
              discovered !==
                lastDiscovered;

            if (
              changed
            ) {
              lastPersisted =
                persisted;

              lastDiscovered =
                discovered;

              /*
               * Refresh only when the persisted/discovered
               * counters actually change.
               */
              await onResultsChanged();
            }

            if (
              nextJob.status ===
              "complete"
            ) {
              await onResultsChanged();

              setRefreshing(
                false,
              );

              activeJobRef.current =
                null;

              return;
            }

            if (
              nextJob.status ===
              "failed"
            ) {
              throw new Error(
                nextJob.errorMessage ??
                  "Collection failed.",
              );
            }

            delay =
              Math.min(
                MAX_POLL_MS,
                Math.round(
                  delay *
                    POLL_GROWTH,
                ),
              );
          }

          /*
           * A timeout here does not mean the server-side job
           * stopped. It means the browser stopped waiting.
           */
          throw new Error(
            "Collection is taking longer than expected. The crawl continues in the background.",
          );
        } catch (
          collectionError
        ) {
          if (
            collectionError instanceof
              DOMException &&
            collectionError.name ===
              "AbortError"
          ) {
            return;
          }

          setError(
            collectionError instanceof
              Error
              ? collectionError.message
              : "Collection failed.",
          );
        } finally {
          setRefreshing(
            false,
          );
        }
      },
      [
        country,
        job,
        mode,
        onResultsChanged,
        pageId,
        platform,
        query,
      ],
    );

  const checkExisting =
    useCallback(
      async () => {
        const q =
          query.trim();

        if (
          q.length <
          2
        ) {
          return;
        }

        try {
          const url =
            new URL(
              "/api/ad-intelligence/track",
              window.location.origin,
            );

          url.searchParams.set(
            "query",
            q,
          );

          url.searchParams.set(
            "country",
            country
              .trim()
              .toUpperCase() ||
              "IN",
          );

          url.searchParams.set(
            "platform",
            platform,
          );

          const response =
            await fetch(
              url,
              {
                cache:
                  "no-store",
              },
            );

          if (
            !response.ok
          ) {
            return null;
          }

          return (await response.json()) as {
            tracked?:
              boolean;

            lastCollectedAt?:
              | string
              | null;
          };
        } catch {
          return null;
        }
      },
      [
        country,
        platform,
        query,
      ],
    );

  const track =
    useCallback(
      async () => {
        const q =
          query.trim();

        if (
          q.length <
          2
        ) {
          throw new Error(
            "Enter at least 2 characters.",
          );
        }

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

              cache:
                "no-store",

              body:
                JSON.stringify({
                  query:
                    q,

                  country:
                    country
                      .trim()
                      .toUpperCase() ||
                    "IN",

                  platform,
                }),
            },
          );

        const data =
          (await response.json()) as {
            success:
              boolean;

            tracked?:
              boolean;

            job?:
              Job;

            error?:
              string;
          };

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ??
              "Failed to track competitor.",
          );
        }

        if (
          data.job
        ) {
          activeJobRef.current =
            data.job.id;

          setJob(
            data.job,
          );
        }

        return data;
      },
      [
        country,
        platform,
        query,
      ],
    );

  return {
    job,

    setJob,

    refreshing,

    error,

    setError,

    refresh,

    checkExisting,

    track,
  };
}