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
export async function takeUserBrandSlot(userId: string, brand: { pageId?: string | null; name?: string | null } = {}): Promise<boolean | "trial_limit"> {
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
  // The same brand again (a retry, another spelling, or opening its page after
  // a name search) never uses another of the 3. Keys end in ":trial" so the
  // daily prune keeps them for the trial window.
  const trial = entitlement?.plan === "trial";
  const pageKey = trial && brand.pageId ? `adspy-tb:${userId}:${trialBrandKey(brand.pageId)}:trial` : "";
  const nameCompact = trial && brand.name ? trialBrandKey(brand.name) : "";
  const nameKey = nameCompact ? `adspy-tb:${userId}:${nameCompact}:trial` : "";
  if (pageKey || nameKey) {
    const db = createGlobalServiceClient();
    const { data: seen } = await db.from("rate_limits").select("key").in("key", [pageKey, nameKey].filter(Boolean));
    const has = new Set(((seen ?? []) as Array<{ key: string }>).map((r) => r.key));
    if (pageKey && has.has(pageKey)) return true;
    if (!pageKey && nameKey && has.has(nameKey)) return true;
    if (pageKey && nameKey && has.has(nameKey)) {
      // Name already paid for: free only if this page really is that brand,
      // so an old name can't be paired with a different page for free.
      const { data: adv } = await db.from("ad_intelligence_advertisers").select("page_name").eq("page_id", brand.pageId!).limit(1);
      const pageName = trialBrandKey(String((adv ?? [])[0]?.page_name ?? ""));
      if (pageName && (pageName === nameCompact || pageName.startsWith(nameCompact) || nameCompact.startsWith(pageName))) return true;
    }
  }

  const result = trial
    ? await checkSharedRateLimit(`adspy-live:${userId}:trial`, limit, 8 * 86_400_000)
    : await checkSharedRateLimit(`adspy-live:${userId}:${istDayKey()}`, limit, 86_400_000);
  if (!result.allowed && trial) return "trial_limit";
  // Remember the brand only once it has actually used one of the 3.
  if (result.allowed) {
    for (const key of [pageKey, nameKey].filter(Boolean)) await checkSharedRateLimit(key, 1, 8 * 86_400_000).catch(() => undefined);
  }
  return result.allowed;
}
