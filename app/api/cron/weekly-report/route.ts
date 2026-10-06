import { NextRequest } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getEntitlement } from "@/lib/billing/server";
import { runCronSlices, runUserBatch } from "@/lib/cron/batch";
import { isoWeek } from "@/lib/today/alerts";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monday rival report. Vercel Cron calls this with CRON_SECRET.
 * Sends through Resend when RESEND_API_KEY and REPORT_FROM_EMAIL are set
 * (e.g. "Zooptrack <reports@zooptrack.co.in>"); otherwise it only counts
 * what it would send (dry run), so it is safe to deploy before email is set up.
 * Works in 40 s slices that chain themselves, so any number of users fits;
 * each user gets at most one report per week (alert_deliveries).
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
  const week = isoWeek(new Date());

  const [watch, vault] = await Promise.all([
    service.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").limit(20000),
    service.from("brand_vault_competitors").select("user_id").limit(20000),
  ]);
  const userIds = Array.from(
    new Set([...(watch.data ?? []), ...(vault.error ? [] : vault.data ?? [])].map((row) => String((row as { user_id: unknown }).user_id))),
  );
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());

  return runCronSlices(request.url, async (offset, deadlineAt) => {
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const { nextOffset } = await runUserBatch({
      userIds,
      offset,
      deadlineAt,
      work: async (userId) => {
        try {
          const deliveryKey = `weekly-report:${week}`;
          const { data: done } = await service.from("alert_deliveries").select("alert_key").eq("user_id", userId).eq("alert_key", deliveryKey).maybeSingle();
          if (done) {
            skipped += 1;
            return;
          }
          const { data: owner } = await service.auth.admin.getUserById(userId);
          const to = owner?.user?.email ?? null;
          // Only accounts with a running trial or plan get the report.
          if (!to || !(await getEntitlement(userId, to)).active) {
            skipped += 1;
            return;
          }
          const today = await getToday(userId);
          if (!today.moves.length) {
            skipped += 1;
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
            console.warn("[Weekly report] send failed", response.status, await response.text().catch(() => ""));
          }
        } catch (error) {
          failed += 1;
          console.error("[Weekly report] user failed", error instanceof Error ? error.message : error);
        }
      },
    });
    return { success: true, dryRun, users: userIds.length, sent, skipped, failed, nextOffset };
  });
}
