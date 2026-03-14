import { NextResponse } from "next/server";
import type { CalculatedReport } from "@/lib/types/domain";
import { generateInsights } from "@/lib/llm/insights";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CalculatedReport;
    const insights = await generateInsights(body);
    return NextResponse.json(insights);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insights error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.info(`[api/insights] completed in ${Date.now() - startedAt}ms`);
  }
}
