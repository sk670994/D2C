import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase();
    if (!adminEmail || user.email?.toLowerCase() !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const serviceUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    if (!serviceUrl || !serviceKey) {
      return NextResponse.json({ error: "Missing service role env" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const email = (searchParams.get("email") ?? "").trim().toLowerCase();
    const limitParam = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    const service = createServiceClient(serviceUrl, serviceKey);

    let profileQuery = service
      .from("user_profiles")
      .select("user_id,user_email,full_name,phone,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (email) {
      profileQuery = profileQuery.eq("user_email", email);
    }

    const { data: profiles, error: profileError } = await profileQuery;
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const userIds = (profiles ?? []).map((p) => p.user_id);
    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const { data: workspaces, error: workspaceError } = await service
      .from("user_workspaces")
      .select("user_id,user_email,month_key,updated_at")
      .in("user_id", userIds);
    if (workspaceError) {
      return NextResponse.json({ error: workspaceError.message }, { status: 500 });
    }

    const { data: scenarioCounts, error: scenarioError } = await service
      .from("user_workspaces")
      .select("user_id,scenarios")
      .in("user_id", userIds);
    if (scenarioError) {
      return NextResponse.json({ error: scenarioError.message }, { status: 500 });
    }

    const workspaceByUser = new Map((workspaces ?? []).map((w) => [w.user_id, w]));
    const scenarioCountByUser = new Map(
      (scenarioCounts ?? []).map((row) => [row.user_id, Array.isArray(row.scenarios) ? row.scenarios.length : 0])
    );

    const users = (profiles ?? []).map((profile) => {
      const workspace = workspaceByUser.get(profile.user_id);
      return {
        ...profile,
        workspace_updated_at: workspace?.updated_at ?? null,
        active_month_key: workspace?.month_key ?? null,
        scenario_count: scenarioCountByUser.get(profile.user_id) ?? 0
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
