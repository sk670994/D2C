import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { getEntitlement } from "@/lib/billing/server";
import { istDayKey, istDayStart, userBrandLimit } from "./credit-guard";

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
export async function takeUserBrandSlot(userId: string): Promise<boolean> {
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
  if (limit <= 0) return false;
  const result = await checkSharedRateLimit(`adspy-live:${userId}:${istDayKey()}`, limit, 86_400_000);
  return result.allowed;
}
