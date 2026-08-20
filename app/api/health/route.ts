import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerAuthClient();
    const {
      data: { user },
      error: userError    
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error: dbError } = await supabase
      .from("monthly_records")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (dbError) {
      return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email ?? "" },
      db: "reachable"
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
