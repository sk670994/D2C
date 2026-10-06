"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Entitlement } from "@/lib/billing/plans";

/** Shows only when the plan needs attention: trial ending, ended, or payment failed. */
export function PlanBanner() {
  const [e, setE] = useState<Entitlement | null>(null);

  useEffect(() => {
    fetch("/api/billing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { entitlement?: Entitlement } | null) => setE(body?.entitlement ?? null))
      .catch(() => undefined);
  }, []);

  if (!e || e.admin) return null;
  const endingSoon = e.status === "trialing" && (e.trialDaysLeft ?? 99) <= 3;
  const needsAction = !e.active || e.status === "past_due";
  if (!endingSoon && !needsAction) return null;

  return (
    <div className="zd-notice" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 16px", flexDirection: "row" }}>
      <span style={{ flex: 1, minWidth: 220 }}>
        <strong>{e.label}.</strong> {needsAction ? "New rivals and alerts are paused until a plan is active. Your data stays." : "Pick a plan to keep your rivals, Today and your rival report running."}
      </span>
      <Link href="/today/billing" className="zd-btn zd-btn-primary">
        See plans
      </Link>
    </div>
  );
}
