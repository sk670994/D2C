import "server-only";

import { getEntitlement } from "@/lib/billing/server";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { istDayKey } from "@/lib/ad-intelligence/credit-guard";
import { aiDailyLimit, aiLimitMessage } from "./limits";

/** Counts one AI call. Returns null when allowed, or the message to show. */
export async function takeAiCall(userId: string, email: string | null): Promise<{ message: string; retryAfterSeconds: number } | null> {
  const entitlement = await getEntitlement(userId, email).catch(() => null);
  const limit = aiDailyLimit(entitlement);
  if (!Number.isFinite(limit)) return null;
  const result = await checkSharedRateLimit(`ai-day:${userId}:${istDayKey()}`, limit, 86_400_000);
  if (result.allowed) return null;
  return { message: aiLimitMessage(entitlement?.active ?? false), retryAfterSeconds: result.retryAfterSeconds };
}
