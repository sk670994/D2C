import { NextResponse } from "next/server";
import type { CalculatedReport } from "@/lib/types/domain";
import { generateInsights } from "@/lib/llm/insights";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { takeAiCall } from "@/lib/ai/limits-server";

type RequestBody = CalculatedReport & {
  adMetrics?: unknown;
};

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    // Create authenticated Supabase server client
    const authClient = await createServerAuthClient();

    // Check logged-in user
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Burst guard, then the daily AI allowance by plan (shared with ZWIRK).
    const burst = await checkSharedRateLimit(`insights:${user.id}`, 10, 600_000);
    if (!burst.allowed) {
      return NextResponse.json(
        { error: "Too many insight requests. Try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
      );
    }
    const aiBlock = await takeAiCall(user.id, user.email ?? null);
    if (aiBlock) {
      return NextResponse.json(
        { error: aiBlock.message, code: "ai_daily_limit" },
        { status: 429, headers: { "Retry-After": String(aiBlock.retryAfterSeconds) } }
      );
    }

    // Parse request body
    const body = (await request.json()) as RequestBody;

    // Only accept adMetrics when it is actually an array
    const incomingMetrics = Array.isArray(body.adMetrics)
      ? body.adMetrics
      : [];

    let metrics: any[] = incomingMetrics;

    // If frontend did not provide ad metrics,
    // fetch them from Supabase.
    if (metrics.length === 0) {
      const { data: fetchedMetrics, error: metricsError } =
        await authClient
          .from("ad_metrics")
          .select("*")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(100);

      if (metricsError) {
        console.error(
          "[api/insights] Failed to fetch ad_metrics:",
          metricsError
        );

        // Don't crash the entire insights request.
        metrics = [];
      } else {
        metrics = Array.isArray(fetchedMetrics)
          ? fetchedMetrics
          : [];
      }
    }

    // Generate AI/fallback insights
    const insights = await generateInsights(
      body as CalculatedReport,
      metrics
    );

    return NextResponse.json(insights);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Insights error";

    console.error("[api/insights] Error:", error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    console.info(
      `[api/insights] completed in ${Date.now() - startedAt}ms`
    );
  }
}