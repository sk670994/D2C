import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  AutocompleteAdvertiser,
  Platform,
} from "../adspy-types";

const DEBOUNCE_MS =
  180;

const CACHE_TTL_MS =
  15_000;

const MAX_CACHE_ENTRIES =
  50;

const MAX_RESULTS =
  8;

const LOCAL_FILTER_THRESHOLD =
  3;

type CacheEntry = {
  expiresAt: number;
  advertisers: AutocompleteAdvertiser[];
};

export function useAdSpyAutocomplete(
  query: string,
  country: string,
  platform: Platform,
  mode: "advertiser" | "keyword",
) {
  const [
    advertisers,
    setAdvertisers,
  ] = useState<AutocompleteAdvertiser[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    open,
    setOpenState,
  ] = useState(false);

  const cacheRef = useRef(
    new Map<string, CacheEntry>(),
  );

  const requestIdRef =
    useRef(0);

  const previousQueryRef =
    useRef("");

  const previousAdvertisersRef =
    useRef<AutocompleteAdvertiser[]>([]);

  const normalizedQuery =
    query.trim();

  const normalizedCountry =
    country.trim().toUpperCase() ||
    "IN";

  const canAutocomplete =
    normalizedQuery.length >= 2 &&
    mode === "advertiser" &&
    platform === "meta";

  useEffect(() => {
    const requestId =
      ++requestIdRef.current;

    let cancelled = false;

    const execute =
      async () => {
        if (
          cancelled ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        if (!canAutocomplete) {
          setAdvertisers([]);
          setLoading(false);

          previousQueryRef.current =
            "";

          previousAdvertisersRef.current =
            [];

          return;
        }

        const currentQuery =
          normalizedQuery.toLowerCase();

        const previousQuery =
          previousQueryRef.current.toLowerCase();

        /*
         * Fast local narrowing.
         */
        if (
          previousQuery &&
          currentQuery.startsWith(
            previousQuery,
          )
        ) {
          const narrowed =
            previousAdvertisersRef.current.filter(
              (
                advertiser,
              ) =>
                advertiser.label
                  .toLowerCase()
                  .includes(
                    currentQuery,
                  ),
            );

          if (
            narrowed.length >=
            LOCAL_FILTER_THRESHOLD
          ) {
            setAdvertisers(
              narrowed.slice(
                0,
                MAX_RESULTS,
              ),
            );

            setLoading(false);

            return;
          }
        }

        const cacheKey = [
          platform,
          normalizedCountry,
          currentQuery,
        ].join("|");

        const cached =
          cacheRef.current.get(
            cacheKey,
          );

        if (
          cached &&
          cached.expiresAt >
            Date.now()
        ) {
          setAdvertisers(
            cached.advertisers,
          );

          setLoading(false);

          previousQueryRef.current =
            normalizedQuery;

          previousAdvertisersRef.current =
            cached.advertisers;

          return;
        }

        if (cached) {
          cacheRef.current.delete(
            cacheKey,
          );
        }

        setLoading(true);

        try {
          const url =
            new URL(
              "/api/ad-intelligence/autocomplete",
              window.location.origin,
            );

          url.searchParams.set(
            "q",
            normalizedQuery,
          );

          url.searchParams.set(
            "country",
            normalizedCountry,
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
            cancelled ||
            requestId !==
              requestIdRef.current
          ) {
            return;
          }

          if (
            !response.ok
          ) {
            setAdvertisers([]);

            previousQueryRef.current =
              normalizedQuery;

            previousAdvertisersRef.current =
              [];

            return;
          }

          const data =
            (await response.json()) as {
              advertisers?: AutocompleteAdvertiser[];
            };

          if (
            cancelled ||
            requestId !==
              requestIdRef.current
          ) {
            return;
          }

          const next =
            Array.isArray(
              data.advertisers,
            )
              ? data.advertisers.slice(
                  0,
                  MAX_RESULTS,
                )
              : [];

          cacheRef.current.set(
            cacheKey,
            {
              expiresAt:
                Date.now() +
                CACHE_TTL_MS,
              advertisers:
                next,
            },
          );

          while (
            cacheRef.current.size >
            MAX_CACHE_ENTRIES
          ) {
            const oldest =
              cacheRef.current
                .keys()
                .next()
                .value as
                | string
                | undefined;

            if (!oldest) {
              break;
            }

            cacheRef.current.delete(
              oldest,
            );
          }

          setAdvertisers(
            next,
          );

          previousQueryRef.current =
            normalizedQuery;

          previousAdvertisersRef.current =
            next;
        } catch {
          if (
            cancelled ||
            requestId !==
              requestIdRef.current
          ) {
            return;
          }

          setAdvertisers([]);

          previousQueryRef.current =
            normalizedQuery;

          previousAdvertisersRef.current =
            [];
        } finally {
          if (
            !cancelled &&
            requestId ===
              requestIdRef.current
          ) {
            setLoading(false);
          }
        }
      };

    const timer =
      window.setTimeout(
        () => {
          void execute();
        },
        canAutocomplete
          ? DEBOUNCE_MS
          : 0,
      );

    return () => {
      cancelled = true;

      window.clearTimeout(
        timer,
      );
    };
  }, [
    canAutocomplete,
    normalizedCountry,
    normalizedQuery,
    platform,
  ]);

  const setOpen = (
    value: boolean,
  ) => {
    setOpenState(
      Boolean(
        value &&
          canAutocomplete,
      ),
    );
  };

  return {
    advertisers,

    loading:
      canAutocomplete &&
      loading,

    open:
      canAutocomplete &&
      open,

    setOpen,
  };
}