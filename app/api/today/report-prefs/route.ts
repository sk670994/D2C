import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getReportPrefs, saveReportPrefs } from "@/lib/today/report-prefs-store";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, prefs: await getReportPrefs(id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const id = await userId();
  if (!id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json({ success: true, prefs: await saveReportPrefs(id, body) });
  } catch (error) {
    console.error("[report-prefs] save failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not save. Try again." }, { status: 500 });
  }
}
