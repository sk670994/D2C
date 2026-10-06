import { NextRequest } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getEntitlement } from "@/lib/billing/server";
import { runCronSlices, runUserBatch } from "@/lib/cron/batch";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";
import { loadReportPrefs } from "@/lib/today/report-prefs-store";
import { dueReportKey } from "@/lib/today/report-schedule";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rival report, on each user's own schedule (daily or weekly, day + hour IST,
 * or off; set on /today/report). Called every 30 min by the GitHub ops-health
 * workflow and daily by Vercel Cron; each run sends only the reports that are
 * due and not yet sent for that period (alert_deliveries), so late or repeated
 * runs never double-send. Sends through Resend when RESEND_API_KEY and
 * REPORT_FROM_EMAIL are set; otherwise only counts (dry run). ?dry=1 forces it.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_FROM_EMAIL?.trim();
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zooptrack.co.in").trim();
  const dryRun = !apiKey || !from || request.nextUrl.searchParams.get("dry") === "1";
  const service = createGlobalServiceClient();
  const now = new Date();

  const [watch, vault] = await Promise.all([
    service.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").limit(20000),
    service.from("brand_vault_competitors").select("user_id").limit(20000),
  ]);
  const candidates = Array.from(
    new Set([...(watch.data ?? []), ...(vault.error ? [] : vault.data ?? [])].map((row) => String((row as { user_id: unknown }).user_id))),
  );

  // Who is due right now, and which of those were not sent for this period yet.
  const prefs = await loadReportPrefs(candidates);
  const dueKey = new Map<string, string>();
  for (const id of candidates) {
    const key = dueReportKey(prefs.get(id)!, now);
    if (key) dueKey.set(id, key);
  }
  const dueIds = Array.from(dueKey.keys());
  const sentAlready = new Set<string>();
  for (let i = 0; i < dueIds.length; i += 500) {
    const { data } = await service
      .from("alert_deliveries")
      .select("user_id,alert_key")
      .in("user_id", dueIds.slice(i, i + 500))
      .like("alert_key", "report:%");
    for (const row of (data ?? []) as Array<{ user_id: string; alert_key: string }>) {
      if (dueKey.get(String(row.user_id)) === row.alert_key) sentAlready.add(String(row.user_id));
    }
  }
  const userIds = dueIds.filter((id) => !sentAlready.has(id));
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(now);

  return runCronSlices(request.url, async (offset, deadlineAt) => {
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const { nextOffset } = await runUserBatch({
      userIds,
      offset,
      deadlineAt,
      work: async (userId) => {
        const deliveryKey = dueKey.get(userId)!;
        try {
          const { data: owner } = await service.auth.admin.getUserById(userId);
          const to = owner?.user?.email ?? null;
          // Only accounts with a running trial or plan get the report.
          if (!to || !(await getEntitlement(userId, to)).active) {
            skipped += 1;
            return;
          }
          const today = await getToday(userId);
          if (!today.moves.length) {
            // Nothing to report this period: record it so later runs skip this user.
            skipped += 1;
            if (!dryRun) await service.from("alert_deliveries").upsert({ user_id: userId, alert_key: deliveryKey });
            return;
          }
          if (dryRun) {
            sent += 1;
            return;
          }
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from,
              to: [to],
              subject: reportSubject(today),
              html: renderReportEmail({ headline: today.headline, moves: today.moves, rivals: today.rivals, appUrl, dateLabel }),
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (response.ok) {
            sent += 1;
            await service.from("alert_deliveries").upsert({ user_id: userId, alert_key: deliveryKey });
          } else {
            failed += 1;
            console.warn("[Report] send failed", response.status, await response.text().catch(() => ""));
          }
        } catch (error) {
          failed += 1;
          console.error("[Report] user failed", error instanceof Error ? error.message : error);
        }
      },
    });
    return { success: true, dryRun, candidates: candidates.length, due: userIds.length, sent, skipped, failed, nextOffset };
  });
}
