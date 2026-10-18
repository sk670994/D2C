"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Billing = { entitlement?: { status?: string; admin?: boolean; trialDaysLeft?: number | null }; usage?: { trialSearches?: number; trialSearchLimit?: number } };

/**
 * Trial users always see how many brand searches they have left, so nobody
 * burns them by accident. Refreshes whenever `refreshKey` changes (a new search).
 */
export function TrialMeter({ refreshKey }: { refreshKey: string }) {
  const [b, setB] = useState<Billing | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetch("/api/billing", { cache: "no-store", signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: Billing | null) => setB(body))
        .catch(() => undefined);
    }, 1500); // after the search has counted
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
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
      {e.trialDaysLeft != null ? ` · ${e.trialDaysLeft} trial days left` : ""}. Brands you&apos;ve already searched are free to open again.{" "}
      {left === 0 ? (
        <Link href="/today/billing" className="azs-link">
          See plans
        </Link>
      ) : null}
    </p>
  );
}
