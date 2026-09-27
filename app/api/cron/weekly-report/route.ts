import { NextRequest } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_USERS_PER_RUN = 100;

/**
 * Monday rival report. Vercel Cron calls this with CRON_SECRET.
 * Sends through Resend when RESEND_API_KEY and REPORT_FROM_EMAIL are set
 * (e.g. "Zooptrack <reports@zooptrack.co.in>"); otherwise it only counts
 * what it would send (dry run), so it is safe to deploy before email is set up.
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

  const [watch, vault] = await Promise.all([
    service.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").limit(5000),
    service.from("brand_vault_competitors").select("user_id").limit(5000),
  ]);
  const userIds = Array.from(
    new Set([...(watch.data ?? []), ...(vault.error ? [] : vault.data ?? [])].map((row) => String((row as { user_id: unknown }).user_id))),
  ).slice(0, MAX_USERS_PER_RUN);

  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const today = await getToday(userId);
      if (!today.moves.length) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        sent += 1;
        continue;
      }
      const { data: userData } = await service.auth.admin.getUserById(userId);
      const to = userData?.user?.email;
      if (!to) {
        skipped += 1;
        continue;
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
      });
      if (response.ok) sent += 1;
      else {
        failed += 1;
        console.warn("[Weekly report] send failed", response.status, await response.text().catch(() => ""));
      }
    } catch (error) {
      failed += 1;
      console.error("[Weekly report] user failed", error instanceof Error ? error.message : error);
    }
  }

  return Response.json({ success: true, dryRun, users: userIds.length, sent, skipped, failed });
}
