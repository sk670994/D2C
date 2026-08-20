import { NextResponse } from "next/server";
import type { CalculatedReport } from "@/lib/types/domain";
import { generateInsights } from "@/lib/llm/insights";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

type RequestBody = CalculatedReport & { adMetrics?: any[] };

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

    const body = (await request.json()) as RequestBody;
    const { adMetrics = [] } = body;

    // If adMetrics not provided, fetch from database
    let metrics: any[] = adMetrics as any[];
    if (metrics.length === 0) {
      const { data: fetchedMetrics } = await authClient
        .from("ad_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(100);

      metrics = (fetchedMetrics as any[]) || [];
    }

    const insights = await generateInsights(body, metrics);
    return NextResponse.json(insights);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insights error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.info(`[api/insights] completed in ${Date.now() - startedAt}ms`);
  }
}
