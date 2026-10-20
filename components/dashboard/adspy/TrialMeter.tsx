"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Billing = { entitlement?: { status?: string; admin?: boolean; trialDaysLeft?: number | null }; usage?: { trialSearches?: number; trialSearchLimit?: number } };

/** Shared across mounts: the meter refetches at most once a minute. */
const MIN_INTERVAL_MS = 60_000;
let lastFetchAt = 0;

/**
 * Trial users always see how many brand searches they have left, so nobody
 * burns them by accident. `refreshKey` changes on a new search; the refetch
 * is throttled to once per 60 s (trailing, so the count still catches up).
 */
export function TrialMeter({ refreshKey }: { refreshKey: string }) {
  const [b, setB] = useState<Billing | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // 1.5 s after the search has counted, or when the minute is up.
    const wait = Math.max(1500, lastFetchAt + MIN_INTERVAL_MS - Date.now());
    const t = window.setTimeout(() => {
      lastFetchAt = Date.now();
      fetch("/api/billing", { cache: "no-store", signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: Billing | null) => setB(body))
        .catch(() => undefined);
    }, b === null ? 1500 : wait);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
    // `b` only decides whether this is the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const e = b?.entitlement;
  if (!e || e.admin || e.status !== "trialing") return null;
  const limit = b?.usage?.trialSearchLimit ?? 3;
  const left = Math.max(0, limit - (b?.usage?.trialSearches ?? 0));
  return (
    <p className="azs-fine" role="status" style={{ marginTop: 6 }}>
      <strong>
        {left} of {limit} new-brand searches left
      </strong>
      . Brands you&apos;ve already searched are free to open again.{" "}
      {left === 0 ? (
        <Link href="/today/billing" className="azs-link">
          See plans
        </Link>
      ) : null}
    </p>
  );
}
