import { NextResponse } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A health check must be the cheapest request in the app: never hang.
export const maxDuration = 10;

const DB_TIMEOUT_MS = 2_500;
const SLOW_MS = 1_000;

/** healthy (fast DB) · degraded (slow DB, 200) · unhealthy (DB down or > 2.5 s, 503). */
export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await createGlobalServiceClient()
      .from("ad_intelligence_brands")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    const latencyMs = Date.now() - startedAt;
    if (error) {
      return NextResponse.json({ ok: false, status: "unhealthy", db: "error", latencyMs }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const status = latencyMs > SLOW_MS ? "degraded" : "healthy";
    return NextResponse.json({ ok: true, status, db: "reachable", latencyMs }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, status: "unhealthy", db: "timeout", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
