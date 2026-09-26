import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";
import { pickPageForName } from "@/lib/brand-vault/signals";

export const runtime = "nodejs";

async function resolvePageId(name: string, country: string) {
  const { data, error } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
    p_query: name,
    p_platform: "meta",
    p_country: country,
    p_limit: 12,
  });
  if (error || !Array.isArray(data)) return null;
  // Exact match, or one unambiguous prefix match. Otherwise the user must pick the Page ID.
  return pickPageForName(name, data as Array<{ page_id?: string | null; label?: string | null }>);
}

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const slot = Number(body?.slot);
  const name = String(body?.name ?? "").trim().slice(0, 160);
  if (![1, 2, 3].includes(slot) || !name) return NextResponse.json({ success: false, error: "Competitor slot and name are required." }, { status: 400 });

  const countryRaw = String(body?.country ?? "IN").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "IN";
  const suppliedPageId = body?.advertiserPageId ? String(body.advertiserPageId).trim().replace(/\D/g, "").slice(0, 30) : null;
  const resolvedPageId = suppliedPageId || await resolvePageId(name, country);
  const payload = {
    user_id: user.id, slot, name,
    domain: body?.domain ? String(body.domain).trim().slice(0, 240) : null,
    advertiser_page_id: resolvedPageId,
    country, platform: "meta" as const,
  };

  const { data, error } = await auth.from("brand_vault_competitors").upsert(payload, { onConflict: "user_id,slot" }).select("id,slot,name,domain,advertiser_page_id,country,platform,created_at,updated_at").single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ success: false, error: "This Meta page is already one of your competitors." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

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
