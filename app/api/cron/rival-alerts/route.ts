import { NextRequest, NextResponse } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getEntitlement } from "@/lib/billing/server";
import { sendEmail } from "@/lib/email/send";
import { alertKey, alertsToSend, alertSubject, isoWeek } from "@/lib/today/alerts";
import { getToday } from "@/lib/today/load";
import { renderReportEmail } from "@/lib/today/report-email";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_USERS_PER_RUN = 100;

/**
 * Daily 8 AM IST: email users when a watched rival makes a big move
 * (once per rival per week). Only for plans with alerts. CRON_SECRET; ?dry=1.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.zooptrack.co.in").trim();
  const service = createGlobalServiceClient();
  const week = isoWeek(new Date());
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());

  const { data: watchRows } = await service.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").limit(5000);
  const userIds: string[] = Array.from(new Set<string>((watchRows ?? []).map((r: { user_id: unknown }) => String(r.user_id)))).slice(0, MAX_USERS_PER_RUN);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      const { data: userData } = await service.auth.admin.getUserById(userId);
      const email = userData?.user?.email ?? null;
      const entitlement = await getEntitlement(userId, email);
      if (!entitlement.alerts || !email) {
        skipped += 1;
        continue;
      }
      const today = await getToday(userId);
      const { data: sentRows } = await service.from("alert_deliveries").select("alert_key").eq("user_id", userId).like("alert_key", `%:${week}`);
      const already = new Set<string>((sentRows ?? []).map((r: { alert_key: unknown }) => String(r.alert_key)));
      const fresh = alertsToSend(today.moves, already, week);
      if (!fresh.length) {
        skipped += 1;
        continue;
      }
      if (dry) {
        sent += 1;
        continue;
      }
      const result = await sendEmail({
        to: email,
        subject: alertSubject(fresh),
        html: renderReportEmail({ headline: alertSubject(fresh), moves: fresh, rivals: today.rivals, appUrl, dateLabel }),
      });
      if (result.sent) {
        sent += 1;
        await service.from("alert_deliveries").upsert(fresh.map((m) => ({ user_id: userId, alert_key: alertKey(m, week) })));
      } else if (result.skipped) {
        skipped += 1;
      } else {
        failed += 1;
        console.warn("[Rival alerts] send failed", result.error);
      }
    } catch (error) {
      failed += 1;
      console.error("[Rival alerts] user failed", error instanceof Error ? error.message : error);
    }
  }
  return NextResponse.json({ ok: true, week, users: userIds.length, sent, skipped, failed, dryRun: dry });
}
