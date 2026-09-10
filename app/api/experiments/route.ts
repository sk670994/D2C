import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set(["draft", "running", "won", "lost", "paused"]);

async function getUser() {
  const client = await createServerAuthClient();
  const { data: { user } } = await client.auth.getUser();
  return { client, user };
}

export async function GET() {
  const { client, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await client
    .from("experiments")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Unable to load experiments" }, { status: 500 });
  return NextResponse.json({ experiments: data ?? [] });
}

export async function POST(request: Request) {
  const { client, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const required = ["hypothesis", "control", "variant", "primary_metric"];
  if (!body || required.some((key) => typeof body[key] !== "string" || !(body[key] as string).trim())) {
    return NextResponse.json({ error: "hypothesis, control, variant and primary_metric are required" }, { status: 400 });
  }

  const status = typeof body.status === "string" && statuses.has(body.status) ? body.status : "draft";
  const durationDays = typeof body.duration_days === "number" && Number.isInteger(body.duration_days)
    ? body.duration_days
    : null;

  const { data, error } = await client.from("experiments").insert({
    user_id: user.id,
    recommendation_id: typeof body.recommendation_id === "string" ? body.recommendation_id : null,
    hypothesis: (body.hypothesis as string).trim(),
    control: (body.control as string).trim(),
    variant: (body.variant as string).trim(),
    primary_metric: (body.primary_metric as string).trim(),
    guardrail: typeof body.guardrail === "string" ? body.guardrail.trim() : null,
    budget: typeof body.budget === "number" && Number.isFinite(body.budget) ? body.budget : null,
    duration_days: durationDays,
    status,
  }).select("*").single();

  if (error) return NextResponse.json({ error: "Unable to create experiment" }, { status: 500 });
  return NextResponse.json({ experiment: data }, { status: 201 });
}
