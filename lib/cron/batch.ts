import "server-only";

import { after } from "next/server";

export { runUserBatch } from "./user-batch";

/**
 * Cron entry: answer 202 at once and do the slice in after(); when users are
 * left, kick the next slice (which also answers 202 at once, so the kick
 * returns in milliseconds). ?wait=1 runs inline and returns the counts.
 */
export async function runCronSlices<T extends Record<string, unknown>>(
  requestUrl: string,
  slice: (offset: number, deadlineAt: number) => Promise<T & { nextOffset: number | null }>,
  budgetMs = 40_000,
): Promise<Response> {
  const url = new URL(requestUrl);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const runSlice = async () => {
    const result = await slice(offset, Date.now() + budgetMs);
    if (result.nextOffset !== null) await kickNext(url, result.nextOffset);
    return result;
  };
  if (url.searchParams.get("wait") === "1") return Response.json({ ok: true, offset, ...(await runSlice()) });
  after(() => runSlice().then(() => undefined, (error) => console.error("[cron slice] failed", error instanceof Error ? error.message : error)));
  return Response.json({ ok: true, accepted: true, offset }, { status: 202 });
}

async function kickNext(url: URL, nextOffset: number) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const next = new URL(url);
  // Use the canonical host (www): a redirect from the apex would drop the Authorization header.
  const canonical = process.env.ADSPY_DRAIN_URL?.trim();
  if (canonical) {
    try {
      next.host = new URL(canonical).host;
      next.protocol = "https:";
    } catch {
      // keep the request's own host
    }
  }
  next.searchParams.set("offset", String(nextOffset));
  next.searchParams.delete("wait");
  await fetch(next, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
