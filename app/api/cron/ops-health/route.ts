import { NextRequest, NextResponse } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { evaluateOps, shouldSendAlert, type OpsSnapshot } from "@/lib/ops/health";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Pipeline health check. Called every 30 min by GitHub Actions (ops-health.yml)
 * and daily by Vercel Cron, both with CRON_SECRET. Emails OPS_ALERT_EMAIL
 * (at most once per issue every 3 h). ?dry=1 checks without emailing.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const client = createGlobalServiceClient();
  const now = Date.now();
  const since = new Date(now - 86_400_000).toISOString();

  const [ops, done, failed] = await Promise.all([
    client.from("adspy_ops_status").select("*").maybeSingle(),
    client.from("ad_creative_decodes").select("creative_id", { count: "exact", head: true }).eq("status", "done").gte("decoded_at", since),
    client.from("ad_creative_decodes").select("creative_id", { count: "exact", head: true }).eq("status", "failed").gte("decoded_at", since),
  ]);
  if (ops.error) return NextResponse.json({ ok: false, error: ops.error.message }, { status: 500 });
  const o = (ops.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

  const snapshot: OpsSnapshot = {
    now,
    lastWorkerHeartbeat: (o.last_worker_heartbeat as string | null) ?? null,
    liveWorkers: num(o.live_workers),
    waitingRequests: num(o.waiting_requests),
    oldestWaitingSec: o.oldest_waiting_sec === null || o.oldest_waiting_sec === undefined ? null : Number(o.oldest_waiting_sec),
    failed24h: num(o.failed_24h),
    completed24h: num(o.completed_24h),
    decodesDone24h: done.count ?? 0,
    decodesFailed24h: failed.count ?? 0,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    serverlessCollector: process.env.ADSPY_COLLECTOR === "searchapi",
  };
  const issues = evaluateOps(snapshot);
  const to = process.env.OPS_ALERT_EMAIL?.trim();
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const due: typeof issues = [];
  if (issues.length && to && !dry) {
    const { data: sentRows } = await client.from("ops_alerts").select("alert_key,last_sent_at").in("alert_key", issues.map((i) => i.key));
    const last = new Map<string, string>((sentRows ?? []).map((r: { alert_key: string; last_sent_at: string }) => [String(r.alert_key), String(r.last_sent_at)] as [string, string]));
    for (const issue of issues) if (shouldSendAlert(last.get(issue.key), now)) due.push(issue);
  }

  let email: Awaited<ReturnType<typeof sendEmail>> | null = null;
  if (due.length && to) {
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Zooptrack needs attention</h2>
      ${due
        .map(
          (i) => `<div style="border:1px solid #e2ded4;border-radius:12px;padding:14px;margin:10px 0">
        <strong style="color:${i.severity === "critical" ? "#8f1d1d" : "#8a3a0b"}">${escapeHtml(i.title)}</strong>
        <p style="margin:6px 0">${escapeHtml(i.detail)}</p><p style="margin:0;color:#3a3e49"><b>Fix:</b> ${escapeHtml(i.fix)}</p></div>`,
        )
        .join("")}
      <p style="color:#5b6070;font-size:13px">Sent by the ops-health check. The same issue is repeated at most every 3 hours.</p></div>`;
    email = await sendEmail({ to, subject: `Zooptrack alert: ${due.map((i) => i.title).join(" · ")}`, html });
    if (email.sent) {
      await client.from("ops_alerts").upsert(due.map((i) => ({ alert_key: i.key, last_sent_at: new Date(now).toISOString(), detail: i.detail })));
    }
  }

  return NextResponse.json({ ok: issues.length === 0, issues, snapshot, alerted: due.map((i) => i.key), email });
}
