import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { readyEnough } from "./ready";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zooptrack.co.in").replace(/\/+$/, "");

/**
 * After the night run reads a brand in full: email each person who searched
 * it for the FIRST time in the last 72 h ("P-TAL's full ad library is ready").
 * Once per person per brand (kept 9 days). Never throws.
 */
export async function notifyBrandReady(input: { pageId: string; name: string; country: string; systemUserId: string; mailedTonight: Set<string> }): Promise<number> {
  try {
    const db = createGlobalServiceClient();
    const counts = await db
      .from("adspy_source_counts")
      .select("meta_total,collected_ads")
      .eq("platform", "meta")
      .eq("scope_type", "page")
      .eq("scope_key", input.pageId)
      .eq("country", input.country)
      .eq("status_scope", "active")
      .limit(1);
    const row = (counts.data ?? [])[0] as { meta_total: number; collected_ads: number } | undefined;
    if (!row || !readyEnough(Number(row.collected_ads), Number(row.meta_total))) return 0;

    const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const jobs = await db
      .from("ad_intelligence_collection_jobs")
      .select("user_id")
      .eq("platform", "meta")
      .eq("mode", "advertiser")
      .eq("country", input.country)
      .gte("created_at", since)
      // Values are double-quoted so names with dots, commas or apostrophes are safe.
      .or(`collection_key.like."*|page:${input.pageId}",query.ilike."${input.name.replace(/["\\%_*]/g, "")}"`)
      .limit(50);
    const users = new Set(((jobs.data ?? []) as Array<{ user_id: string | null }>).map((j) => j.user_id).filter((id): id is string => Boolean(id) && id !== input.systemUserId));

    // People who track this brand already get alerts and the Monday report.
    const watching = await db.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").eq("advertiser_id", input.pageId).limit(500);
    for (const w of (watching.data ?? []) as Array<{ user_id: string }>) users.delete(w.user_id);

    let sent = 0;
    for (const userId of users) {
      // At most one of these emails per person per night, and once per brand.
      if (input.mailedTonight.has(userId)) continue;
      const onceKey = `ready-mail:${userId}:${input.pageId}:trial`; // ":trial" = kept 9 days by the prune
      const { data: already } = await db.from("rate_limits").select("key").eq("key", onceKey).limit(1);
      if (already?.length) continue;
      const { data } = await db.auth.admin.getUserById(userId);
      const email = data.user?.email;
      if (!email) continue;
      const url = `${SITE}/today/brand/${encodeURIComponent(input.pageId)}`;
      const name = escapeHtml(input.name);
      const n = Number(row.collected_ads).toLocaleString("en-IN");
      const res = await sendEmail({
        to: email,
        subject: `${input.name}'s full ad library is ready`,
        text: `We've now read all of ${input.name}'s live Meta ads (${n}). See them here: ${url}`,
        html: `<p>We've now read all of <strong>${name}</strong>'s live Meta ads (${n}), including how long each one has been running.</p><p><a href="${url}">See ${name}'s ads on Zooptrack</a></p><p style="color:#666">You're getting this because you searched ${name} on Zooptrack.</p>`,
      });
      if (res.sent) {
        sent += 1;
        input.mailedTonight.add(userId);
        // Recorded only after a successful send, so a failed send is retried next night.
        await checkSharedRateLimit(onceKey, 1, 9 * 86_400_000).catch(() => undefined);
      }
    }
    return sent;
  } catch {
    return 0;
  }
}
