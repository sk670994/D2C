import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set(["draft", "running", "won", "lost", "paused"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const client = await createServerAuthClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.status === "string" && statuses.has(body.status)) updates.status = body.status;
  if (typeof body.baseline_value === "number" && Number.isFinite(body.baseline_value)) updates.baseline_value = body.baseline_value;
  if (typeof body.result_value === "number" && Number.isFinite(body.result_value)) updates.result_value = body.result_value;
  if (typeof body.outcome_note === "string") updates.outcome_note = body.outcome_note.trim();
  if (body.status === "running") updates.started_at = new Date().toISOString();
  if (["won", "lost", "paused"].includes(String(body.status))) updates.ended_at = new Date().toISOString();

  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid updates supplied" }, { status: 400 });

  const { data, error } = await client
    .from("experiments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Experiment not found or update failed" }, { status: 404 });
  return NextResponse.json({ experiment: data });
}
