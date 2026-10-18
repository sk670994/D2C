import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { getEntitlement } from "@/lib/billing/server";
import { istDayKey, istDayStart, trialBrandKey, userBrandLimit } from "./credit-guard";

/** Paid-source credits spent since IST midnight (1 credit = 1 API page call). */
export async function apiCreditsUsedToday(): Promise<number> {
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_requests")
    .select("result")
    .gte("updated_at", istDayStart().toISOString())
    .in("result->>source", ["scrapecreators", "searchapi"])
    .limit(5000);
  if (error) {
    // Unknown spend: assume the budget is used rather than overspend.
    console.warn("[AdSpy credits] could not read today's spend:", error.message);
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (const row of (data ?? []) as Array<{ result: { searchApiCalls?: unknown } | null }>) {
    const calls = Number(row.result?.searchApiCalls);
    if (Number.isFinite(calls) && calls > 0) total += calls;
  }
  return total;
}

/**
 * Counts one live brand fetch against the user's daily allowance.
 * Returns false when the allowance is used up (the brand waits for the night run).
 */
export async function takeUserBrandSlot(userId: string, brand?: string): Promise<boolean | "trial_limit"> {
  let email: string | null = null;
  try {
    const { data } = await createGlobalServiceClient().auth.admin.getUserById(userId);
    email = data.user?.email ?? null;
  } catch {
    email = null;
  }
  const entitlement = await getEntitlement(userId, email).catch(() => null);
  const limit = entitlement ? userBrandLimit(entitlement) : 1;
  if (!Number.isFinite(limit)) return true;
  if (limit <= 0) return entitlement?.plan === "trial" ? "trial_limit" : false;
  // Free trial: 3 different brands in total for the whole trial (not per day).
  // The same brand again (a retry, another spelling of the same page, or a
  // search that showed too little) never uses another of the 3.
  // Key ends in ":trial" so the daily prune keeps it for the trial window.
  const brandKey = entitlement?.plan === "trial" && brand ? trialBrandKey(brand) : "";
  const seenKey = brandKey ? `adspy-tb:${userId}:${brandKey}:trial` : "";
  if (seenKey) {
    const { data: seen } = await createGlobalServiceClient().from("rate_limits").select("key").eq("key", seenKey).limit(1);
    if (seen?.length) return true;
  }
  const result =
    entitlement?.plan === "trial"
      ? await checkSharedRateLimit(`adspy-live:${userId}:trial`, limit, 8 * 86_400_000)
      : await checkSharedRateLimit(`adspy-live:${userId}:${istDayKey()}`, limit, 86_400_000);
  if (!result.allowed && entitlement?.plan === "trial") return "trial_limit";
  // Remember the brand only once it has actually used one of the 3.
  if (result.allowed && seenKey) await checkSharedRateLimit(seenKey, 1, 8 * 86_400_000).catch(() => undefined);
  return result.allowed;
}
