/**
 * Daily AI allowance per user (ZWIRK chat + report insights share one budget).
 * Pure rules, unit-tested. Counted per IST day.
 */
import type { PlanKey } from "@/lib/billing/plans";

export const AI_CALLS_PER_DAY: Record<PlanKey, number> = {
  trial: 30,
  starter: 100,
  growth: 300,
  agency: 1000,
};

/** Trial ended / unpaid accounts keep a small taste. */
export const AI_CALLS_INACTIVE = 5;

export function aiDailyLimit(entitlement: { plan: PlanKey; admin: boolean; active: boolean } | null): number {
  if (!entitlement) return AI_CALLS_INACTIVE;
  if (entitlement.admin) return Number.POSITIVE_INFINITY;
  if (!entitlement.active) return AI_CALLS_INACTIVE;
  return AI_CALLS_PER_DAY[entitlement.plan] ?? AI_CALLS_PER_DAY.trial;
}

export function aiLimitMessage(active: boolean): string {
  return active
    ? "You've used today's AI allowance. It resets at midnight IST, or upgrade for more."
    : "Your trial has ended. Upgrade to keep using AI insights.";
}
