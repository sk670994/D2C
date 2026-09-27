import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { normalizeDecoded } from "@/lib/decode/taxonomy";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** AI labels for one ad (by creative row id), or decoded:null when not labelled yet. */
export async function GET(_request: Request, context: { params: Promise<{ creativeId: string }> }) {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { creativeId } = await context.params;
  if (!UUID.test(creativeId)) return NextResponse.json({ success: true, decoded: null });

  const { data, error } = await createGlobalServiceClient()
    .from("ad_creative_decodes")
    .select("elements,model,decoded_at,status")
    .eq("creative_id", creativeId)
    .maybeSingle();
  if (error || !data || data.status !== "done") return NextResponse.json({ success: true, decoded: null });
  return NextResponse.json({
    success: true,
    decoded: normalizeDecoded(data.elements),
    model: data.model,
    decodedAt: data.decoded_at,
  });
}
