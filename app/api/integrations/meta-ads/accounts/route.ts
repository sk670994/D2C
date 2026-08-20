import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

function isMissingSupabaseTable(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" || error?.message?.includes("Could not find the table");
}

// GET: List connected Meta ad accounts for the user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: accounts, error } = await supabase
      .from("ad_accounts")
      .select("id, account_id, account_name, platform, created_at")
      .eq("user_id", user.id)
      .eq("platform", "meta");

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return NextResponse.json({
          accounts: [],
          setupRequired: true,
          message: "Run supabase-ad-integrations-migration.sql in Supabase to enable ad accounts."
        });
      }

      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }

    return NextResponse.json({ accounts });

  } catch (error) {
    console.error("Meta accounts error:", error);
    return NextResponse.json({ error: "Failed to fetch Meta accounts" }, { status: 500 });
  }
}
