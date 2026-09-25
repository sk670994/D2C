import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const slot = Number(body?.slot);
  const name = String(body?.name ?? "").trim().slice(0, 160);
  if (![1, 2, 3].includes(slot) || !name) return NextResponse.json({ success: false, error: "Competitor slot and name are required." }, { status: 400 });
  const payload = {
    user_id: user.id, slot, name,
    domain: body?.domain ? String(body.domain).trim().slice(0, 240) : null,
    advertiser_page_id: body?.advertiserPageId ? String(body.advertiserPageId).trim().replace(/\D/g, "").slice(0, 30) : null,
    country: String(body?.country ?? "IN").trim().toUpperCase().slice(0, 2), platform: "meta",
  };
  const { data, error } = await auth.from("brand_vault_competitors").upsert(payload, { onConflict: "user_id,slot" }).select("id,slot,name,domain,advertiser_page_id,country,platform,created_at,updated_at").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, competitor: data });
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
