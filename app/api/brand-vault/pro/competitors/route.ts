import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";

export const runtime = "nodejs";

function compact(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function resolvePageId(name: string, country: string) {
  const service = createGlobalServiceClient();
  const result = await service.rpc("adspy_autocomplete_advertisers", {
    p_query: name,
    p_platform: "meta",
    p_country: country,
    p_limit: 12,
  });
  if (result.error || !result.data?.length) return null;
  const query = compact(name);
  for (const row of result.data as Array<{ page_id?: string | null; label?: string | null }>) {
    const pageId = String(row.page_id ?? "").trim();
    const label = compact(row.label);
    if (!/^\d+$/.test(pageId) || !query || !label) continue;
    if (label === query || label.startsWith(query) || query.startsWith(label)) return pageId;
  }
  return null;
}

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const slot = Number(body?.slot);
  const name = String(body?.name ?? "").trim().slice(0, 160);
  if (![1, 2, 3].includes(slot) || !name) return NextResponse.json({ success: false, error: "Competitor slot and name are required." }, { status: 400 });

  const country = String(body?.country ?? "IN").trim().toUpperCase().slice(0, 2);
  const suppliedPageId = body?.advertiserPageId ? String(body.advertiserPageId).trim().replace(/\D/g, "").slice(0, 30) : null;
  const resolvedPageId = suppliedPageId || await resolvePageId(name, country);
  const payload = {
    user_id: user.id, slot, name,
    domain: body?.domain ? String(body.domain).trim().slice(0, 240) : null,
    advertiser_page_id: resolvedPageId,
    country, platform: "meta" as const,
  };

  const { data, error } = await auth.from("brand_vault_competitors").upsert(payload, { onConflict: "user_id,slot" }).select("id,slot,name,domain,advertiser_page_id,country,platform,created_at,updated_at").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  let collection = null;
  try {
    collection = await startAdSpyCollection({
      userId: user.id,
      query: name,
      country,
      platform: "meta",
      mode: "advertiser",
      pageId: resolvedPageId,
      minIntervalMs: 10 * 60_000,
      reason: "user",
      depth: "quick",
    });
  } catch (collectionError) {
    console.warn("[BrandVault competitor] collection kickoff failed", name, collectionError);
  }

  return NextResponse.json({
    success: true,
    competitor: data,
    resolvedPageId,
    collection: collection ? { outcome: collection.outcome, dispatched: collection.dispatched, jobId: collection.job.id } : null,
  });
}

export async function DELETE(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ success: false, error: "Competitor id is required." }, { status: 400 });
  const { error } = await auth.from("brand_vault_competitors").delete().eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
