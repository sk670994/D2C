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
  // Freshness: watched brands whose summary was not recomputed in 36 h.
  try {
    const { data: watchRows } = await client.from("adspy_advertiser_watchlists").select("advertiser_id").eq("platform", "meta").limit(2000);
    const watchedIds = Array.from(new Set((watchRows ?? []).map((r: { advertiser_id: unknown }) => String(r.advertiser_id)).filter((id) => /^\d+$/.test(id))));
    if (watchedIds.length) {
      const fresh = new Set<string>();
      const cutoff = new Date(now - 36 * 3_600_000).toISOString();
      for (let i = 0; i < watchedIds.length; i += 200) {
        const { data } = await client.from("adspy_advertiser_summaries").select("advertiser_id").in("advertiser_id", watchedIds.slice(i, i + 200)).gte("computed_at", cutoff);
        for (const row of (data ?? []) as Array<{ advertiser_id: string }>) fresh.add(String(row.advertiser_id));
      }
      snapshot.watchedBrands = watchedIds.length;
      snapshot.staleWatchedBrands = watchedIds.length - fresh.size;
    }
  } catch {
    // freshness is best effort
  }
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

  // AI spend in the last 24 h from the cost ledger (estimate; absent until the table exists).
  let aiSpend24h: Record<string, { calls: number; usd: number }> | null = null;
  const spend = await client.from("ai_calls").select("provider,cost_usd").gte("created_at", since).limit(20000);
  if (!spend.error) {
    aiSpend24h = {};
    for (const row of (spend.data ?? []) as Array<{ provider: string; cost_usd: number | null }>) {
      const p = (aiSpend24h[row.provider] ??= { calls: 0, usd: 0 });
      p.calls += 1;
      p.usd = Math.round((p.usd + Number(row.cost_usd ?? 0)) * 10000) / 10000;
    }
  }

  return NextResponse.json({ ok: issues.length === 0, issues, snapshot, aiSpend24h, alerted: due.map((i) => i.key), email });
}
