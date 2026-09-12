import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, Platform, SearchMode } from "../adspy-types";
import { isActiveJob } from "../adspy-types";

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
  onResultsChanged: () => Promise<unknown> | unknown;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refresh = useCallback(
    async (existingJobId?: string | null) => {
      const q = query.trim();
      if (q.length < 2) return;

      setRefreshing(true);
      setError("");

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        let jobId = existingJobId ?? job?.id ?? null;

        if (!jobId || !isActiveJob(job?.status)) {
          const url = new URL("/api/ad-intelligence/refresh", window.location.origin);
          url.searchParams.set("q", q);
          url.searchParams.set("country", country.trim().toUpperCase() || "IN");
          url.searchParams.set("platform", platform);
          url.searchParams.set("mode", mode);
          if (pageId && platform === "meta" && mode === "advertiser") {
            url.searchParams.set("pageId", pageId);
          }

          const response = await fetch(url, {
            method: "POST",
            cache: "no-store",
            signal: controller.signal,
          });
          const data = (await response.json()) as { success: boolean; job?: Job; error?: string };

          if (!response.ok || !data.success || !data.job) {
            throw new Error(data.error || "Could not start collection.");
          }

          jobId = data.job.id;
          setJob(data.job);
        }

        if (!jobId) return;

        const startedAt = Date.now();
        let delay = 1100;
        let lastPersisted = -1;

        while (Date.now() - startedAt < 10 * 60_000) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
          if (controller.signal.aborted) return;

          const response = await fetch(`/api/ad-intelligence/search/status/${encodeURIComponent(jobId)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const data = (await response.json()) as { success: boolean; job?: Job; error?: string };

          if (response.status === 401) {
            throw new Error("Your session expired. Please sign in again.");
          }
          if (!response.ok || !data.success || !data.job) {
            throw new Error(data.error || "Collection status unavailable.");
          }

          setJob(data.job);
          const persisted = Number(data.job.persistedAds ?? 0);

          if (persisted !== lastPersisted || !isActiveJob(data.job.status)) {
            lastPersisted = persisted;
            await onResultsChanged();
          }

          if (data.job.status === "complete") {
            setRefreshing(false);
            return;
          }

          if (data.job.status === "failed") {
            throw new Error(data.job.errorMessage || "Collection failed.");
          }

          delay = Math.min(4500, Math.round(delay * 1.35));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(error instanceof Error ? error.message : "Collection failed.");
      } finally {
        setRefreshing(false);
      }
    },
    [country, job, mode, onResultsChanged, pageId, platform, query],
  );

  const checkExisting = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;

    try {
      const url = new URL("/api/ad-intelligence/track", window.location.origin);
      url.searchParams.set("query", q);
      url.searchParams.set("country", country.trim().toUpperCase() || "IN");
      url.searchParams.set("platform", platform);
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json()) as { tracked?: boolean; lastCollectedAt?: string | null };
      return data;
    } catch {
      return null;
    }
  }, [country, platform, query]);

  const track = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) throw new Error("Enter at least 2 characters.");

    const response = await fetch("/api/ad-intelligence/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        query: q,
        country: country.trim().toUpperCase() || "IN",
        platform,
      }),
    });

    const data = (await response.json()) as { success: boolean; tracked?: boolean; job?: Job; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || "Failed to track competitor.");
    if (data.job) setJob(data.job);
    return data;
  }, [country, platform, query]);

  return { job, setJob, refreshing, error, setError, refresh, checkExisting, track };
}


