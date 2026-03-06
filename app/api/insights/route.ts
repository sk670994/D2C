import { NextResponse } from "next/server";
import type { CalculatedReport } from "@/lib/types/domain";
import { generateInsights } from "@/lib/llm/insights";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
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
