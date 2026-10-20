import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { getEntitlement } from "@/lib/billing/server";
import {
  atCreditFloor,
  creditsRemainingFrom,
  istDayKey,
  istDayStart,
  paidCreditFloor,
  paidCreditStart,
  trialBrandKey,
  userBrandLimit,
} from "./credit-guard";

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

/** Credits billed by paid collections finished after `sinceIso` (same count as above). */
async function paidCallsSince(sinceIso: string, excludeId?: string): Promise<number | null> {
  let query = createGlobalServiceClient()
    .from("adspy_requests")
    .select("id,result")
    .gt("updated_at", sinceIso)
    .in("result->>source", ["scrapecreators", "searchapi"]);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(20000);
  if (error) return null;
  let total = 0;
  for (const row of (data ?? []) as Array<{ result: { searchApiCalls?: unknown } | null }>) {
    const calls = Number(row.result?.searchApiCalls);
    if (Number.isFinite(calls) && calls > 0) total += calls;
  }
  return total;
}

/**
 * ScrapeCreators credits left. Each paid collection saves the balance the
 * API reported on its last response (adspy_requests.result.creditsRemaining);
 * calls billed after that one are subtracted. Without any reported balance,
 * ADSPY_PAID_CREDIT_START minus our spend since ADSPY_PAID_CREDIT_START_AT.
 * Null = unknown (the floor is not applied; the daily cap still is).
 */
export async function paidCreditsRemaining(): Promise<{ remaining: number; source: "api" | "estimate"; observedAt: string | null } | null> {
  try {
    const { data, error } = await createGlobalServiceClient()
      .from("adspy_requests")
      .select("id,result,updated_at")
      .eq("result->>source", "scrapecreators")
      .not("result->>creditsRemaining", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    const latest = !error ? ((data ?? [])[0] as { id: string; result: { creditsRemaining?: unknown } | null; updated_at: string } | undefined) : undefined;
    const observed = latest ? Number(latest.result?.creditsRemaining) : NaN;
    if (latest && Number.isFinite(observed)) {
      const after = await paidCallsSince(latest.updated_at, latest.id);
      const value = creditsRemainingFrom({ observed, spentSinceObserved: after ?? 0, start: null, spentSinceStart: null });
      return value ? { ...value, observedAt: latest.updated_at } : null;
    }
    const start = paidCreditStart();
    if (!start) return null;
    const spent = await paidCallsSince(start.at);
    const value = creditsRemainingFrom({ observed: null, start: start.start, spentSinceStart: spent });
    return value ? { ...value, observedAt: start.at } : null;
  } catch (error) {
    console.warn("[AdSpy credits] could not read the paid balance:", error instanceof Error ? error.message : error);
    return null;
  }
}

let floorLogged = false;
/** True (and logged once per instance) when paid reads must stop at the floor. */
export async function paidCreditFloorReached(): Promise<{ reached: boolean; remaining: number | null }> {
  const balance = await paidCreditsRemaining();
  const floor = paidCreditFloor();
  const reached = atCreditFloor(balance?.remaining, floor);
  if (reached && !floorLogged) {
    floorLogged = true;
    console.warn("[AdSpy credits] paid balance at the floor: live look-ups now wait for tonight's PC run", {
      remaining: balance?.remaining,
      floor,
      source: balance?.source,
    });
  }
  return { reached, remaining: balance?.remaining ?? null };
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
