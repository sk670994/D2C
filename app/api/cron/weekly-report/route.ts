import { NextRequest } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { getEntitlement } from "@/lib/billing/server";
import { runCronSlices, runUserBatch } from "@/lib/cron/batch";
import { getToday } from "@/lib/today/load";
import { renderReportEmail, reportSubject } from "@/lib/today/report-email";
import { loadReportPrefs } from "@/lib/today/report-prefs-store";
import { MAX_REPORT_SEND_ATTEMPTS, failKey, failureCount, reportSettled, skipKey } from "@/lib/today/report-delivery";
import { dueReportKey } from "@/lib/today/report-schedule";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rival report, on each user's own schedule (daily or weekly, day + hour IST,
 * or off; set on /today/report). Called every 15 min (05:30-23:15 IST) by the
 * GitHub report-tick workflow; each run sends only the reports that are due and
 * not yet sent for that period. A report is claimed in alert_deliveries before
 * it is sent, so overlapping runs never double-send; a failed send releases the
 * claim and is retried by a later tick, up to MAX_REPORT_SEND_ATTEMPTS. Sends through Resend when RESEND_API_KEY and
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

  const candidates = await loadCandidates(service);

  // Who is due right now, and which of those are already settled for this period
  // (sent/claimed, skipped, or out of retries).
  const prefs = await loadReportPrefs(candidates);
  const dueKey = new Map<string, string>();
  for (const id of candidates) {
    const key = dueReportKey(prefs.get(id)!, now);
    if (key) dueKey.set(id, key);
  }
  // Stable list across slices: settled users are skipped inside work(), not
  // removed here, so ?offset= keeps pointing at the same users.
  const userIds = Array.from(dueKey.keys());
  const knownKeys = new Map<string, Set<string>>();
  // Only this period's rows (at most one daily and one weekly key per tick), not every past report.
  for (const periodKey of new Set(dueKey.values())) {
    const ids = userIds.filter((id) => dueKey.get(id) === periodKey);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await service
        .from("alert_deliveries")
        .select("user_id,alert_key")
        .in("user_id", ids.slice(i, i + 500))
        .like("alert_key", `${periodKey}%`);
      for (const row of (data ?? []) as Array<{ user_id: string; alert_key: string }>) {
        const id = String(row.user_id);
        if (!knownKeys.has(id)) knownKeys.set(id, new Set());
        knownKeys.get(id)!.add(row.alert_key);
      }
    }
  }
  const pending = userIds.filter((id) => !reportSettled(knownKeys.get(id) ?? [], dueKey.get(id)!)).length;
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
        if (reportSettled(knownKeys.get(userId) ?? [], deliveryKey)) return;
        let claimed = false;
        try {
          const { data: owner } = await service.auth.admin.getUserById(userId);
          const to = owner?.user?.email ?? null;
          // Only accounts with a running trial or plan get the report.
          if (!to || !(await getEntitlement(userId, to)).active) {
            skipped += 1;
            // Record the skip so later ticks in this period do not re-check this user.
            if (!dryRun) {
              await service
                .from("alert_deliveries")
                .upsert({ user_id: userId, alert_key: skipKey(deliveryKey) }, { onConflict: "user_id,alert_key", ignoreDuplicates: true });
            }
            return;
          }
          if (!dryRun) {
            // Claim before sending: only the run that inserts the row sends, so two
            // overlapping ticks can never both email the same report.
            const { data: claim, error: claimError } = await service
              .from("alert_deliveries")
              .upsert({ user_id: userId, alert_key: deliveryKey }, { onConflict: "user_id,alert_key", ignoreDuplicates: true })
              .select("user_id");
            if (claimError) throw new Error(`claim failed: ${claimError.message}`);
            if (!claim?.length) return; // another run has it
            claimed = true;
          }
          const today = await getToday(userId);
          if (!today.moves.length) {
            // Nothing to report this period: the claim row stays, so later runs skip this user.
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
          if (!response.ok) {
            throw new Error(`send failed ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
          }
          sent += 1;
        } catch (error) {
          failed += 1;
          console.error("[Report] user failed", error instanceof Error ? error.message : error);
          if (claimed) await releaseClaim(service, userId, deliveryKey);
        }
      },
    });
    return { success: true, dryRun, candidates: candidates.length, due: pending, sent, skipped, failed, nextOffset };
  });
}

type ServiceClient = ReturnType<typeof createGlobalServiceClient>;

/** Users who track at least one rival (SQL DISTINCT; old two-table read as fallback). */
async function loadCandidates(service: ServiceClient): Promise<string[]> {
  const rpc = await service.rpc("report_candidate_user_ids");
  if (!rpc.error) {
    return Array.from(new Set(((rpc.data ?? []) as Array<{ user_id: unknown }>).map((row) => String(row.user_id))));
  }
  if (rpc.error.code !== "PGRST202") console.warn("[Report] report_candidate_user_ids failed", rpc.error.message);
  const [watch, vault] = await Promise.all([
    service.from("adspy_advertiser_watchlists").select("user_id").eq("platform", "meta").limit(20000),
    service.from("brand_vault_competitors").select("user_id").limit(20000),
  ]);
  return Array.from(
    new Set([...(watch.data ?? []), ...(vault.error ? [] : vault.data ?? [])].map((row) => String((row as { user_id: unknown }).user_id))),
  );
}

/** After a failed send: count the failure and free the claim so a later tick retries (until the cap). */
async function releaseClaim(service: ServiceClient, userId: string, deliveryKey: string) {
  try {
    const { data } = await service
      .from("alert_deliveries")
      .select("alert_key")
      .eq("user_id", userId)
      .like("alert_key", `${deliveryKey}:fail:%`);
    const attempt = failureCount(((data ?? []) as Array<{ alert_key: string }>).map((r) => r.alert_key), deliveryKey) + 1;
    await service
      .from("alert_deliveries")
      .upsert({ user_id: userId, alert_key: failKey(deliveryKey, attempt) }, { onConflict: "user_id,alert_key", ignoreDuplicates: true });
    if (attempt < MAX_REPORT_SEND_ATTEMPTS) {
      await service.from("alert_deliveries").delete().eq("user_id", userId).eq("alert_key", deliveryKey);
    } else {
      console.warn(`[Report] giving up on ${deliveryKey} after ${attempt} failed sends`);
    }
  } catch (error) {
    console.error("[Report] release claim failed", error instanceof Error ? error.message : error);
  }
}
