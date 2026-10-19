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
 * What takeUserBrandSlot actually spent, so a collection that then fails to
 * start can give it back (refundUserBrandSlot). Empty when nothing was spent
 * (unlimited plan, or a brand the user already paid for).
 */
export type BrandSlotReceipt = { counterKey?: string; brandKeys?: string[] };

/**
 * Counts one live brand fetch against the user's daily allowance.
 * Returns false when the allowance is used up (the brand waits for the night run).
 * Pass `receipt` to learn what was spent.
 */
export async function takeUserBrandSlot(
  userId: string,
  brand: { pageId?: string | null; name?: string | null } = {},
  receipt?: BrandSlotReceipt,
): Promise<boolean | "trial_limit"> {
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
  let has = new Set<string>();
  if (pageKey || nameKey) {
    const db = createGlobalServiceClient();
    const { data: seen } = await db.from("rate_limits").select("key").in("key", [pageKey, nameKey].filter(Boolean));
    has = new Set(((seen ?? []) as Array<{ key: string }>).map((r) => r.key));
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

  const counterKey = trial ? `adspy-live:${userId}:trial` : `adspy-live:${userId}:${istDayKey()}`;
  const result = trial
    ? await checkSharedRateLimit(counterKey, limit, 8 * 86_400_000)
    : await checkSharedRateLimit(counterKey, limit, 86_400_000);
  if (!result.allowed && trial) return "trial_limit";
  // Remember the brand only once it has actually used one of the 3.
  if (result.allowed) {
    const brandKeys = [pageKey, nameKey].filter((key) => key && !has.has(key));
    for (const key of [pageKey, nameKey].filter(Boolean)) await checkSharedRateLimit(key, 1, 8 * 86_400_000).catch(() => undefined);
    if (receipt) {
      receipt.counterKey = counterKey;
      receipt.brandKeys = brandKeys;
    }
  }
  return result.allowed;
}

/**
 * Gives back a slot taken by takeUserBrandSlot when the collection it paid
 * for could not be started (database error before the job was queued).
 * Best effort, never throws: decrements the allowance counter (never below
 * 0) and forgets the brand keys this call created. Trial limits unchanged.
 */
export async function refundUserBrandSlot(receipt: BrandSlotReceipt): Promise<void> {
  try {
    const db = createGlobalServiceClient();
    if (receipt.counterKey) {
      const { data } = await db.from("rate_limits").select("hits").eq("key", receipt.counterKey).maybeSingle();
      const hits = Number((data as { hits?: number } | null)?.hits ?? 0);
      if (hits > 0) {
        // Optimistic: only if nobody else hit the counter in between.
        await db.from("rate_limits").update({ hits: hits - 1 }).eq("key", receipt.counterKey).eq("hits", hits);
      }
    }
    if (receipt.brandKeys?.length) {
      await db.from("rate_limits").delete().in("key", receipt.brandKeys);
    }
  } catch (error) {
    console.warn("[AdSpy credits] slot refund failed:", error instanceof Error ? error.message : error);
  }
}
