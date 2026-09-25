import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const actionType = body?.actionType === "brief" || body?.actionType === "alert" ? body.actionType : "save";
  const referenceKey = String(body?.referenceKey ?? "").trim().slice(0, 180);
  const title = String(body?.title ?? "Saved intelligence").trim().slice(0, 240);
  if (!referenceKey || !title) return NextResponse.json({ success: false, error: "referenceKey and title are required." }, { status: 400 });
  const { data, error } = await auth.from("brand_vault_saved_actions").upsert({ user_id: user.id, action_type: actionType, reference_key: referenceKey, title, payload: body?.payload && typeof body.payload === "object" ? body.payload : {} }, { onConflict: "user_id,reference_key" }).select("id,action_type,reference_key,title,payload,created_at").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, action: data });
}

export async function DELETE(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const referenceKey = String(body?.referenceKey ?? "").trim();
  if (!referenceKey) return NextResponse.json({ success: false, error: "referenceKey is required." }, { status: 400 });
  const { error } = await auth.from("brand_vault_saved_actions").delete().eq("user_id", user.id).eq("reference_key", referenceKey);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
