import { useEffect, useRef, useState } from "react";
import type { AutocompleteAdvertiser, Platform } from "../adspy-types";

export function useAdSpyAutocomplete(
  query: string,
  country: string,
  platform: Platform,
  mode: "advertiser" | "keyword",
) {
  const [advertisers, setAdvertisers] = useState<AutocompleteAdvertiser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpenState] = useState(false);
  const requestId = useRef(0);

  const normalized = query.trim();
  const canAutocomplete =
    normalized.length >= 2 &&
    mode === "advertiser" &&
    platform === "meta";

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();

    if (!canAutocomplete) {
      return () => controller.abort();
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const url = new URL(
          "/api/ad-intelligence/autocomplete",
          window.location.origin,
        );
        url.searchParams.set("q", normalized);
        url.searchParams.set(
          "country",
          country.trim().toUpperCase() || "IN",
        );
        url.searchParams.set("platform", platform);

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = (await response.json()) as {
          advertisers?: AutocompleteAdvertiser[];
        };

        if (id !== requestId.current) return;

        setAdvertisers(
          Array.isArray(data.advertisers)
            ? data.advertisers.slice(0, 8)
            : [],
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (id === requestId.current) {
          setAdvertisers([]);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [canAutocomplete, country, normalized, platform]);

  const setOpen = (value: boolean) => {
    setOpenState(value && canAutocomplete);
  };

  return {
    advertisers,
    loading: canAutocomplete && loading,
    open: canAutocomplete && open,
    setOpen,
  };
}


