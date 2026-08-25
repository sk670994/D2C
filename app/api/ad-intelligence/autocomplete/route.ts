import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { autocompleteBrands } from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ success: true, suggestions: [] });
    return NextResponse.json({ success: true, suggestions: await autocompleteBrands({ query: q, limit: 8 }) });
  } catch (error) {
    return NextResponse.json({ success: true, suggestions: [], warning: error instanceof Error ? error.message : "Autocomplete unavailable" });
  }
}
